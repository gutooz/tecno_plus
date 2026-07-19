import { Injectable, Logger } from '@nestjs/common';
import {
  GeneratedContent,
  MarketingCampaignPlan,
  MarketingChannel,
  MarketingContentType,
  MarketingPostContent,
  ProductVisionAttributes,
  TrendScore,
} from '@tecnoplus/shared';
import { AiService } from '../../modules/ai/ai.service';
import { MARKETING_COPY_PROMPT } from './marketing-prompts';

interface CopyRaw {
  caption: string;
  hashtags: string[];
  cta: string;
}

export interface CopyOutcome {
  content: MarketingPostContent;
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number };
}

/**
 * AGENTE 3 (Marketing IA) — Copywriter.
 * Gera legenda/hashtags/CTA de UM post para um canal+formato específico. O
 * Calendar Agent (Fase 3) chama isso por entrada do calendário; por ora é
 * exposto via preview (`POST /marketing/copy/preview`) para validação isolada.
 */
@Injectable()
export class MarketingCopyAgent {
  private readonly logger = new Logger(MarketingCopyAgent.name);

  constructor(private readonly ai: AiService) {}

  async run(
    productId: string,
    vision: ProductVisionAttributes,
    content: GeneratedContent | undefined,
    trend: TrendScore | undefined,
    plan: MarketingCampaignPlan | undefined,
    channel: MarketingChannel,
    type: MarketingContentType,
  ): Promise<CopyOutcome> {
    const context = JSON.stringify(
      {
        product: { ...vision, title: content?.title, description: content?.description },
        trend: trend ? { score: trend.score, reasons: trend.reasons } : null,
        plan: plan
          ? { campaignType: plan.campaignType, objective: plan.objective, strategy: plan.strategy }
          : null,
        channel,
        type,
      },
      null,
      2,
    );

    const request = {
      json: true,
      maxTokens: 1024,
      temperature: 0.7,
      messages: [
        { role: 'system' as const, content: MARKETING_COPY_PROMPT },
        { role: 'user' as const, content: `Dados:\n${context}` },
      ],
    };

    let res = await this.ai.generateText<CopyRaw>(request);
    if (!res.data) {
      this.logger.warn(`Copy sem JSON válido p/ ${productId}; repetindo.`);
      res = await this.ai.generateText<CopyRaw>(request);
    }

    const result = this.normalize(res.data, content);
    return {
      content: result,
      usage: {
        provider: res.usage.provider,
        model: res.usage.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      },
    };
  }

  private normalize(data: CopyRaw | null, content?: GeneratedContent): MarketingPostContent {
    const safe = data ?? ({} as Partial<CopyRaw>);
    return {
      caption: safe.caption || content?.summary || content?.title || '',
      hashtags: safe.hashtags ?? [],
      cta: safe.cta || 'Saiba mais',
      mediaUrls: [],
    };
  }
}
