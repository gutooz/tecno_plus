import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { ProductImageSet } from '@tecnoplus/shared';
import { StorageService } from '../modules/storage/storage.service';
import { fetchImageAsBase64 } from '../modules/ai/ai.utils';

/**
 * AGENTE 4 — Image Agent.
 * Trata a imagem original e gera as variantes: HD, quadrada (fundo branco),
 * WebP e thumbnail. Remoção de fundo por IA é um ponto de extensão (ver
 * `removeBackground`) — no MVP usamos padding em fundo branco via sharp.
 *
 * Regra: imagens do fabricante/empresa têm prioridade e NÃO são sobrescritas;
 * nunca copiamos imagens protegidas de anúncios de terceiros.
 */
@Injectable()
export class ImageAgent {
  private readonly logger = new Logger(ImageAgent.name);

  constructor(private readonly storage: StorageService) {}

  async run(productId: string, originalUrl: string): Promise<ProductImageSet> {
    const { base64 } = await fetchImageAsBase64(originalUrl);
    const input = Buffer.from(base64, 'base64');
    const base = `products/${productId}`;

    const [hd, square, webp, thumbnail] = await Promise.all([
      this.transform(input, `${base}/hd.jpg`, (img) =>
        img.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }),
      ),
      this.transform(input, `${base}/square.jpg`, (img) =>
        img
          .resize(1200, 1200, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 90 }),
      ),
      this.transform(input, `${base}/image.webp`, (img) =>
        img.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }),
      ),
      this.transform(input, `${base}/thumb.webp`, (img) =>
        img.resize(320, 320, { fit: 'cover' }).webp({ quality: 75 }),
      ),
    ]);

    return { original: originalUrl, hd, square, webp, thumbnail };
  }

  private async transform(
    input: Buffer,
    path: string,
    apply: (img: sharp.Sharp) => sharp.Sharp,
  ): Promise<string> {
    const out = await apply(sharp(input)).toBuffer();
    const contentType = path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return this.storage.upload(path, out, contentType);
  }

  /**
   * PONTO DE EXTENSÃO: remoção de fundo por IA (ex.: rembg/API dedicada).
   * Mantido explícito para plugar sem alterar o restante do agente.
   */
  // async removeBackground(input: Buffer): Promise<Buffer> { ... }
}
