import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ProductStatus, QueueName } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { QueueService } from '../queues/queue.service';
import { exportShopeeWorkbook, SourceProduct } from './shopee';

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
  private readonly logger = new Logger(ProductsService.name);

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

  /**
   * Refaz só a etapa de imagem (sem repetir visão/mercado/conteúdo) — usada
   * pra aplicar em produtos já processados um novo conjunto de prompts do
   * Image Agent (ex.: nova cena de uso) sem gastar IA reanalisando a foto do
   * zero. Como qualquer etapa do pipeline, encadeia preço → publicação.
   */
  async regenerateImages(ownerId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, ownerId });
    if (!doc) throw new NotFoundException('Produto não encontrado');
    await this.queue.enqueue(QueueName.IMAGE, { productId: id, ownerId });
    return { queued: true };
  }

  async regenerateImagesBatch(ownerId: string, ids: string[]) {
    const docs = await this.model.find({ _id: { $in: ids }, ownerId }, { _id: 1 }).lean();
    await Promise.all(
      docs.map((d) => this.queue.enqueue(QueueName.IMAGE, { productId: String(d._id), ownerId })),
    );
    return { queued: docs.length };
  }

  async countsByStatus(ownerId: string) {
    const rows = await this.model.aggregate<{ _id: string; count: number }>([
      { $match: { ownerId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return rows.reduce<Record<string, number>>((acc, r) => ((acc[r._id] = r.count), acc), {});
  }

  /**
   * Gera a planilha de Importação em Massa da Shopee (BR) a partir do catálogo.
   * A montagem/validação vive no motor modular `./shopee` (template → mapper →
   * autofix → validador → workbook). Aqui só buscamos os produtos e delegamos.
   *
   * Regra nº 1: nunca inventar colunas. O layout vem do arquivo oficial
   * (SHOPEE_TEMPLATE_PATH) quando disponível, ou do esquema de referência BR.
   */
  async exportShopee(ownerId: string, ids?: string[]): Promise<Buffer> {
    const filter: FilterQuery<ProductDocument> = { ownerId };
    if (ids?.length) filter._id = { $in: ids };

    const products = (await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .lean()) as unknown as SourceProduct[];

    const { buffer, report } = await exportShopeeWorkbook(products);
    this.logger.log(
      `Export Shopee: ${report.totalProducts} produto(s) → ${report.totalRows} linha(s) | ` +
        `template=${report.templateSource} | ${report.corrections} correção(ões) | ` +
        `${report.errors} erro(s), ${report.warnings} aviso(s) | ${report.rejected} rejeitado(s).`,
    );
    return buffer;
  }
}
