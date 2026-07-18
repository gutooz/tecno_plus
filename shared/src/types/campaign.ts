import type { MarketplaceChannel } from './enums';

/**
 * Campanhas de divulgação social (Facebook/Instagram): orgânicas (posts
 * agendados em lote, sem custo) ou pagas (Facebook Marketing API, com gasto
 * real). Um único tipo com discriminador `type`, no mesmo espírito do
 * `Product` — campos fixos + bloco solto por variante.
 */
export const CampaignStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export interface OrganicCampaignItem {
  productId: string;
  scheduledFor: string; // ISO date
  status: 'queued' | 'sent_for_approval' | 'posted' | 'skipped';
}

export interface OrganicCampaignConfig {
  channels: MarketplaceChannel[];
  intervalDays: number;
  startDate: string; // ISO date
  /** Materializado na criação da campanha — lista fixa, não recalculada depois. */
  items: OrganicCampaignItem[];
}

export interface PaidCampaignTargeting {
  countries: string[];
  ageMin: number;
  ageMax: number;
  genders?: ('male' | 'female')[];
}

export interface PaidCampaignConfig {
  objective: 'POST_ENGAGEMENT' | 'REACH' | 'TRAFFIC';
  dailyBudgetCents: number;
  currency: string;
  targeting: PaidCampaignTargeting;
  productId: string;
  channel: MarketplaceChannel;
  external: {
    campaignId?: string;
    adSetId?: string;
    adId?: string;
    creativeId?: string;
  };
  startDate?: string;
  endDate?: string;
  /** Preenchido se a cadeia de criação na Marketing API falhou no meio do caminho. */
  lastError?: string;
}

export interface Campaign {
  id: string;
  ownerId: string;
  type: 'organic' | 'paid';
  name: string;
  status: CampaignStatus;
  organic?: OrganicCampaignConfig;
  paid?: PaidCampaignConfig;
  createdAt: string;
  updatedAt: string;
}
