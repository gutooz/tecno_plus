import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { ProductImageSet } from '@tecnoplus/shared';
import { StorageService } from '../modules/storage/storage.service';
import { fetchImageAsBase64 } from '../modules/ai/ai.utils';
import { IMAGE_PROMPTS } from './prompts';

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
    private readonly config: ConfigService,
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
      const generated = await this.geminiScene(input, mediaType, scene.prompt);
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
   * Chama o modelo de imagem do Gemini para recortar o fundo e recompor o
   * produto. Retorna o JPEG/PNG gerado (Buffer) ou null se indisponível/falhar
   * (chave ausente, modelo sem acesso, erro de rede) — o chamador então usa o
   * fallback determinístico. Feito via REST p/ não depender da versão do SDK.
   */
  private async geminiScene(
    input: Buffer,
    mimeType: string,
    prompt: string,
  ): Promise<Buffer | null> {
    const apiKey = this.config.get<string>('ai.geminiKey') ?? '';
    const model = this.config.get<string>('ai.imageModel') ?? 'gemini-2.5-flash-image';
    if (!apiKey) return null;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const body = {
        contents: [
          {
            parts: [{ inlineData: { mimeType, data: input.toString('base64') } }, { text: prompt }],
          },
        ],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.logger.warn(`Gemini image ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return null;
      }
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: Record<string, unknown>[] } }[];
      };
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const inline = (part.inlineData ?? part.inline_data) as { data?: string } | undefined;
        if (inline?.data) return Buffer.from(inline.data, 'base64');
      }
      this.logger.warn('Gemini image: resposta sem imagem.');
      return null;
    } catch (e) {
      this.logger.warn(`Gemini image falhou: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
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
