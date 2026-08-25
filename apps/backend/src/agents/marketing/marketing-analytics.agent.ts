import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketingChannel } from '@tecnoplus/shared';
import { FacebookGraphApi, GraphPostInsights } from '../../modules/social/facebook-graph.api';

/**
 * AGENTE 8 (Marketing IA) — Analytics.
 * Coleta métricas reais (curtidas/comentários/compartilhamentos/salvamentos/
 * alcance/impressões) de um post JÁ publicado via `FacebookGraphApi`. Só
 * Facebook está ativo para marketing; Instagram fica bloqueado.
 * `clicks` não é coletado nesta fase: a Graph API não expõe um metric de
 * cliques equivalente para posts orgânicos (só em campanhas pagas, já
 * cobertas por `PaidCampaignsService`) — fica 0 de propósito, não inventado.
 */
@Injectable()
export class MarketingAnalyticsAgent {
  private readonly pageId: string;
  private readonly token: string;
  private readonly apiVersion: string;

  constructor(private readonly config: ConfigService) {
    this.pageId = this.config.get<string>('facebook.pageId') ?? '';
    this.token = this.config.get<string>('facebook.pageAccessToken') ?? '';
    this.apiVersion = this.config.get<string>('facebook.apiVersion') ?? 'v19.0';
  }

  private client(): FacebookGraphApi {
    return new FacebookGraphApi(this.pageId, '', this.token, this.apiVersion);
  }

  async fetchFor(channel: MarketingChannel, externalId: string): Promise<GraphPostInsights> {
    if (channel === MarketingChannel.FACEBOOK) return this.client().getPagePostInsights(externalId);
    if (channel === MarketingChannel.INSTAGRAM)
      throw new Error('Instagram desativado para marketing.');
    throw new Error(`Canal sem coleta de analytics implementada: ${channel}`);
  }
}
