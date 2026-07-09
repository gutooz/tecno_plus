import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  competitionFromListingCount,
  MARKET_SOURCES,
  MarketListing,
  MarketQuery,
  MarketResearchResult,
  MarketSource,
  ProductVisionAttributes,
} from '@tecnoplus/shared';

/**
 * AGENTE 2 — Market Research Agent.
 * Consulta N fontes (adapters) em paralelo, agrega preços e deriva o índice de
 * concorrência. Cada fonte é isolada e substituível por uma API oficial.
 */
@Injectable()
export class MarketAgent {
  private readonly logger = new Logger(MarketAgent.name);

  constructor(@Inject(MARKET_SOURCES) private readonly sources: MarketSource[]) {}

  async run(vision: ProductVisionAttributes): Promise<MarketResearchResult> {
    const query: MarketQuery = {
      name: vision.name,
      brand: vision.brand,
      model: vision.model,
      ean: vision.ean,
      category: vision.category,
    };

    const enabled = this.sources.filter((s) => s.enabled);
    const settled = await Promise.allSettled(enabled.map((s) => s.search(query)));

    const listings: MarketListing[] = [];
    const usedSources: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        listings.push(...r.value);
        if (r.value.length) usedSources.push(enabled[i].name);
      } else {
        this.logger.warn(`Fonte ${enabled[i].name} falhou: ${r.reason}`);
      }
    });

    const prices = listings.map((l) => l.price).filter((p) => p > 0);
    if (prices.length === 0) {
      return {
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        approxListingCount: 0,
        marketRange: { from: 0, to: 0 },
        similarProducts: [],
        competition: 'low',
        sources: usedSources,
        collectedAt: new Date().toISOString(),
      };
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = round2(prices.reduce((a, b) => a + b, 0) / prices.length);

    return {
      averagePrice: avg,
      minPrice: min,
      maxPrice: max,
      approxListingCount: listings.length,
      marketRange: { from: min, to: max },
      similarProducts: listings.slice(0, 10),
      competition: competitionFromListingCount(listings.length),
      sources: usedSources,
      collectedAt: new Date().toISOString(),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
