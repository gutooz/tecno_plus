import { Injectable, Logger } from '@nestjs/common';
import {
  GeneratedContent,
  MarketingCampaignPlan,
  MarketingCampaignType,
  ProductVisionAttributes,
  TrendScore,
} from '@tecnoplus/shared';
import { AiService } from '../../modules/ai/ai.service';
import { MARKETING_PLAN_PROMPT } from './marketing-prompts';

interface PlannerRaw {
  campaignType: MarketingCampaignType;
  objective: string;
  targetAudience: string;
  strategy: string;
  idealPostingHour: number;
  reasoning: string;
}

export interface PlannerOutcome {
  plan: MarketingCampaignPlan;
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number };
}

/**
 * AGENTE 2 (Marketing IA) — Marketing Planner.
 * A partir do score de tendência (Trend Hunter) e dos dados do produto,
 * decide o TIPO de campanha e a estratégia. Não gera copy nem imagem — isso
 * é o Copywriter/Image Agent (fase seguinte).
 */
@Injectable()
export class MarketingPlannerAgent {
  private readonly logger = new Logger(MarketingPlannerAgent.name);

  constructor(private readonly ai: AiService) {}

  async run(
    productId: string,
    vision: ProductVisionAttributes,
    content: GeneratedContent | undefined,
    trend: TrendScore,
  ): Promise<PlannerOutcome> {
    const context = JSON.stringify(
      {
        product: { ...vision, title: content?.title },
        trend: {
          score: trend.score,
          reasons: trend.reasons,
          seasonalEvent: trend.seasonalEvent ?? null,
        },
      },
      null,
      2,
    );

    const request = {
      json: true,
      maxTokens: 1024,
      temperature: 0.5,
      messages: [
        { role: 'system' as const, content: MARKETING_PLAN_PROMPT },
        { role: 'user' as const, content: `Dados:\n${context}` },
      ],
    };

    let res = await this.ai.generateText<PlannerRaw>(request);
    if (!res.data) {
      this.logger.warn(`Plano de campanha sem JSON válido p/ ${productId}; repetindo.`);
      res = await this.ai.generateText<PlannerRaw>(request);
    }

    const plan = this.normalize(productId, res.data, trend.score);
    return {
      plan,
      usage: {
        provider: res.usage.provider,
        model: res.usage.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      },
    };
  }

  private normalize(
    productId: string,
    data: PlannerRaw | null,
    trendScore: number,
  ): MarketingCampaignPlan {
    const safe = data ?? ({} as Partial<PlannerRaw>);
    const validTypes: string[] = Object.values(MarketingCampaignType);
    return {
      productId,
      campaignType:
        safe.campaignType && validTypes.includes(safe.campaignType)
          ? safe.campaignType
          : MarketingCampaignType.PROMOTIONAL,
      objective: safe.objective || 'Aumentar a visibilidade do produto.',
      targetAudience: safe.targetAudience || 'Público geral interessado na categoria.',
      strategy: safe.strategy || 'Divulgação orgânica nos canais sociais conectados.',
      idealPostingHour: clampHour(safe.idealPostingHour),
      trendScore,
      reasoning: safe.reasoning || '',
    };
  }
}

function clampHour(h: unknown): number {
  const n = Number(h);
  if (!Number.isFinite(n)) return 12;
  return Math.min(23, Math.max(0, Math.round(n)));
}
