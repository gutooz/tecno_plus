import { Injectable, Logger } from '@nestjs/common';
import {
  GeneratedContent,
  MarketResearchResult,
  ProductVisionAttributes,
  slugify,
} from '@tecnoplus/shared';
import { AiService } from '../modules/ai/ai.service';
import { CONTENT_PROMPT } from './prompts';

export interface ContentOutcome {
  content: GeneratedContent;
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number };
}

/**
 * AGENTE 3 — Content Agent.
 * Gera título, descrições, bullets, SEO, specs e descrição p/ marketplace,
 * tudo otimizado para e-commerce, a partir da visão + pesquisa de mercado.
 */
@Injectable()
export class ContentAgent {
  private readonly logger = new Logger(ContentAgent.name);

  constructor(private readonly ai: AiService) {}

  async run(
    vision: ProductVisionAttributes,
    market?: MarketResearchResult,
  ): Promise<ContentOutcome> {
    const context = JSON.stringify({ vision, market: market ?? null }, null, 2);
    const request = {
      json: true,
      maxTokens: 4096,
      temperature: 0.6,
      messages: [
        { role: 'system' as const, content: CONTENT_PROMPT },
        { role: 'user' as const, content: `Dados do produto:\n${context}` },
      ],
    };

    // O modelo às vezes devolve JSON inválido (aspas/escape); nesse caso `data`
    // vem null e o normalize cairia no fallback (descrição = título). Tenta mais
    // uma vez antes de degradar — barato e evita anúncio sem descrição.
    let res = await this.ai.generateText<GeneratedContent>(request);
    if (!res.data) {
      this.logger.warn('Conteúdo sem JSON válido na 1ª tentativa; repetindo.');
      res = await this.ai.generateText<GeneratedContent>(request);
    }

    const content = this.normalize(res.data, vision);
    return {
      content,
      usage: {
        provider: res.usage.provider,
        model: res.usage.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      },
    };
  }

  /** Garante um objeto válido mesmo se o modelo omitir campos. */
  private normalize(
    data: GeneratedContent | null,
    vision: ProductVisionAttributes,
  ): GeneratedContent {
    const fallbackTitle =
      [vision.brand, vision.name, vision.model].filter(Boolean).join(' ') || 'Produto';
    const safe = data ?? ({} as Partial<GeneratedContent>);
    const title = safe.title || fallbackTitle;
    return {
      title,
      description: safe.description || vision.shortDescription || fallbackTitle,
      longDescription: safe.longDescription || safe.description || fallbackTitle,
      summary: safe.summary || fallbackTitle,
      bulletPoints: safe.bulletPoints?.length ? safe.bulletPoints : (vision.features ?? []),
      seo: {
        metaDescription: safe.seo?.metaDescription || (safe.description ?? title).slice(0, 155),
        slug: safe.seo?.slug ? slugify(safe.seo.slug) : slugify(title),
        keywords: safe.seo?.keywords ?? [],
        tags: safe.seo?.tags ?? [],
      },
      category: safe.category || vision.category || 'Geral',
      technicalSpecs: safe.technicalSpecs ?? {},
      marketplaceDescription: safe.marketplaceDescription || safe.summary || title,
    };
  }
}
