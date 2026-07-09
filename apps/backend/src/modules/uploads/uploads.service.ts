import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { buildInternalSku, ProductStatus } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queues/queue.service';

export interface UploadedImage {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

/**
 * Recebe uma imagem, sobe no Storage IMEDIATAMENTE, cria o produto em estado
 * UPLOADED e enfileira o pipeline. Nenhum processamento de IA acontece aqui —
 * apenas storage + enqueue, mantendo a resposta rápida.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  async ingest(ownerId: string, file: UploadedImage) {
    const created = await this.products.create({
      ownerId,
      internalSku: buildInternalSku(undefined, `${Date.now()}${Math.round(Math.random() * 1e6)}`),
      status: ProductStatus.UPLOADED,
      images: {},
      vision: {},
    });

    const ext = file.mimeType.split('/')[1] ?? 'jpg';
    const path = `products/${String(created._id)}/original.${ext}`;
    const url = await this.storage.upload(path, file.buffer, file.mimeType);

    created.set('images', { original: url });
    await created.save();

    await this.queue.startPipeline({ productId: String(created._id), ownerId });
    this.logger.log(`Upload ingerido: produto ${created.internalSku} enfileirado.`);

    return { id: String(created._id), internalSku: created.internalSku, status: created.status };
  }
}
