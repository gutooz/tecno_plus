/**
 * Enumerações centrais do domínio. Mantidas como `const objects` + union types
 * para funcionar bem tanto no Nest (validação) quanto no Next (tipagem).
 */

export const ProductStatus = {
  UPLOADED: 'uploaded', // imagem recebida, aguardando visão
  PROCESSING: 'processing', // algum agente rodando
  NEEDS_REVIEW: 'needs_review', // IA com baixa confiança / múltiplos produtos
  READY: 'ready', // enriquecido, pronto para publicar
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  DRAFT: 'draft',
  ERROR: 'error',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const CompetitionLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;
export type CompetitionLevel = (typeof CompetitionLevel)[keyof typeof CompetitionLevel];

export const AIProviderName = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  GEMINI: 'gemini',
} as const;
export type AIProviderName = (typeof AIProviderName)[keyof typeof AIProviderName];

export const MarketplaceChannel = {
  WEBSITE: 'website',
  SHOPEE: 'shopee',
  MERCADO_LIVRE: 'mercado_livre',
  AMAZON: 'amazon',
  GOOGLE_SHOPPING: 'google_shopping',
} as const;
export type MarketplaceChannel = (typeof MarketplaceChannel)[keyof typeof MarketplaceChannel];

export const JobStatus = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DELAYED: 'delayed',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
