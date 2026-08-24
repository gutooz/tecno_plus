import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { FilterQuery, Model, Types } from 'mongoose';
import { buildInternalSku, ProductStatus, QueueName, slugify } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { QueueService } from '../queues/queue.service';
import { ImageAgent } from '../../agents/image.agent';
import { WeightAgent } from '../../agents/weight.agent';
import { exportShopeeWorkbook, ShopeeExportResult, SourceProduct } from './shopee';
import { StorageService } from '../storage/storage.service';

export interface ListProductsQuery {
  ownerId: string;
  search?: string;
  status?: ProductStatus | 'all' | 'waiting';
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

interface ManualProductFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
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

function productIdValues(id: string): unknown[] {
  return Types.ObjectId.isValid(id) ? [new Types.ObjectId(id), id] : [id];
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function decimal(value: unknown): number | undefined {
  const compact = text(value).replace(/[^\d,.-]/g, '');
  const raw = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function money(value: unknown): number | undefined {
  return decimal(value);
}

function int(value: unknown): number | undefined {
  const n = decimal(value);
  return n == null ? undefined : Math.floor(n);
}

function parseManualVariations(raw: unknown) {
  const value = text(raw);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => {
        const row = item as Record<string, unknown>;
        const option1 = text(row.option1);
        const option2 = text(row.option2);
        const price = money(row.price);
        const stock = int(row.stock);
        if (!option1 && !option2) return null;
        return {
          name1: text(row.name1) || 'Cor',
          option1,
          name2: option2 ? text(row.name2) || 'Tamanho' : undefined,
          option2: option2 || undefined,
          sku: text(row.sku) || undefined,
          price,
          stock,
          integrationNo: text(row.integrationNo) || `manual-${index + 1}`,
        };
      })
      .filter(Boolean);
  } catch {
    throw new BadRequestException('Variações em formato inválido.');
  }
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectModel(Product.name) private readonly model: Model<ProductDocument>,
    private readonly queue: QueueService,
    private readonly image: ImageAgent,
    private readonly weight: WeightAgent,
    private readonly storage: StorageService,
  ) {}

