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
import { AiService } from '../../modules/ai/ai.service';
import {
  buildShopeeCategoryCandidates,
  normalizeShopeeCategoryChoice,
  shortlistShopeeCategoryCandidates,
  ShopeeCategoryCandidate,
} from '../../modules/integrations/shopee-category-inference';
import { mapProductToShopeeItem } from '../../modules/integrations/shopee-item-mapper';
import { collectImages } from '../../modules/products/shopee/shopee-mapper';
import { MercadoLivreApiClient } from '../../modules/integrations/mercado-livre-api.client';
import { MercadoLivreConnectionsService } from '../../modules/integrations/mercado-livre-connections.service';
import { mapProductToMercadoLivreItem } from '../../modules/integrations/mercado-livre-item-mapper';

/** Publisher real da Shopee via Shopee Open Platform API. */
@Injectable()
export class ShopeePublisher implements MarketplacePublisher {
  readonly channel = MarketplaceChannel.SHOPEE;
  private readonly logger = new Logger(ShopeePublisher.name);

  constructor(
    private readonly client: ShopeeApiClient,
    private readonly connections: ShopeeConnectionsService,
    private readonly ai: AiService,
    @InjectModel(ProductEntity.name) private readonly model: Model<ProductDocument>,
  ) {}

  private readonly categoryCache = new Map<string, Promise<ShopeeCategoryCandidate[]>>();

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
      try {
        ids.push(
          await this.client.uploadImage(
            accessToken,
            shopId,
            buffer,
            `${product.internalSku}-${i}.jpg`,
          ),
        );
      } catch (error) {
        this.logger.warn(
          `Shopee recusou a imagem ${i + 1} do produto ${product.internalSku}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return ids;
  }

  private getCategoryCandidates(
    accessToken: string,
    shopId: string,
  ): Promise<ShopeeCategoryCandidate[]> {
    const cached = this.categoryCache.get(shopId);
    if (cached) return cached;

    const promise = this.client
      .getCategories(accessToken, shopId)
      .then((categories) => buildShopeeCategoryCandidates(categories))
      .catch((error) => {
        this.categoryCache.delete(shopId);
        throw error;
      });
    this.categoryCache.set(shopId, promise);
    return promise;
  }

  private async ensureShopeeCategory(
    product: Product,
    accessToken: string,
    shopId: string,
  ): Promise<Product> {
    const currentCategoryId = Number(product.vision.shopeeCategoryId);
    if (Number.isFinite(currentCategoryId) && currentCategoryId > 0) return product;

    const candidates = await this.getCategoryCandidates(accessToken, shopId);
    if (!candidates.length) {
      throw new Error('Shopee nao retornou categorias oficiais para escolher.');
    }

    const title = product.content?.title || product.vision.name || product.internalSku;
    const categoryText = product.content?.category || product.vision.category || '';
    const shortlist = shortlistShopeeCategoryCandidates(
      candidates,
      [title, categoryText, product.vision.brand].filter(Boolean).join(' '),
    );

    const response = await this.ai.generateText<{
      categoryId: number;
      confidence?: number;
      reason?: string;
    }>({
      json: true,
      maxTokens: 500,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Escolha a categoria Shopee oficial mais adequada para publicar o produto. ' +
            'Use somente um categoryId presente na lista de candidatos. ' +
            'Baseie a escolha principalmente no titulo do produto e use a categoria textual apenas como apoio.',
        },
        {
          role: 'user',
          content:
            `Produto:\n${JSON.stringify(
              {
                title,
                category: categoryText || null,
                brand: product.vision.brand ?? null,
              },
              null,
              2,
            )}\n\n` +
            `Candidatos oficiais:\n${JSON.stringify(shortlist, null, 2)}\n\n` +
            'Responda no formato {"categoryId": 123, "confidence": 0.0, "reason": "..."}',
        },
      ],
    });

    const selected = normalizeShopeeCategoryChoice(response.data, shortlist);
    if (!selected) {
      throw new Error('IA nao conseguiu escolher uma categoria Shopee oficial para este titulo.');
    }

    await this.model.updateOne(
      { _id: product.id },
      {
        $set: {
          'vision.shopeeCategoryId': selected.id,
          'vision.shopeeCategoryPath': selected.path,
          'vision.shopeeCategorySource': 'ia_titulo',
        },
      },
    );
    this.logger.log(
      `Categoria Shopee inferida p/ ${product.internalSku}: ${selected.id} (${selected.path})`,
    );

    return {
      ...product,
      vision: {
        ...product.vision,
        shopeeCategoryId: selected.id,
      },
    };
  }

  private async pushItem(product: Product): Promise<PublishResult> {
    const auth = await this.requireAuth(product.ownerId);
    const categorizedProduct = await this.ensureShopeeCategory(
      product,
      auth.accessToken,
      auth.shopId,
    );
    const imageIds = await this.uploadImages(auth.accessToken, auth.shopId, categorizedProduct);
    const payload = mapProductToShopeeItem(categorizedProduct, imageIds);
    payload.logistic_info = (
      await this.client.getEnabledLogisticIds(auth.accessToken, auth.shopId)
    ).map((logistic_id) => ({ logistic_id, enabled: true }));

    if (!payload.logistic_info.length) {
      throw new Error('Habilite ao menos um canal logistico no Seller Center da Shopee.');
    }

    const existingItemId = categorizedProduct.externalIds?.shopee;
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

    this.logger.log(
      `Produto ${categorizedProduct.internalSku} publicado na Shopee (item_id=${itemId}).`,
    );
    return {
      channel: this.channel,
      success: true,
      externalId: itemId,
      publishedAt: new Date().toISOString(),
    };
  }
}

/** Publisher real do Mercado Livre via API oficial (OAuth2 + PKCE). */
@Injectable()
export class MercadoLivrePublisher implements MarketplacePublisher {
  readonly channel = MarketplaceChannel.MERCADO_LIVRE;
  private readonly logger = new Logger(MercadoLivrePublisher.name);

  constructor(
    private readonly client: MercadoLivreApiClient,
    private readonly connections: MercadoLivreConnectionsService,
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

  /** O Mercado Livre não tem "excluir" anúncio — pausar é o equivalente ao unlist da Shopee. */
  async unpublish(product: Product): Promise<PublishResult> {
    const auth = await this.requireAuth(product.ownerId);
    const itemId = product.externalIds?.mercado_livre;
    if (!itemId) throw new Error('Produto nunca foi publicado no Mercado Livre.');

    await this.client.updateItem(itemId, { status: 'paused' }, auth.accessToken);
    await this.model.updateOne(
      { _id: product.id },
      { $pull: { publishedChannels: MarketplaceChannel.MERCADO_LIVRE } },
    );
    return { channel: this.channel, success: true, publishedAt: new Date().toISOString() };
  }

  private async requireAuth(ownerId: string): Promise<{ accessToken: string; mlUserId: string }> {
    const auth = await this.connections.getValidAccessToken(ownerId);
    if (!auth) {
      throw new Error('Conecte uma conta Mercado Livre em Integracoes antes de publicar.');
    }
    return auth;
  }

  private async pushItem(product: Product): Promise<PublishResult> {
    const auth = await this.requireAuth(product.ownerId);
    const { item, description } = mapProductToMercadoLivreItem(product);

    const existingItemId = product.externalIds?.mercado_livre;
    const json = existingItemId
      ? await this.client.updateItem<{ id?: string }>(existingItemId, item, auth.accessToken)
      : await this.client.createItem<{ id?: string }>(item, auth.accessToken);

    const itemId = json.id ? String(json.id) : existingItemId;
    if (!itemId) throw new Error('Mercado Livre nao retornou id para o produto publicado.');

    await this.client.setItemDescription(
      itemId,
      description,
      auth.accessToken,
      existingItemId ? 'PUT' : 'POST',
    );

    await this.model.updateOne(
      { _id: product.id },
      {
        $set: { [`externalIds.${this.channel}`]: itemId },
        $addToSet: { publishedChannels: this.channel },
      },
    );

    this.logger.log(`Produto ${product.internalSku} publicado no Mercado Livre (id=${itemId}).`);
    return {
      channel: this.channel,
      success: true,
      externalId: itemId,
      publishedAt: new Date().toISOString(),
    };
  }
}
