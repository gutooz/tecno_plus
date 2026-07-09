import type { CompetitionLevel, MarketplaceChannel, ProductStatus } from './enums';

/**
 * Atributos extraídos pela visão computacional (Agente 1).
 * Todos opcionais: uma foto pode não revelar tudo.
 */
export interface ProductVisionAttributes {
  name?: string;
  brand?: string;
  model?: string;
  category?: string;
  subcategory?: string;
  color?: string;
  material?: string;
  size?: string;
  barcode?: string;
  ean?: string;
  sku?: string;
  packageText?: string;
  quantity?: number;
  supplier?: string;
  labelPrice?: number; // preço da etiqueta, se visível
  shortDescription?: string;
  features?: string[];
}

/** Resultado de pesquisa de mercado (Agente 2). */
export interface MarketResearchResult {
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  approxListingCount: number;
  marketRange: { from: number; to: number };
  similarProducts: Array<{
    title: string;
    price: number;
    source: string;
    url?: string;
  }>;
  competition: CompetitionLevel;
  sources: string[]; // marketplaces consultados
  collectedAt: string; // ISO
}

/** Conteúdo comercial/SEO gerado (Agente 3). */
export interface GeneratedContent {
  title: string;
  description: string;
  longDescription: string;
  summary: string;
  bulletPoints: string[];
  seo: {
    metaDescription: string;
    slug: string;
    keywords: string[];
    tags: string[];
  };
  category: string;
  technicalSpecs: Record<string, string>;
  marketplaceDescription: string; // versão curta p/ marketplace
}

/** Preço calculado (Agente 5). */
export interface PricingResult {
  purchasePrice: number;
  suggestedPrice: number; // já com "preço psicológico"
  markupApplied: number; // percentual (ex.: 0.9 = 90%)
  profit: number;
  marginPercent: number;
  roi: number;
}

/** Uma imagem tratada e suas variantes (Agente 4). */
export interface ProductImageSet {
  original: string; // URL storage
  hd?: string;
  square?: string;
  webp?: string;
  thumbnail?: string;
  backgroundRemoved?: string;
  isManufacturerProvided?: boolean;
}

/**
 * Agregado de produto — o documento central do catálogo.
 * `id` é o identificador do domínio; no Mongo mapeamos para `_id`.
 */
export interface Product {
  id: string;
  ownerId: string; // usuário dono do cadastro
  internalSku: string;
  status: ProductStatus;
  aiConfidence: number; // 0..1
  vision: ProductVisionAttributes;
  market?: MarketResearchResult;
  content?: GeneratedContent;
  pricing?: PricingResult;
  images: ProductImageSet;
  /** Quando a visão detecta vários produtos numa foto. */
  multipleProductsDetected?: boolean;
  publishedChannels: MarketplaceChannel[];
  createdAt: string;
  updatedAt: string;
}
