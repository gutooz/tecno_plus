import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import ExcelJS from 'exceljs';
import { FilterQuery, Model } from 'mongoose';
import { ProductStatus } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { QueueService } from '../queues/queue.service';

export interface ListProductsQuery {
  ownerId: string;
  search?: string;
  status?: ProductStatus;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/** Grava `value` em `obj` seguindo `path`, criando objetos intermediários se faltarem. */
function setDeep(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let node = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly model: Model<ProductDocument>,
    private readonly queue: QueueService,
  ) {}

  async list(q: ListProductsQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const filter: FilterQuery<ProductDocument> = { ownerId: q.ownerId };
    if (q.status) {
      filter.status = q.status;
    } else {
      // Rascunhos (foto enviada, aguardando título/preço no Envio em Lote) só
      // aparecem no catálogo depois de confirmados — por padrão ficam de fora.
      filter.status = { $ne: ProductStatus.UPLOADED };
    }
    if (q.search) filter.$text = { $search: q.search };

    const sort: Record<string, 1 | -1> = {
      [q.sortBy ?? 'createdAt']: q.sortDir === 'asc' ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findById(ownerId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, ownerId }).lean();
    if (!doc) throw new NotFoundException('Produto não encontrado');
    return doc;
  }

  async update(ownerId: string, id: string, patch: Record<string, unknown>) {
    // O frontend envia patches com chaves em notação de ponto (ex.: 'pricing.purchasePrice').
    // Um $set direto em 'pricing.x' falha no Mongo quando o subdocumento pai é null — que é
    // o default do schema para produtos recém-enviados (status UPLOADED):
    //   MongoServerError 28: "Cannot create field 'x' in element {pricing: null}".
    // Por isso expandimos as chaves e gravamos o objeto pai INTEIRO, semeado com o valor
    // atual: assim null vira objeto e nenhum campo já existente é perdido.
    const current = await this.model.findOne({ _id: id, ownerId }).lean();
    if (!current) throw new NotFoundException('Produto não encontrado');

    const $set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!key.includes('.')) {
        $set[key] = value;
        continue;
      }
      const [root, ...rest] = key.split('.');
      const base =
        ($set[root] as Record<string, unknown> | undefined) ??
        ((current as Record<string, unknown>)[root] as Record<string, unknown> | null) ??
        {};
      setDeep(base, rest, value);
      $set[root] = base;
    }

    const doc = await this.model
      .findOneAndUpdate({ _id: id, ownerId }, { $set }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Produto não encontrado');
    return doc;
  }

  async remove(ownerId: string, id: string) {
    const res = await this.model.deleteOne({ _id: id, ownerId });
    if (res.deletedCount === 0) throw new NotFoundException('Produto não encontrado');
    return { deleted: true };
  }

  async duplicate(ownerId: string, id: string) {
    const source = await this.findById(ownerId, id);
    const { _id, createdAt, updatedAt, ...rest } = source as Record<string, unknown>;
    void _id;
    void createdAt;
    void updatedAt;
    const copy = await this.model.create({
      ...rest,
      status: ProductStatus.DRAFT,
      internalSku: `${(rest as { internalSku: string }).internalSku}-COPY`,
    });
    return copy.toObject();
  }

  async startPipeline(ownerId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, ownerId });
    if (!doc) throw new NotFoundException('Produto nÃ£o encontrado');
    await this.queue.startPipeline({ productId: id, ownerId });
    return { queued: true };
  }

  async countsByStatus(ownerId: string) {
    const rows = await this.model.aggregate<{ _id: string; count: number }>([
      { $match: { ownerId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return rows.reduce<Record<string, number>>((acc, r) => ((acc[r._id] = r.count), acc), {});
  }

  async exportShopee(ownerId: string, ids?: string[]) {
    const filter: FilterQuery<ProductDocument> = { ownerId };
    if (ids?.length) filter._id = { $in: ids };

    const products = await this.model.find(filter).sort({ createdAt: -1 }).lean();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Tecno Plus';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Shopee');
    sheet.columns = [
      { header: 'Nome do Produto', key: 'name', width: 42 },
      { header: 'Descricao do Produto', key: 'description', width: 62 },
      { header: 'Categoria', key: 'category', width: 24 },
      { header: 'SKU', key: 'sku', width: 22 },
      { header: 'Preco', key: 'price', width: 14 },
      { header: 'Estoque', key: 'stock', width: 12 },
      { header: 'Imagem Principal', key: 'image1', width: 62 },
      { header: 'Imagem HD', key: 'image2', width: 62 },
      { header: 'Imagem Original', key: 'image3', width: 62 },
      { header: 'Preco de Custo', key: 'purchasePrice', width: 16 },
      { header: 'Lucro Estimado', key: 'profit', width: 16 },
      { header: 'Observacoes', key: 'notes', width: 34 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEE4D2D' },
    };

    for (const product of products) {
      const vision = (product.vision ?? {}) as Record<string, unknown>;
      const content = (product.content ?? {}) as Record<string, unknown>;
      const pricing = (product.pricing ?? {}) as Record<string, unknown>;
      const images = (product.images ?? {}) as Record<string, unknown>;

      const title = String(content.title ?? vision.name ?? product.internalSku);
      const description = String(
        content.marketplaceDescription ?? content.description ?? vision.shortDescription ?? title,
      );
      const salePrice = Number(pricing.suggestedPrice ?? 0);
      const purchasePrice = Number(pricing.purchasePrice ?? 0);
      // Prioriza as 3 imagens Shopee (produto recortado em fundo limpo); se ainda
      // não existirem, cai nas variantes antigas.
      const shopee = Array.isArray(images.shopee) ? (images.shopee as string[]) : [];

      sheet.addRow({
        name: title.slice(0, 120),
        description,
        category: String(content.category ?? vision.category ?? ''),
        sku: product.internalSku,
        price: salePrice || '',
        stock: 1,
        image1: String(shopee[0] ?? images.square ?? images.hd ?? images.original ?? ''),
        image2: String(shopee[1] ?? images.hd ?? images.webp ?? ''),
        image3: String(shopee[2] ?? images.original ?? ''),
        purchasePrice: purchasePrice || '',
        profit: salePrice && purchasePrice ? salePrice - purchasePrice : '',
        notes: product.status === ProductStatus.READY ? 'Pronto para revisar' : product.status,
      });
    }

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
      });
    });

    workbook
      .addWorksheet('Leia-me')
      .addRows([
        ['Como usar'],
        [
          'A Shopee altera campos por categoria e pais. Baixe o template atual no Seller Center e copie estes dados para as colunas equivalentes.',
        ],
        [
          'As imagens usadas aqui priorizam a foto quadrada tratada, depois HD, depois original. Para upload em lote, as URLs precisam ser publicas.',
        ],
      ]);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
