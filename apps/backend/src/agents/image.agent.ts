import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { ProductImageSet } from '@tecnoplus/shared';
import { StorageService } from '../modules/storage/storage.service';
import { GeminiImageClient } from '../modules/ai/gemini-image.client';
import { fetchImageAsBase64 } from '../modules/ai/ai.utils';
import { IMAGE_KEEP, IMAGE_PROMPTS } from './prompts';

/**
 * AGENTE 4 — Image Agent.
 * Recorta o fundo e recompõe o produto para gerar 3 imagens prontas p/ Shopee
 * (1:1, fundo limpo) usando o modelo de imagem do Gemini ("Nano Banana"): a IA
 * remove o fundo bagunçado e deixa só o produto num fundo profissional.
 *
 * Regra de ouro: o produto NÃO pode ser alterado (forma, cores, texto, marca) —
 * só o fundo muda. Se a geração falhar, cai num fallback determinístico (sharp):
 * a foto original centralizada em fundo branco 1:1 (imagem válida p/ Shopee,
 * porém sem recorte). Assim o pipeline nunca fica sem imagens.
 */
@Injectable()
export class ImageAgent {
  private readonly logger = new Logger(ImageAgent.name);

  constructor(
    private readonly storage: StorageService,
    private readonly gemini: GeminiImageClient,
  ) {}

  async run(productId: string, originalUrl: string): Promise<ProductImageSet> {
    const { base64, mediaType } = await fetchImageAsBase64(originalUrl);
    const input = Buffer.from(base64, 'base64');
    const base = `products/${productId}`;

    // Gera as 3 imagens Shopee (recorte + fundo) sequencialmente p/ não abrir
    // várias chamadas simultâneas ao Gemini.
    const shopee: string[] = [];
    let cleanMain: Buffer | null = null;
    for (const scene of IMAGE_PROMPTS) {
      const generated = await this.gemini.generateScene(input, mediaType, scene.prompt);
      if (!generated && scene === IMAGE_PROMPTS[0]) {
        this.logger.warn(
          `Recorte via Gemini indisponível p/ ${productId} — usando fallback branco.`,
        );
      }
      const normalized = await this.toShopee(generated ?? input);
      if (cleanMain === null) cleanMain = normalized;
      shopee.push(await this.storage.upload(`${base}/${scene.key}.jpg`, normalized, 'image/jpeg'));
    }

    // Variantes de catálogo derivadas da imagem principal já limpa.
    const main = cleanMain ?? input;
    const [hd, square, webp, thumbnail] = await Promise.all([
      this.transform(main, `${base}/hd.jpg`, (img) =>
        img.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }),
      ),
      this.transform(main, `${base}/square.jpg`, (img) =>
        img
          .resize(1200, 1200, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 90 }),
      ),
      this.transform(main, `${base}/image.webp`, (img) =>
        img.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }),
      ),
      this.transform(main, `${base}/thumb.webp`, (img) =>
        img.resize(320, 320, { fit: 'cover' }).webp({ quality: 75 }),
      ),
    ]);

    return {
      original: originalUrl,
      hd,
      square,
      webp,
      thumbnail,
      shopee,
      backgroundRemoved: shopee[0],
    };
  }

  /**
   * Refaz UMA foto do produto (índice em `images.shopee`) com um prompt livre
   * do operador — usado quando só uma das fotos geradas precisa de ajuste,
   * sem repetir o lote inteiro. Mesma regra de ouro: produto preservado, só o
   * enquadramento/cena muda (força-se isso somando IMAGE_KEEP ao prompt).
   * Quando o índice é o principal (0), também recalcula hd/square/webp/thumb.
   */
  async regenerateScene(
    productId: string,
    originalUrl: string,
    sceneIndex: number,
    customPrompt: string,
  ): Promise<{ url: string; hd?: string; square?: string; webp?: string; thumbnail?: string }> {
    const { base64, mediaType } = await fetchImageAsBase64(originalUrl);
    const input = Buffer.from(base64, 'base64');
    const base = `products/${productId}`;
    const key = IMAGE_PROMPTS[sceneIndex]?.key ?? `shopee-${sceneIndex + 1}`;

    const prompt = `${customPrompt.trim()} ${IMAGE_KEEP}`;
    const generated = await this.gemini.generateScene(input, mediaType, prompt);
    if (!generated) {
      throw new Error('Não foi possível gerar a imagem agora — tente novamente.');
    }
    const normalized = await this.toShopee(generated);
    const url = await this.storage.upload(`${base}/${key}.jpg`, normalized, 'image/jpeg');
    if (sceneIndex !== 0) return { url };

    const [hd, square, webp, thumbnail] = await Promise.all([
      this.transform(normalized, `${base}/hd.jpg`, (img) =>
        img.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }),
      ),
      this.transform(normalized, `${base}/square.jpg`, (img) =>
        img
          .resize(1200, 1200, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 90 }),
      ),
      this.transform(normalized, `${base}/image.webp`, (img) =>
        img.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }),
      ),
      this.transform(normalized, `${base}/thumb.webp`, (img) =>
        img.resize(320, 320, { fit: 'cover' }).webp({ quality: 75 }),
      ),
    ]);
    return { url, hd, square, webp, thumbnail };
  }

  /** Normaliza qualquer imagem para o padrão Shopee: JPEG 1:1 1600×1600. */
  private async toShopee(src: Buffer): Promise<Buffer> {
    return sharp(src)
      .resize(1600, 1600, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 90 })
      .toBuffer();
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
}
