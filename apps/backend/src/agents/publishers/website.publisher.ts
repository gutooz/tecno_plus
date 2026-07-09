import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MarketplaceChannel,
  MarketplacePublisher,
  Product,
  ProductStatus,
  PublishResult,
} from '@tecnoplus/shared';
import {
  Product as ProductEntity,
  ProductDocument,
} from '../../modules/database/schemas/product.schema';

/**
 * Único publisher REAL do MVP. "Publicar na loja online" = marcar o produto
 * como PUBLISHED no catálogo (que o frontend serve). Os demais canais existem
 * apenas como interfaces/stubs (ver marketplace.publishers.ts).
 */
@Injectable()
export class WebsitePublisher implements MarketplacePublisher {
  readonly channel = MarketplaceChannel.WEBSITE;
  readonly enabled = true;
  private readonly logger = new Logger(WebsitePublisher.name);

  constructor(@InjectModel(ProductEntity.name) private readonly model: Model<ProductDocument>) {}

  async publish(product: Product): Promise<PublishResult> {
    await this.model.updateOne(
      { _id: product.id },
      {
        $set: { status: ProductStatus.PUBLISHED },
        $addToSet: { publishedChannels: MarketplaceChannel.WEBSITE },
      },
    );
    this.logger.log(`Produto ${product.internalSku} publicado na loja.`);
    return {
      channel: this.channel,
      success: true,
      externalId: product.id,
      externalUrl: `/produtos/${product.content?.seo?.slug ?? product.id}`,
      publishedAt: new Date().toISOString(),
    };
  }

  async unpublish(product: Product): Promise<PublishResult> {
    await this.model.updateOne(
      { _id: product.id },
      {
        $set: { status: ProductStatus.HIDDEN },
        $pull: { publishedChannels: MarketplaceChannel.WEBSITE },
      },
    );
    return { channel: this.channel, success: true, publishedAt: new Date().toISOString() };
  }

  update(product: Product): Promise<PublishResult> {
    return this.publish(product);
  }
}
