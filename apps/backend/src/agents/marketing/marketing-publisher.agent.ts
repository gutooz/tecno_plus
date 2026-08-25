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
 * Publica de verdade no Facebook via `FacebookGraphApi`. Instagram fica
 * desativado por decisão operacional; se algum post antigo ainda trouxer esse
 * canal, a publicação falha de forma explícita.
 */
@Injectable()
export class MarketingPublisherAgent {
  private readonly pageId: string;
  private readonly token: string;
  private readonly apiVersion: string;

  constructor(private readonly config: ConfigService) {
    this.pageId = this.config.get<string>('facebook.pageId') ?? '';
    this.token = this.config.get<string>('facebook.pageAccessToken') ?? '';
    this.apiVersion = this.config.get<string>('facebook.apiVersion') ?? 'v19.0';
  }

  configuredFor(channel: MarketingChannel): boolean {
    if (channel === MarketingChannel.FACEBOOK) return Boolean(this.pageId && this.token);
    return false;
  }

  private client(): FacebookGraphApi {
    return new FacebookGraphApi(this.pageId, '', this.token, this.apiVersion);
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
      throw new Error('Instagram desativado para marketing.');
    }

    throw new Error(`Canal ainda não implementado para publicação real: ${input.channel}`);
  }
}
