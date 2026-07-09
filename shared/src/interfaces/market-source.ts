import type { CompetitionLevel } from '../types/enums';

export interface MarketListing {
  title: string;
  price: number;
  source: string;
  url?: string;
}

export interface MarketQuery {
  name?: string;
  brand?: string;
  model?: string;
  ean?: string;
  category?: string;
}

/**
 * Fonte de pesquisa de preços (Mercado Livre, Shopee, Amazon, Google Shopping...).
 *
 * Cada fonte é um adapter isolado. No MVP as fontes retornam dados via adapters
 * substituíveis; quando as APIs oficiais estiverem disponíveis, troca-se apenas
 * a implementação — o `MarketResearchAgent` consome sempre esta interface.
 */
export interface MarketSource {
  readonly name: string;
  readonly enabled: boolean;
  search(query: MarketQuery): Promise<MarketListing[]>;
}

export const MARKET_SOURCES = Symbol('MARKET_SOURCES');

/** Deriva o índice de concorrência a partir do volume de anúncios. */
export function competitionFromListingCount(count: number): CompetitionLevel {
  if (count < 30) return 'low';
  if (count < 150) return 'medium';
  return 'high';
}
