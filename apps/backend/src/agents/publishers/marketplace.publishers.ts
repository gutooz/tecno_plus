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

/** Publisher real da Shopee via Shopee Open Platform API. */
@Injectable()
export class ShopeePublisher implements MarketplacePublisher {
  readonly channel = MarketplaceChannel.SHOPEE;
  private readonly logger = new Logger(ShopeePublisher.name);

  constructor(
    private readonly client: ShopeeApiClient,
    private readonly connections: ShopeeConnectionsService,
    @InjectModel(ProductEntity.name) private readonly model: Model<ProductDocument>,
  ) {}

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
    if (!itemId) throw new Error('Produto nunca foi publicado na Shopee.');

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
      throw new Error('Conecte uma loja Shopee em Integracoes antes de publicar.');
    }
    return auth;
  }

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
        this.logger.warn(`Falha ao baixar imagem ${i + 1} do produto ${product.internalSku}.`);
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
      throw new Error('Habilite ao menos um canal logistico no Seller Center da Shopee.');
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
    if (!itemId) throw new Error('Shopee nao retornou item_id para o produto publicado.');

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
