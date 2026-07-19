import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client fino da API de geração/edição de imagem do Gemini ("Nano Banana").
 * Extraído do `ImageAgent` para ser reaproveitado também pelo
 * `MarketingImageAgent` — mesma engine, prompts de cena diferentes. Sem
 * estado; devolve o Buffer gerado ou `null` (o chamador decide o fallback).
 */
@Injectable()
export class GeminiImageClient {
  private readonly logger = new Logger(GeminiImageClient.name);

  constructor(private readonly config: ConfigService) {}

  async generateScene(input: Buffer, mimeType: string, prompt: string): Promise<Buffer | null> {
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
}
