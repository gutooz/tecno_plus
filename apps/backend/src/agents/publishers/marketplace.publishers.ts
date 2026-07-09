import {
  MarketplaceChannel,
  MarketplacePublisher,
  Product,
  PublishResult,
} from '@tecnoplus/shared';

/**
 * Publishers de marketplaces externos. No MVP existem APENAS como pontos de
 * extensão: implementam a interface `MarketplacePublisher` porém lançam
 * `NotImplemented`. Plugar a API oficial no futuro = preencher estes métodos,
 * sem tocar no PublisherAgent nem no restante do sistema.
 */

class NotImplementedPublisher implements MarketplacePublisher {
  readonly enabled = false;
  constructor(readonly channel: MarketplaceChannel) {}

  private fail(): never {
    throw new Error(`Publisher "${this.channel}" ainda não implementado (extensão futura).`);
  }

  publish(_product: Product): Promise<PublishResult> {
    return this.fail();
  }
  unpublish(_product: Product): Promise<PublishResult> {
    return this.fail();
  }
  update(_product: Product): Promise<PublishResult> {
    return this.fail();
  }
}

export class ShopeePublisher extends NotImplementedPublisher {
  constructor() {
    super(MarketplaceChannel.SHOPEE);
  }
}

export class MercadoLivrePublisher extends NotImplementedPublisher {
  constructor() {
    super(MarketplaceChannel.MERCADO_LIVRE);
  }
}

export class AmazonPublisher extends NotImplementedPublisher {
  constructor() {
    super(MarketplaceChannel.AMAZON);
  }
}
