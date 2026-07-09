import type { MarketplaceChannel } from '../types/enums';
import type { Product } from '../types/product';

export interface PublishResult {
  channel: MarketplaceChannel;
  success: boolean;
  externalId?: string; // id do anúncio no canal
  externalUrl?: string;
  message?: string;
  publishedAt: string;
}

/**
 * Contrato de publicação por canal.
 *
 * No MVP apenas `WebsitePublisher` é implementado de verdade. Shopee, Mercado
 * Livre e Amazon existem como classes que implementam esta interface e lançam
 * `NotImplementedError` — os pontos de extensão já estão no lugar, então plugar
 * a API oficial no futuro não exige mudança arquitetural.
 */
export interface MarketplacePublisher {
  readonly channel: MarketplaceChannel;
  readonly enabled: boolean;

  publish(product: Product): Promise<PublishResult>;
  unpublish(product: Product): Promise<PublishResult>;
  /** Atualiza um anúncio já existente. */
  update(product: Product): Promise<PublishResult>;
}

export const MARKETPLACE_PUBLISHERS = Symbol('MARKETPLACE_PUBLISHERS');
