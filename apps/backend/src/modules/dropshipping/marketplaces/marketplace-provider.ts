export interface MarketplacePublicationDraft {
  listingId: string;
  sellerUserId: string;
  supplierProductId: string;
  title: string;
  description: string;
  categoryId?: string;
  images: string[];
  price: number;
  stock: number;
  sellerSku?: string;
  weight?: number;
  dimensions?: { length?: number; width?: number; height?: number };
  variants?: Record<string, unknown>[];
}

export interface MarketplacePublicationResult {
  externalItemId: string;
  externalVariationIds?: Record<string, string>;
  externalStoreId?: string;
  warnings?: string[];
}

export interface MarketplaceProvider {
  readonly channel: string;
  validatePublication(draft: MarketplacePublicationDraft): Promise<string[]>;
  publishProduct(draft: MarketplacePublicationDraft): Promise<MarketplacePublicationResult>;
}
