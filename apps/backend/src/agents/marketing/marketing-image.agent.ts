import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from '../../modules/storage/storage.service';
import { GeminiImageClient } from '../../modules/ai/gemini-image.client';
import { fetchImageAsBase64 } from '../../modules/ai/ai.utils';
import { MARKETING_IMAGE_STYLES } from './marketing-image-styles';

const FORMAT_DIMENSIONS: Record<string, [number, number]> = {
  square: [1200, 1200],
  vertical: [1080, 1920],
  horizontal: [1600, 900],
};

/**
 * AGENTE 4 (Marketing IA) — Image.
 * Reaproveita a MESMA engine do `ImageAgent` (Gemini "Nano Banana" via
 * `GeminiImageClient`) com os estilos de cena pedidos para conteúdo social
 * (`MARKETING_IMAGE_STYLES`) — fundo branco/"pessoa usando" já existem no
 * catálogo (`images.shopee`) e não são duplicados aqui. Sem fallback
 * determinístico: se a geração falhar, o operador tenta de novo (é uma ação
 * explícita de preview/regeneração, não uma etapa obrigatória do pipeline).
 */
@Injectable()
export class MarketingImageAgent {
  private readonly logger = new Logger(MarketingImageAgent.name);

  constructor(
    private readonly gemini: GeminiImageClient,
    private readonly storage: StorageService,
  ) {}

  listStyles() {
    return MARKETING_IMAGE_STYLES.map(({ key, label, format }) => ({ key, label, format }));
  }

  async generate(productId: string, originalUrl: string, styleKey: string): Promise<string> {
    const style = MARKETING_IMAGE_STYLES.find((s) => s.key === styleKey);
    if (!style) throw new Error(`Estilo de imagem desconhecido: ${styleKey}`);

    const { base64, mediaType } = await fetchImageAsBase64(originalUrl);
    const input = Buffer.from(base64, 'base64');

    const generated = await this.gemini.generateScene(input, mediaType, style.prompt);
    if (!generated) {
      throw new Error('Não foi possível gerar a imagem agora — tente novamente.');
    }

    const normalized = await this.toFormat(generated, style.format, style.transparentBackground);
    const ext = style.transparentBackground ? 'png' : 'jpg';
    const contentType = style.transparentBackground ? 'image/png' : 'image/jpeg';
    return this.storage.upload(
      `products/${productId}/marketing/${style.key}.${ext}`,
      normalized,
      contentType,
    );
  }

  private async toFormat(
    src: Buffer,
    format: 'square' | 'vertical' | 'horizontal',
    transparent?: boolean,
  ): Promise<Buffer> {
    const [w, h] = FORMAT_DIMENSIONS[format];
    const img = sharp(src).resize(w, h, {
      fit: 'contain',
      background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255 },
    });
    if (transparent) return img.png().toBuffer();
    return img
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 90 })
      .toBuffer();
  }
}
