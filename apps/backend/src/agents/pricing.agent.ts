import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computePrice, MarketResearchResult, MarkupTiers, PricingResult } from '@tecnoplus/shared';

/**
 * AGENTE 5 — Pricing Agent.
 * Aplica as regras de markup por faixa, considera o preço médio de mercado e
 * a concorrência, e devolve preço psicológico (,90), lucro, margem e ROI.
 * A lógica pura vive em `@tecnoplus/shared` (testável e reusável no frontend).
 */
@Injectable()
export class PricingAgent {
  constructor(private readonly config: ConfigService) {}

  private get tiers(): MarkupTiers {
    return {
      tier1: this.config.get<number>('pricing.tier1')!,
      tier2: this.config.get<number>('pricing.tier2')!,
      tier3: this.config.get<number>('pricing.tier3')!,
      tier4: this.config.get<number>('pricing.tier4')!,
    };
  }

  run(purchasePrice: number, market?: MarketResearchResult): PricingResult {
    const computed = computePrice({
      purchasePrice,
      marketAveragePrice: market?.averagePrice,
      tiers: this.tiers,
    });
    return { purchasePrice, ...computed };
  }
}
