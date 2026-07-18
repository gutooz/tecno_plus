import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { FacebookGraphApi } from '../../modules/social/facebook-graph.api';

/** Legenda do post: a aprovada/editada no Telegram, ou o texto gerado pelo Content Agent. */
function captionFor(product: Product): string {
  const approved = product.socialApproval?.caption;
  if (approved) return approved;
  return (
    product.content?.marketplaceDescription ||
    product.content?.description ||
    product.content?.title ||
    ''
  );
}

/** Imagem pública do produto — Graph API precisa buscar a URL, não aceita `data:` URI (modo no-op do Supabase). */
function imageUrlFor(product: Product): string {
  const url = product.images?.hd || product.images?.square || product.images?.original;
  if (!url) throw new Error('Produto sem imagem pública para publicar.');
  if (!/^https?:\/\//.test(url)) {
    throw new Error('Imagem do produto não é uma URL pública (Supabase Storage não configurado?).');
  }
  return url;
}

/**
 * Publica no feed da Página do Facebook. Só fica `enabled` com
 * FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN configurados — mesmo padrão de
 * modo no-op do `StorageService`.
 */
@Injectable()
export class FacebookPublisher implements MarketplacePublisher {
  readonly channel = MarketplaceChannel.FACEBOOK;
  readonly enabled: boolean;
  private readonly logger = new Logger(FacebookPublisher.name);
  private readonly api: FacebookGraphApi | null;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(ProductEntity.name) private readonly model: Model<ProductDocument>,
  ) {
    const pageId = this.config.get<string>('facebook.pageId') ?? '';
    const token = this.config.get<string>('facebook.pageAccessToken') ?? '';
    const igId = this.config.get<string>('facebook.instagramBusinessAccountId') ?? '';
    const apiVersion = this.config.get<string>('facebook.apiVersion') ?? 'v19.0';
    this.enabled = Boolean(pageId && token);
    this.api = this.enabled ? new FacebookGraphApi(pageId, igId, token, apiVersion) : null;
  }

  async publish(product: Product): Promise<PublishResult> {
    if (!this.api)
      throw new Error('Facebook não configurado (FACEBOOK_PAGE_ID/FACEBOOK_PAGE_ACCESS_TOKEN).');
    const result = await this.api.postPagePhoto(imageUrlFor(product), captionFor(product));
    await this.model.updateOne(
      { _id: product.id },
      { $addToSet: { publishedChannels: MarketplaceChannel.FACEBOOK } },
    );
    this.logger.log(`Produto ${product.internalSku} publicado no Facebook (${result.id}).`);
    return {
      channel: this.channel,
      success: true,
      externalId: result.id,
      publishedAt: new Date().toISOString(),
    };
  }

  unpublish(): Promise<PublishResult> {
    throw new Error('Remover post do Facebook ainda não implementado (extensão futura).');
  }

  update(product: Product): Promise<PublishResult> {
    return this.publish(product);
  }
}

/**
 * Publica na conta comercial do Instagram vinculada à Página (fluxo em 2
 * passos da Graph API: cria o container de mídia, depois publica).
 */
@Injectable()
export class InstagramPublisher implements MarketplacePublisher {
  readonly channel = MarketplaceChannel.INSTAGRAM;
  readonly enabled: boolean;
  private readonly logger = new Logger(InstagramPublisher.name);
  private readonly api: FacebookGraphApi | null;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(ProductEntity.name) private readonly model: Model<ProductDocument>,
  ) {
    const pageId = this.config.get<string>('facebook.pageId') ?? '';
    const token = this.config.get<string>('facebook.pageAccessToken') ?? '';
    const igId = this.config.get<string>('facebook.instagramBusinessAccountId') ?? '';
    const apiVersion = this.config.get<string>('facebook.apiVersion') ?? 'v19.0';
    this.enabled = Boolean(igId && token);
    this.api = this.enabled ? new FacebookGraphApi(pageId, igId, token, apiVersion) : null;
  }

  async publish(product: Product): Promise<PublishResult> {
    if (!this.api)
      throw new Error(
        'Instagram não configurado (INSTAGRAM_BUSINESS_ACCOUNT_ID/FACEBOOK_PAGE_ACCESS_TOKEN).',
      );
    const creationId = await this.api.createInstagramMedia(
      imageUrlFor(product),
      captionFor(product),
    );
    const mediaId = await this.api.publishInstagramMedia(creationId);
    await this.model.updateOne(
      { _id: product.id },
      { $addToSet: { publishedChannels: MarketplaceChannel.INSTAGRAM } },
    );
    this.logger.log(`Produto ${product.internalSku} publicado no Instagram (${mediaId}).`);
    return {
      channel: this.channel,
      success: true,
      externalId: mediaId,
      publishedAt: new Date().toISOString(),
    };
  }

  unpublish(): Promise<PublishResult> {
    throw new Error('Remover post do Instagram ainda não implementado (extensão futura).');
  }

  update(product: Product): Promise<PublishResult> {
    return this.publish(product);
  }
}
