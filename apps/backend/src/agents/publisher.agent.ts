import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MARKETPLACE_PUBLISHERS,
  MarketplaceChannel,
  MarketplacePublisher,
  Product,
  PublishResult,
} from '@tecnoplus/shared';

/**
 * AGENTE 6 — Publisher Agent.
 * Roteia a publicação para o publisher do canal solicitado. Preparado para
 * múltiplos canais; no MVP só WEBSITE está habilitado.
 */
@Injectable()
export class PublisherAgent {
  private readonly logger = new Logger(PublisherAgent.name);
  private readonly byChannel: Map<MarketplaceChannel, MarketplacePublisher>;

  constructor(@Inject(MARKETPLACE_PUBLISHERS) publishers: MarketplacePublisher[]) {
    this.byChannel = new Map(publishers.map((p) => [p.channel, p]));
  }

  availableChannels(): { channel: MarketplaceChannel; enabled: boolean }[] {
    return [...this.byChannel.values()].map((p) => ({ channel: p.channel, enabled: p.enabled }));
  }

  async publish(product: Product, channel: MarketplaceChannel): Promise<PublishResult> {
    const publisher = this.byChannel.get(channel);
    if (!publisher) throw new NotFoundException(`Canal desconhecido: ${channel}`);
    return publisher.publish(product);
  }

  async unpublish(product: Product, channel: MarketplaceChannel): Promise<PublishResult> {
    const publisher = this.byChannel.get(channel);
    if (!publisher) throw new NotFoundException(`Canal desconhecido: ${channel}`);
    return publisher.unpublish(product);
  }
}