  async list(q: ListProductsQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const filter: FilterQuery<ProductDocument> = { ownerId: q.ownerId };
    if (q.status === 'all') {
      // Sem filtro: usado pelo card "Processados" do dashboard, que conta todos os status.
    } else if (q.status === 'waiting') {
      filter.status = { $in: [ProductStatus.UPLOADED, ProductStatus.PROCESSING] };
    } else if (q.status) {
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

  async createManualShopeeProduct(
    ownerId: string,
    files: ManualProductFile[],
    body: Record<string, string | undefined>,
  ) {
    const images = files.filter(
      (file) => file.buffer?.length && file.mimetype?.startsWith('image/'),
    );
    if (!images.length) throw new BadRequestException('Envie pelo menos uma imagem do produto.');

    const title = text(body.title);
    const description = text(body.description);
    const category = text(body.category);
    const brand = text(body.brand) || 'NoBrand';
    const shopeeCategoryId = int(body.shopeeCategoryId);
    const salePrice = money(body.salePrice);
    const purchasePrice = money(body.purchasePrice) ?? 0;
    const stock = int(body.stock);
    const weight = decimal(body.weight);
    const length = decimal(body.length);
    const width = decimal(body.width);
    const height = decimal(body.height);
    const sku = text(body.sku);
    const gtin = text(body.gtin);
    const variations = parseManualVariations(body.variations);

    if (title.length < 2 || title.length > 120) {
      throw new BadRequestException('Título Shopee deve ter entre 2 e 120 caracteres.');
    }
    if (description.length < 10 || description.length > 5000) {
      throw new BadRequestException('Descrição Shopee deve ter entre 10 e 5000 caracteres.');
    }
    if (!shopeeCategoryId || shopeeCategoryId <= 0) {
      throw new BadRequestException('Informe o ID numérico da categoria Shopee.');
    }
    if (!salePrice || salePrice < 1 || salePrice > 100000) {
      throw new BadRequestException('Preço Shopee deve ficar entre R$ 1 e R$ 100.000.');
    }
    if (stock == null || stock < 0) {
      throw new BadRequestException('Informe o estoque inteiro do produto.');
    }
    if (!weight || !length || !width || !height) {
      throw new BadRequestException('Peso e dimensões da embalagem são obrigatórios.');
    }

    const seed = `${Date.now()}${Math.round(Math.random() * 1e6)}`;
    const internalSku = sku || buildInternalSku(category || undefined, seed);
    const imageHash = createHash('sha256').update(images[0].buffer).digest('hex');
    const nameKey = slugify(title);

    const created = await this.model.create({
      ownerId,
      internalSku,
      status: ProductStatus.READY,
      aiConfidence: 1,
      vision: {
        name: title,
        brand,
        category,
        shopeeCategoryId,
        quantity: stock,
        weight,
        length,
        width,
        height,
        ...(gtin ? { gtin } : {}),
      },
      content: {
        title,
        description,
        longDescription: description,
        marketplaceDescription: description,
        category,
        summary: description.slice(0, 240),
        bulletPoints: [],
        seo: {
          metaDescription: description.slice(0, 155),
          slug: slugify(title),
          keywords: [],
          tags: [],
        },
        technicalSpecs: {
          Marca: brand,
          Condição: 'Novo',
          'Categoria Shopee': String(shopeeCategoryId),
        },
      },
      pricing: {
        purchasePrice,
        suggestedPrice: salePrice,
        profit: salePrice - purchasePrice,
        marginPercent: salePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : 0,
        roi: purchasePrice > 0 ? ((salePrice - purchasePrice) / purchasePrice) * 100 : 0,
      },
      images: {},
      variations,
      nameKey,
      imageHash,
      source: 'manual-shopee',
    });

    const urls: string[] = [];
    for (const [index, file] of images.slice(0, 9).entries()) {
      const ext = (file.mimetype.split('/')[1] ?? 'jpg').split('+')[0];
      const path = `products/${String(created._id)}/manual-${index + 1}.${ext}`;
      urls.push(await this.storage.upload(path, file.buffer, file.mimetype));
    }

    created.set('images', {
      original: urls[0],
      thumbnail: urls[0],
      square: urls[0],
      shopee: urls,
    });
    await created.save();

    return created.toObject();
  }

  private productByOwnerFilter(ownerId: string, id: string): Record<string, unknown> {
    return { ownerId, _id: { $in: productIdValues(id) } };
  }

  private async findRawById(ownerId: string, id: string): Promise<Record<string, unknown> | null> {
    return this.model.collection.findOne(this.productByOwnerFilter(ownerId, id)) as Promise<Record<
      string,
      unknown
    > | null>;
  }

  private async findOneAndUpdateRaw(
    ownerId: string,
    id: string,
    $set: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const result = (await this.model.collection.findOneAndUpdate(
      this.productByOwnerFilter(ownerId, id),
      { $set },
      { returnDocument: 'after' },
    )) as unknown;
    return result && typeof result === 'object' && 'value' in result
      ? ((result as { value: Record<string, unknown> | null }).value ?? null)
      : ((result as Record<string, unknown> | null) ?? null);
  }

  async findById(ownerId: string, id: string) {
    const doc = await this.findRawById(ownerId, id);
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
    const current = await this.findRawById(ownerId, id);
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

    const doc = await this.findOneAndUpdateRaw(ownerId, id, $set);
    if (!doc) throw new NotFoundException('Produto não encontrado');
    return doc;
  }

  async remove(ownerId: string, id: string) {
    const res = await this.model.collection.deleteOne(this.productByOwnerFilter(ownerId, id));
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
    const doc = await this.findRawById(ownerId, id);
    if (!doc) throw new NotFoundException('Produto não encontrado');
    await this.model.collection.updateOne(this.productByOwnerFilter(ownerId, id), {
      $set: { status: ProductStatus.PROCESSING },
    });
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
    const doc = await this.findRawById(ownerId, id);
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

    const doc = await this.findRawById(ownerId, id);
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

    const updated = await this.findOneAndUpdateRaw(ownerId, id, $set);
    if (!updated) throw new NotFoundException('Produto não encontrado');
    return updated;
  }

  async regenerateImagesBatch(ownerId: string, ids: string[]) {
    const docs = await this.model.collection
      .find({ ownerId, _id: { $in: ids.flatMap(productIdValues) } } as never, {
        projection: { _id: 1 },
      })
      .toArray();
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
   * Cada campo é preenchido só se estiver faltando: o que já existe veio de
   * medição ou da tela do operador, e estimativa não sobrescreve medição. Um
   * produto com peso medido e sem medidas ganha só as medidas.
   */
  async estimateWeightBatch(ownerId: string, ids: string[]) {
    const filter: Record<string, unknown> = { ownerId };
    if (ids.length) filter._id = { $in: ids.flatMap(productIdValues) };

    const docs = await this.model.collection
      .find(filter, { projection: { _id: 1, vision: 1 } })
      .toArray();

    const num = (v: unknown): boolean => typeof v === 'number' && v > 0;
    const gaps = (d: (typeof docs)[number]) => {
      const v = (d.vision ?? {}) as Record<string, unknown>;
      return {
        peso: !num(v.weight),
        // A Shopee trata dimensão como conjunto — falta uma, faltam todas.
        medidas: !num(v.length) || !num(v.width) || !num(v.height),
      };
    };
    const pending = docs.filter((d) => {
      const g = gaps(d);
      return g.peso || g.medidas;
    });

    let filled = 0;
    const failed: string[] = [];
    // Sequencial: são poucos produtos e o provedor de IA tem rate limit — um
    // Promise.all aqui trocaria 19 chamadas tranquilas por 19 chances de 429.
    for (const doc of pending) {
      const id = String(doc._id);
      const g = gaps(doc);
      try {
        const out = await this.weight.run((doc.vision ?? {}) as never);

        const set: Record<string, unknown> = {};
        if (g.peso && out.weight != null) {
          set['vision.weight'] = out.weight;
          set['vision.weightSource'] = 'estimado';
        }
        // Sem as três, a Shopee acusa "Este campo não pode ficar em branco" —
        // e meia dimensão é pior que nenhuma.
        if (g.medidas && out.dimensions) {
          set['vision.length'] = out.dimensions.length;
          set['vision.width'] = out.dimensions.width;
          set['vision.height'] = out.dimensions.height;
        }
        if (!Object.keys(set).length) {
          failed.push(id);
          continue;
        }

        await this.model.collection.updateOne({ _id: { $in: productIdValues(id) } } as never, {
          $set: set,
        });
        filled++;
        this.logger.log(
          `Envio estimado p/ ${id}: ${JSON.stringify(set)} ` +
            `(confiança ${out.confidence.toFixed(2)}) — ${out.reasoning}`,
        );
      } catch (err) {
        failed.push(id);
        this.logger.warn(`Falha ao estimar envio de ${id}: ${String(err)}`);
      }
    }

    const skipped = docs.length - pending.length;
    this.logger.log(
      `Estimativa de envio: ${filled} preenchido(s), ${failed.length} falha(s), ` +
        `${skipped} já completo(s).`,
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
    const filter: Record<string, unknown> = { ownerId };
    if (ids?.length) filter._id = { $in: ids.flatMap(productIdValues) };

    const products = (await this.model.collection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray()) as unknown as SourceProduct[];

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
