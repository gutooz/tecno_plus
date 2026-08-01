import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { FilterQuery, Model } from 'mongoose';
import { buildInternalSku, ProductStatus, slugify } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queues/queue.service';

export interface UploadedImage {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface IngestWithData {
  ownerId: string;
  buffer: Buffer;
  mimeType: string;
  name: string;
  purchasePrice: number;
  /** Peso em kg já informado pelo operador (fluxo Telegram individual) — vira `vision.weight`. */
  weight?: number;
  source?: string;
}

export type IngestResult =
  | { duplicate: true; existing: { id: string; internalSku: string; name: string } }
  | { duplicate: false; id: string; internalSku: string; status: string };

/**
 * Recebe uma imagem, sobe no Storage IMEDIATAMENTE, cria o produto e enfileira
 * o pipeline. `ingest` é o caminho do upload web (título preenchido depois);
 * `ingestWithData` é o caminho do Telegram (já vem com título + preço) e aplica
 * deduplicação (mesmo título OU mesma imagem = produto repetido).
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  private sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /** Upload web (ou Telegram sem legenda): cria produto (título preenchido
   * depois no Envio em Lote) e opcionalmente enfileira. */
  async ingest(ownerId: string, file: UploadedImage, startPipeline = true, source = 'web') {
    const imageHash = this.sha256(file.buffer);
    const created = await this.products.create({
      ownerId,
      internalSku: buildInternalSku(undefined, `${Date.now()}${Math.round(Math.random() * 1e6)}`),
      status: ProductStatus.UPLOADED,
      images: {},
      vision: {},
      imageHash,
      source,
    });

    const ext = file.mimeType.split('/')[1] ?? 'jpg';
    const path = `products/${String(created._id)}/original.${ext}`;
    const url = await this.storage.upload(path, file.buffer, file.mimeType);

    created.set('images', { original: url });
    await created.save();

    if (startPipeline) {
      await this.queue.startPipeline({ productId: String(created._id), ownerId });
      this.logger.log(`Upload ingerido: produto ${created.internalSku} enfileirado.`);
    } else {
      this.logger.log(`Upload ingerido: produto ${created.internalSku} aguardando cadastro.`);
    }

    return { id: String(created._id), internalSku: created.internalSku, status: created.status };
  }

  /** Procura produto repetido do mesmo dono (mesmo título OU mesma imagem). */
  async findDuplicate(ownerId: string, nameKey: string, imageHash: string) {
    const or: FilterQuery<ProductDocument>[] = [];
    if (nameKey) or.push({ nameKey });
    if (imageHash) or.push({ imageHash });
    if (!or.length) return null;
    return this.products.findOne({ ownerId, $or: or }).lean();
  }

  /**
   * Ingestão com título + preço já informados (fluxo Telegram). Bloqueia
   * repetidos, salva a imagem e dispara o pipeline (Gemini trata a imagem,
   * Claude gera o título final).
   */
  async ingestWithData(data: IngestWithData): Promise<IngestResult> {
    const name = data.name.trim();
    const nameKey = slugify(name);
    const imageHash = this.sha256(data.buffer);

    const dup = await this.findDuplicate(data.ownerId, nameKey, imageHash);
    if (dup) {
      const vision = (dup.vision ?? {}) as { name?: string };
      return {
        duplicate: true,
        existing: {
          id: String(dup._id),
          internalSku: dup.internalSku,
          name: vision.name ?? dup.internalSku,
        },
      };
    }

    const created = await this.products.create({
      ownerId: data.ownerId,
      internalSku: buildInternalSku(undefined, `${Date.now()}${Math.round(Math.random() * 1e6)}`),
      status: ProductStatus.PROCESSING,
      vision: {
        name,
        labelPrice: data.purchasePrice,
        ...(data.weight != null ? { weight: data.weight, weightSource: 'etiqueta' } : {}),
      },
      pricing: { purchasePrice: data.purchasePrice },
      images: {},
      nameKey,
      imageHash,
      source: data.source ?? 'telegram',
    });

    const ext = (data.mimeType.split('/')[1] ?? 'jpg').split('+')[0];
    const path = `products/${String(created._id)}/original.${ext}`;
    const url = await this.storage.upload(path, data.buffer, data.mimeType);
    created.set('images', { original: url });
    await created.save();

    await this.queue.startPipeline({ productId: String(created._id), ownerId: data.ownerId });
    this.logger.log(
      `Telegram: produto "${name}" (${created.internalSku}) cadastrado e enfileirado.`,
    );

    return {
      duplicate: false,
      id: String(created._id),
      internalSku: created.internalSku,
      status: created.status,
    };
  }
}
