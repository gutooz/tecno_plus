import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketingChannel } from '@tecnoplus/shared';
import { FacebookGraphApi } from '../../modules/social/facebook-graph.api';

export interface PublishInput {
  channel: MarketingChannel;
  caption: string;
  imageUrl: string;
}

export interface PublishOutcome {
  externalId: string;
  publishedAt: string;
}

/**
 * AGENTE 7 (Marketing IA) — Publisher.
 * Publica de verdade em Facebook/Instagram via `FacebookGraphApi` (mesmo
 * client de baixo nível usado por `FacebookPublisher`/`InstagramPublisher`
 * em `agents/publishers/social.publishers.ts` — não reaproveitamos essas
 * classes porque elas operam em cima de `Product` e da legenda única de
 * `socialApproval`; um produto pode ter VÁRIOS `MarketingPost` ao longo do
 * tempo, cada um com sua própria legenda/imagem). TikTok, Pinterest, YouTube
 * Shorts e Google Meu Negócio ficam com o contrato pronto mas inertes —
 * decisão combinada com o operador: só Facebook/Instagram nesta fase, mesmo
 * padrão de `MercadoLivrePublisher`/`AmazonPublisher` hoje.
 */
@Injectable()
export class MarketingPublisherAgent {
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

  configuredFor(channel: MarketingChannel): boolean {
    if (channel === MarketingChannel.FACEBOOK) return Boolean(this.pageId && this.token);
    if (channel === MarketingChannel.INSTAGRAM) return Boolean(this.igId && this.token);
    return false;
  }

  private client(): FacebookGraphApi {
    return new FacebookGraphApi(this.pageId, this.igId, this.token, this.apiVersion);
  }

  async publish(input: PublishInput): Promise<PublishOutcome> {
    if (!input.imageUrl) throw new Error('Post sem imagem — não é possível publicar.');

    if (input.channel === MarketingChannel.FACEBOOK) {
      if (!this.configuredFor(input.channel)) {
        throw new Error('Facebook não configurado (FACEBOOK_PAGE_ID/FACEBOOK_PAGE_ACCESS_TOKEN).');
      }
      const result = await this.client().postPagePhoto(input.imageUrl, input.caption);
      return { externalId: result.id, publishedAt: new Date().toISOString() };
    }

    if (input.channel === MarketingChannel.INSTAGRAM) {
      if (!this.configuredFor(input.channel)) {
        throw new Error(
          'Instagram não configurado (INSTAGRAM_BUSINESS_ACCOUNT_ID/FACEBOOK_PAGE_ACCESS_TOKEN).',
        );
      }
      const creationId = await this.client().createInstagramMedia(input.imageUrl, input.caption);
      const mediaId = await this.client().publishInstagramMedia(creationId);
      return { externalId: mediaId, publishedAt: new Date().toISOString() };
    }

    throw new Error(`Canal ainda não implementado para publicação real: ${input.channel}`);
  }
}
