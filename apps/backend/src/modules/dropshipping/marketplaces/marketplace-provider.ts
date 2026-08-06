export interface MarketplacePublicationDraft {
  listingId: string;
  title: string;
  description: string;
  categoryId?: string;
  images: string[];
  price: number;
  stock: number;
  variants?: Record<string, unknown>[];
}

export interface MarketplacePublicationResult {
  externalItemId: string;
  externalVariationIds?: Record<string, string>;
  warnings?: string[];
}

export interface MarketplaceProvider {
  readonly channel: string;
  validatePublication(draft: MarketplacePublicationDraft): Promise<string[]>;
  publishProduct(draft: MarketplacePublicationDraft): Promise<MarketplacePublicationResult>;
}
