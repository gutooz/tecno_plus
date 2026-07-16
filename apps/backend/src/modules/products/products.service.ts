import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ProductStatus, QueueName } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { QueueService } from '../queues/queue.service';
import { ImageAgent } from '../../agents/image.agent';
import { WeightAgent } from '../../agents/weight.agent';
import { exportShopeeWorkbook, ShopeeExportResult, SourceProduct } from './shopee';

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
    private readonly image: ImageAgent,
    private readonly weight: WeightAgent,
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

  /**
   * Refaz UMA foto específica (por índice em `images.shopee`) com um prompt
   * livre digitado pelo operador — pro caso comum de só uma das 4 fotos
   * geradas precisar de ajuste. Roda direto (sem fila): é uma única chamada
   * de imagem, rápida o bastante pra esperar na resposta HTTP.
   */
  async regenerateImage(ownerId: string, id: string, index: number, prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) throw new BadRequestException('Descreva o que quer mudar na foto.');

    const doc = await this.model.findOne({ _id: id, ownerId }).lean();
    if (!doc) throw new NotFoundException('Produto não encontrado');

    const images = (doc.images ?? {}) as { original?: string; shopee?: string[] };
    if (!images.original) throw new BadRequestException('Produto sem imagem original.');

    const result = await this.image.regenerateScene(id, images.original, index, trimmed);

    const shopee = Array.isArray(images.shopee) ? [...images.shopee] : [];
    shopee[index] = result.url;
    const $set: Record<string, unknown> = { 'images.shopee': shopee };
    if (result.hd) $set['images.hd'] = result.hd;
    if (result.square) $set['images.square'] = result.square;
    if (result.webp) $set['images.webp'] = result.webp;
    if (result.thumbnail) $set['images.thumbnail'] = result.thumbnail;

    const updated = await this.model
      .findOneAndUpdate({ _id: id, ownerId }, { $set }, { new: true })
      .lean();
    if (!updated) throw new NotFoundException('Produto não encontrado');
    return updated;
  }

  async regenerateImagesBatch(ownerId: string, ids: string[]) {
    const docs = await this.model.find({ _id: { $in: ids }, ownerId }, { _id: 1 }).lean();
    await Promise.all(
      docs.map((d) => this.queue.enqueue(QueueName.IMAGE, { productId: String(d._id), ownerId })),
    );
    return { queued: docs.length };
  }

  /**
   * Preenche o peso dos produtos que estão sem, estimando pela IA.
   *
   * Cirúrgico de propósito: reprocessar pelo pipeline completo regeraria título,
   * descrição e preço — caro e destrutivo para quem só precisa de peso. Aqui só
   * `vision.weight` é tocado.
   *
   * Quem JÁ tem peso é pulado: aquele valor veio de medição ou da tela do
   * operador, e estimativa não sobrescreve medição.
   */
  async estimateWeightBatch(ownerId: string, ids: string[]) {
    const filter: FilterQuery<ProductDocument> = { ownerId };
    if (ids.length) filter._id = { $in: ids };

    const docs = await this.model.find(filter, { _id: 1, vision: 1 }).lean();
    const pending = docs.filter((d) => {
      const w = (d.vision as { weight?: number } | undefined)?.weight;
      return typeof w !== 'number' || w <= 0;
    });

    let filled = 0;
    const failed: string[] = [];
    // Sequencial: são poucos produtos e o provedor de IA tem rate limit — um
    // Promise.all aqui trocaria 19 chamadas tranquilas por 19 chances de 429.
    for (const doc of pending) {
      const id = String(doc._id);
      try {
        const out = await this.weight.run((doc.vision ?? {}) as never);
        if (out.weight == null) {
          failed.push(id);
          continue;
        }
        await this.model.updateOne(
          { _id: id },
          { $set: { 'vision.weight': out.weight, 'vision.weightSource': 'estimado' } },
        );
        filled++;
        this.logger.log(
          `Peso estimado ${out.weight}kg (confiança ${out.confidence.toFixed(2)}) p/ ${id}: ${out.reasoning}`,
        );
      } catch (err) {
        failed.push(id);
        this.logger.warn(`Falha ao estimar peso de ${id}: ${String(err)}`);
      }
    }

    const skipped = docs.length - pending.length;
    this.logger.log(
      `Estimativa de peso: ${filled} preenchido(s), ${failed.length} falha(s), ` +
        `${skipped} já tinha(m) peso (preservado).`,
    );
    return { total: docs.length, filled, failed: failed.length, skipped };
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
  async exportShopee(
    ownerId: string,
    ids?: string[],
    opts?: { includeReportSheets?: boolean },
  ): Promise<ShopeeExportResult> {
    const filter: FilterQuery<ProductDocument> = { ownerId };
    if (ids?.length) filter._id = { $in: ids };

    const products = (await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .lean()) as unknown as SourceProduct[];

    const result = await exportShopeeWorkbook(products, {
      includeReportSheets: opts?.includeReportSheets,
    });
    const { report } = result;
    this.logger.log(
      `Export Shopee: ${report.exportedProducts}/${report.totalProducts} produto(s) → ` +
        `${report.exportedRows} linha(s) exportada(s) | template=${report.templateSource} | ` +
        `${report.corrections} correção(ões) | ${report.errors} erro(s), ` +
        `${report.warnings} aviso(s) | ${report.rejected} rejeitado(s) fora do arquivo.`,
    );
    return result;
  }
}
