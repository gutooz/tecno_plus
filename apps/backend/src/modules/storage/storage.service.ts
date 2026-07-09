import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { GridFSBucket, GridFSFile, ObjectId } from 'mongodb';
import { Readable } from 'stream';

const BUCKET = 'images';

/**
 * Storage de imagens sobre **MongoDB GridFS** — sem dependência externa.
 * `upload()` grava o binário no bucket `images` e devolve uma URL servida pela
 * própria API (`GET /api/files/:id`), consumida pelo frontend (<img>) e pelos
 * agentes de IA (que baixam a imagem para análise).
 *
 * A interface (upload/openDownloadStream) é mínima de propósito: trocar por
 * S3/GCS futuramente é reimplementar esta classe, sem tocar nos agentes.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly publicUrl: string;
  private bucketRef: GridFSBucket | null = null;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    config: ConfigService,
  ) {
    this.publicUrl = config.get<string>('app.publicUrl') ?? 'http://localhost:3333';
  }

  private bucket(): GridFSBucket {
    if (!this.bucketRef) {
      if (!this.connection.db) throw new Error('Conexão Mongo indisponível para GridFS.');
      this.bucketRef = new GridFSBucket(this.connection.db, { bucketName: BUCKET });
    }
    return this.bucketRef;
  }

  /**
   * Sobe um buffer e devolve a URL pública (servida pela API).
   * Se já houver arquivo com o mesmo `filename` (ex.: reprocessamento), o antigo
   * é removido para não deixar órfãos.
   */
  async upload(filename: string, data: Buffer, contentType: string): Promise<string> {
    await this.removeByFilename(filename);
    const bucket = this.bucket();

    const id: ObjectId = await new Promise((resolve, reject) => {
      const stream = bucket.openUploadStream(filename, { contentType });
      Readable.from(data)
        .pipe(stream)
        .on('error', reject)
        .on('finish', () => resolve(stream.id as ObjectId));
    });

    return `${this.publicUrl}/api/files/${id.toString()}`;
  }

  /** Metadados + stream de leitura para o endpoint de download. */
  async openDownload(id: string): Promise<{ file: GridFSFile; stream: Readable }> {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      throw new NotFoundException('Arquivo inválido');
    }
    const file = await this.bucket().find({ _id: objectId }).next();
    if (!file) throw new NotFoundException('Arquivo não encontrado');
    return { file, stream: this.bucket().openDownloadStream(objectId) };
  }

  private async removeByFilename(filename: string): Promise<void> {
    try {
      const existing = await this.bucket().find({ filename }).toArray();
      await Promise.all(existing.map((f) => this.bucket().delete(f._id)));
    } catch (err) {
      this.logger.warn(`Falha ao limpar arquivo anterior "${filename}": ${String(err)}`);
    }
  }
}
