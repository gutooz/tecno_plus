import type { CompetitionLevel, MarketplaceChannel, ProductStatus } from './enums';
import type { MarketingCampaignPlan, TrendScore } from './marketing';

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
  /** Peso em kg com embalagem. Obrigatório na Shopee — define o frete. */
  weight?: number;
  /**
   * Medidas do pacote em cm. A Shopee exige as três juntas — sem elas o produto
   * não é salvo ("Este campo não pode ficar em branco").
   */
  length?: number;
  width?: number;
  height?: number;
  /**
   * De onde saiu o `weight`. `etiqueta` foi lido da foto; `estimado` a IA
   * deduziu de material/tamanho/quantidade — não é medição. Serve para achar
   * os produtos a reconferir se o frete cobrado vier errado.
   */
  weightSource?: 'etiqueta' | 'estimado';
  /**
   * ID numérico da árvore de categorias da Shopee (ex.: 120039), digitado
   * pelo operador. A IA só extrai um caminho de texto ("Beleza > Maquiagem");
   * tanto a planilha de importação em massa quanto o Add/Update Item da API
   * (aqui obrigatório) precisam do ID — nunca inventado.
   */
  shopeeCategoryId?: number;
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
  /** 3 imagens prontas p/ Shopee (1:1, fundo limpo): produto recortado e recomposto. */
  shopee?: string[];
}

/**
 * Rascunho de post social (Facebook/Instagram) aguardando aprovação do dono
 * via Telegram. Um produto tem no máximo um `socialApproval` ativo por vez —
 * se rejeitado, o próximo ciclo do agendador pode tentar outro produto.
 */
export interface SocialApproval {
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  caption: string;
  telegramChatId: string;
  telegramMessageId: number;
  scheduledAt: string; // ISO — quando foi mandado pra aprovação
  postedAt?: string; // ISO — quando publicou de fato
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
  /** ID do anúncio em cada canal externo (ex.: `{ shopee: "2201..." }`) — necessário para update/unlist. */
  externalIds?: Partial<Record<MarketplaceChannel, string>>;
  socialApproval?: SocialApproval;
  /** Análise do Marketing IA (Trend Hunter + Marketing Planner) — ver `@tecnoplus/shared/types/marketing`. */
  marketing?: {
    trend?: TrendScore;
    plan?: MarketingCampaignPlan;
  };
  createdAt: string;
  updatedAt: string;
}
