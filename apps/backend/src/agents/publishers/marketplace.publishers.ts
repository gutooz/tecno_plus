import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MarketplaceChannel,
  MarketplacePublisher,
  Product,
  PublishResult,
} from '@tecnoplus/shared';
import {
  Product as ProductEntity,
  ProductDocument,
} from '../../modules/database/schemas/product.schema';
import { ShopeeApiClient } from '../../modules/integrations/shopee-api.client';
import { ShopeeConnectionsService } from '../../modules/integrations/shopee-connections.service';
import { mapProductToShopeeItem } from '../../modules/integrations/shopee-item-mapper';
import { collectImages } from '../../modules/products/shopee/shopee-mapper';

/**
 * Publishers de marketplaces externos. Shopee é implementado de verdade via
 * Shopee Open Platform API (ver `modules/integrations/`) — Mercado Livre e
 * Amazon seguem como pontos de extensão (lançam `NotImplemented`) até que
 * suas respectivas APIs oficiais sejam integradas (ver ROADMAP).
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

@Injectable()
export class ShopeePublisher implements MarketplacePublisher {
  readonly channel = MarketplaceChannel.SHOPEE;
  private readonly logger = new Logger(ShopeePublisher.name);

  constructor(
    private readonly client: ShopeeApiClient,
    private readonly connections: ShopeeConnectionsService,
    @InjectModel(ProductEntity.name) private readonly model: Model<ProductDocument>,
  ) {}

  /** Sem credenciais do app Shopee configuradas no servidor, o canal fica desabilitado na UI. */
  get enabled(): boolean {
    return this.client.configured;
  }

  async publish(product: Product): Promise<PublishResult> {
    return this.pushItem(product);
  }

  async update(product: Product): Promise<PublishResult> {
    return this.pushItem(product);
  }

  async unpublish(product: Product): Promise<PublishResult> {
    const auth = await this.requireAuth(product.ownerId);
    const itemId = product.externalIds?.shopee;
    if (!itemId) throw new Error('Produto nunca foi publicado na Shopee (sem item_id).');

    await this.client.request('/api/v2/product/unlist_item', auth.accessToken, auth.shopId, {
      body: { item_list: [{ item_id: Number(itemId), unlist: true }] },
    });
    await this.model.updateOne(
      { _id: product.id },
      { $pull: { publishedChannels: MarketplaceChannel.SHOPEE } },
    );
    return { channel: this.channel, success: true, publishedAt: new Date().toISOString() };
  }

  private async requireAuth(ownerId: string): Promise<{ accessToken: string; shopId: string }> {
    const auth = await this.connections.getValidAccessToken(ownerId);
    if (!auth) {
      throw new Error(
        'Nenhuma loja Shopee conectada. Conecte em Integrações antes de publicar neste canal.',
      );
    }
    return auth;
  }

  /** Sobe as imagens tratadas do produto ao Media Space e devolve os `image_id`s na ordem. */
  private async uploadImages(
    accessToken: string,
    shopId: string,
    product: Product,
  ): Promise<string[]> {
    const urls = collectImages(product.images as unknown as Record<string, unknown>);
    const ids: string[] = [];
    for (const [i, url] of urls.entries()) {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(
          `Falha ao baixar imagem ${url} do produto ${product.internalSku} — pulando.`,
        );
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      ids.push(
        await this.client.uploadImage(
          accessToken,
          shopId,
          buffer,
          `${product.internalSku}-${i}.jpg`,
        ),
      );
    }
    return ids;
  }

  private async pushItem(product: Product): Promise<PublishResult> {
    const auth = await this.requireAuth(product.ownerId);
    const imageIds = await this.uploadImages(auth.accessToken, auth.shopId, product);
    const payload = mapProductToShopeeItem(product, imageIds);
    payload.logistic_info = (
      await this.client.getEnabledLogisticIds(auth.accessToken, auth.shopId)
    ).map((logistic_id) => ({ logistic_id, enabled: true }));
    if (!payload.logistic_info.length) {
      throw new Error(
        'A loja Shopee não tem nenhum canal logístico habilitado — habilite um no Seller Center.',
      );
    }

    const existingItemId = product.externalIds?.shopee;
    const path = existingItemId ? '/api/v2/product/update_item' : '/api/v2/product/add_item';
    const body = existingItemId ? { ...payload, item_id: Number(existingItemId) } : payload;

    const json = await this.client.request<{ response?: { item_id?: number } }>(
      path,
      auth.accessToken,
      auth.shopId,
      { body },
    );
    const itemId = json.response?.item_id ? String(json.response.item_id) : existingItemId;
    if (!itemId) throw new Error('Shopee não retornou item_id para o produto publicado.');

    await this.model.updateOne(
      { _id: product.id },
      {
        $set: { [`externalIds.${this.channel}`]: itemId },
        $addToSet: { publishedChannels: this.channel },
      },
    );

    this.logger.log(`Produto ${product.internalSku} publicado na Shopee (item_id=${itemId}).`);
    return {
      channel: this.channel,
      success: true,
      externalId: itemId,
      publishedAt: new Date().toISOString(),
    };
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
