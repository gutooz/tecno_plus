import { Injectable, Logger } from '@nestjs/common';
import {
  MarketResearchResult,
  ProductVisionAttributes,
  SEASONAL_EVENTS,
  TrendScore,
} from '@tecnoplus/shared';
import { AiService } from '../../modules/ai/ai.service';
import { TREND_SCORE_PROMPT } from './marketing-prompts';

interface TrendHunterRaw {
  score: number;
  reasons: string[];
  suggestedHashtags: string[];
  suggestedKeywords: string[];
}

export interface TrendOutcome {
  trend: TrendScore;
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number };
}

/**
 * AGENTE 1 (Marketing IA) — Trend Hunter.
 * V1 sem scraping de redes/marketplaces (não existe API oficial gratuita
 * para isso): combina o histórico de mercado já coletado pelo `MarketAgent`,
 * o calendário sazonal fixo (`SEASONAL_EVENTS`) e uma estimativa qualitativa
 * da IA de texto. O contrato (`TrendScore`) já comporta trocar por uma fonte
 * paga real no futuro sem mudar nenhum consumidor.
 */
@Injectable()
export class TrendHunterAgent {
  private readonly logger = new Logger(TrendHunterAgent.name);

  constructor(private readonly ai: AiService) {}

  async run(
    productId: string,
    vision: ProductVisionAttributes,
    market?: MarketResearchResult,
  ): Promise<TrendOutcome> {
    const season = this.nearestSeasonalEvent();
    const context = JSON.stringify(
      {
        product: vision,
        market: market ?? null,
        seasonalEvent: season ? { name: season.name, daysUntil: season.daysUntil } : null,
        today: new Date().toISOString().slice(0, 10),
      },
      null,
      2,
    );

    const request = {
      json: true,
      maxTokens: 1024,
      temperature: 0.4,
      messages: [
        { role: 'system' as const, content: TREND_SCORE_PROMPT },
        { role: 'user' as const, content: `Dados:\n${context}` },
      ],
    };

    let res = await this.ai.generateText<TrendHunterRaw>(request);
    if (!res.data) {
      this.logger.warn(`Score de tendência sem JSON válido p/ ${productId}; repetindo.`);
      res = await this.ai.generateText<TrendHunterRaw>(request);
    }

    const trend = this.normalize(productId, res.data, season?.name);
    return {
      trend,
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
    data: TrendHunterRaw | null,
    seasonalEvent?: string,
  ): TrendScore {
    const safe = data ?? ({} as Partial<TrendHunterRaw>);
    return {
      productId,
      score: clamp(Number(safe.score) || 0, 0, 100),
      reasons: safe.reasons?.length
        ? safe.reasons
        : ['Sem dados suficientes para uma análise detalhada.'],
      seasonalEvent,
      suggestedHashtags: safe.suggestedHashtags ?? [],
      suggestedKeywords: safe.suggestedKeywords ?? [],
      calculatedAt: new Date().toISOString(),
    };
  }

  /** Próxima data comemorativa dentro da janela configurada (`windowDays`), se houver. */
  private nearestSeasonalEvent(): { name: string; daysUntil: number } | null {
    const now = new Date();
    let best: { name: string; daysUntil: number } | null = null;

    for (const event of SEASONAL_EVENTS) {
      const candidate = new Date(now.getFullYear(), event.month - 1, event.day);
      if (candidate < now) candidate.setFullYear(candidate.getFullYear() + 1);
      const daysUntil = Math.round((candidate.getTime() - now.getTime()) / 86_400_000);
      if (daysUntil > event.windowDays) continue;
      if (!best || daysUntil < best.daysUntil) best = { name: event.name, daysUntil };
    }
    return best;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
