import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketingChannel } from '@tecnoplus/shared';
import { FacebookGraphApi, GraphPostInsights } from '../../modules/social/facebook-graph.api';

/**
 * AGENTE 8 (Marketing IA) — Analytics.
 * Coleta métricas reais (curtidas/comentários/compartilhamentos/salvamentos/
 * alcance/impressões) de um post JÁ publicado via `FacebookGraphApi`. Só
 * Facebook/Instagram implementados — mesmo escopo do Publisher (Fase 4).
 * `clicks` não é coletado nesta fase: a Graph API não expõe um metric de
 * cliques equivalente para posts orgânicos (só em campanhas pagas, já
 * cobertas por `PaidCampaignsService`) — fica 0 de propósito, não inventado.
 */
@Injectable()
export class MarketingAnalyticsAgent {
  private readonly pageId: string;
  private readonly igId: string;
  private readonly token: string;
  private readonly apiVersion: string;

  constructor(private readonly config: ConfigService) {
    this.pageId = this.config.get<string>('facebook.pageId') ?? '';
    this.igId = this.config.get<string>('facebook.instagramBusinessAccountId') ?? '';
    this.token = this.config.get<string>('facebook.pageAccessToken') ?? '';
    this.apiVersion = this.config.get<string>('facebook.apiVersion') ?? 'v19.0';
  }

  private client(): FacebookGraphApi {
    return new FacebookGraphApi(this.pageId, this.igId, this.token, this.apiVersion);
  }

  async fetchFor(channel: MarketingChannel, externalId: string): Promise<GraphPostInsights> {
    if (channel === MarketingChannel.FACEBOOK) return this.client().getPagePostInsights(externalId);
    if (channel === MarketingChannel.INSTAGRAM)
      return this.client().getInstagramMediaInsights(externalId);
    throw new Error(`Canal sem coleta de analytics implementada: ${channel}`);
  }
}
