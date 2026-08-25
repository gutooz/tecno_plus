/**
 * Marketing IA: calendário de conteúdo gerado e mantido pela IA a partir do
 * catálogo — o operador só cadastra produtos, o resto (tendência, copy,
 * imagem, agendamento, publicação, análise) é automático. Mesmo espírito do
 * `Campaign` (campos fixos + bloco solto por variante).
 */

/**
 * Canais de divulgação social do Marketing IA — distinto de `MarketplaceChannel`
 * (que é sobre vender/anunciar em marketplaces). TikTok/YouTube Shorts/Pinterest/
 * Google Meu Negócio não são marketplaces. Facebook/Instagram existem em
 * `MarketplaceChannel`, mas aqui o conjunto é o de canais de CONTEÚDO, não de
 * anúncio de produto. Instagram permanece no tipo para compatibilidade com
 * dados antigos, mas a publicação de marketing está desativada no backend.
 */
export const MarketingChannel = {
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
  TIKTOK: 'tiktok',
  YOUTUBE_SHORTS: 'youtube_shorts',
  PINTEREST: 'pinterest',
  GOOGLE_BUSINESS: 'google_business',
} as const;
export type MarketingChannel = (typeof MarketingChannel)[keyof typeof MarketingChannel];

export const MarketingContentType = {
  FEED: 'feed',
  STORY: 'story',
  REEL: 'reel',
  CAROUSEL: 'carousel',
  OFFER: 'offer',
} as const;
export type MarketingContentType = (typeof MarketingContentType)[keyof typeof MarketingContentType];

/** Equilibrado pelo Calendar Agent — nunca repete o mesmo tema em sequência. */
export const MarketingTheme = {
  PROMOTIONAL: 'promotional',
  EDUCATIONAL: 'educational',
  CURIOSITY: 'curiosity',
  COMPARISON: 'comparison',
  NEW_ARRIVAL: 'new_arrival',
  REVIEW: 'review',
  UNBOXING: 'unboxing',
  BEHIND_THE_SCENES: 'behind_the_scenes',
  TESTIMONIAL: 'testimonial',
  SEASONAL: 'seasonal',
} as const;
export type MarketingTheme = (typeof MarketingTheme)[keyof typeof MarketingTheme];

export const MarketingPostStatus = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  CANCELED: 'canceled',
  FAILED: 'failed',
} as const;
export type MarketingPostStatus = (typeof MarketingPostStatus)[keyof typeof MarketingPostStatus];

/**
 * Score de potencial (Agente 1 — Trend Hunter). V1 sem scraping de
 * redes/marketplaces (não há API oficial gratuita para isso): combina dados
 * de mercado já coletados pelo `MarketAgent`, o calendário sazonal fixo
 * (`SEASONAL_EVENTS`) e uma estimativa qualitativa da IA de texto.
 */
export interface TrendScore {
  productId: string;
  score: number; // 0-100
  reasons: string[];
  seasonalEvent?: string; // ex.: "Black Friday"
  suggestedHashtags: string[];
  suggestedKeywords: string[];
  calculatedAt: string; // ISO
}

/** Conteúdo gerado por post (Agente 3 — Copywriter). */
export interface MarketingPostContent {
  caption: string;
  hashtags: string[];
  cta: string;
  mediaUrls: string[];
}

/** Entrada do calendário de conteúdo (Agente 6 — Calendar). */
export interface MarketingPost {
  id: string;
  ownerId: string;
  productId: string;
  channel: MarketingChannel;
  type: MarketingContentType;
  theme: MarketingTheme;
  /** Campanha do Marketing Planner que originou este post — nunca repetida p/ o mesmo produto. */
  campaignType: MarketingCampaignType;
  status: MarketingPostStatus;
  scheduledFor: string; // ISO
  content: MarketingPostContent;
  trendScore?: number;
  publishedAt?: string;
  externalId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

/** Padrão aprendido a partir dos resultados (Agente 9 — Learning). */
export interface MarketingInsight {
  id: string;
  summary: string; // ex.: "Reels às 19h convertem mais"
  metric: string; // ex.: "engagement_rate"
  confidence: number; // 0-1
  sampleSize: number;
  createdAt: string;
}

/** Métricas coletadas de um post publicado (Agente 8 — Analytics). */
export interface MarketingAnalytics {
  postId: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  clicks: number;
  collectedAt: string;
}

/** Tipo de campanha proposto pelo Marketing Planner (Agente 2). */
export const MarketingCampaignType = {
  LAUNCH: 'launch',
  PROMOTIONAL: 'promotional',
  CLEARANCE: 'clearance',
  COUPON: 'coupon',
  FREE_SHIPPING: 'free_shipping',
  FLASH_SALE: 'flash_sale',
  BUNDLE: 'bundle',
  BLACK_FRIDAY: 'black_friday',
  SEASONAL: 'seasonal',
} as const;
export type MarketingCampaignType =
  (typeof MarketingCampaignType)[keyof typeof MarketingCampaignType];

/** Plano de campanha para um produto (Agente 2 — Marketing Planner). */
export interface MarketingCampaignPlan {
  productId: string;
  campaignType: MarketingCampaignType;
  objective: string;
  targetAudience: string;
  strategy: string;
  idealPostingHour: number; // 0-23
  trendScore: number;
  reasoning: string;
}

export interface SeasonalEvent {
  name: string;
  month: number; // 1-12
  day: number;
  windowDays: number; // dias antes da data que já contam como "alta"
}

/**
 * Datas fixas por ano (aproximadas quando a data oficial varia, ex.: Dia dos
 * Pais é sempre 2º domingo de agosto — aqui fixado no dia 10 como referência).
 */
export const SEASONAL_EVENTS: SeasonalEvent[] = [
  { name: 'Dia das Mães', month: 5, day: 11, windowDays: 14 },
  { name: 'Dia dos Namorados', month: 6, day: 12, windowDays: 14 },
  { name: 'Dia dos Pais', month: 8, day: 10, windowDays: 14 },
  { name: 'Dia das Crianças', month: 10, day: 12, windowDays: 14 },
  { name: 'Black Friday', month: 11, day: 29, windowDays: 21 },
  { name: 'Cyber Monday', month: 12, day: 2, windowDays: 5 },
  { name: 'Natal', month: 12, day: 25, windowDays: 30 },
  { name: 'Volta às Aulas', month: 1, day: 20, windowDays: 20 },
];
