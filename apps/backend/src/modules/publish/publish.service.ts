import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketplaceChannel, Product as ProductDomain } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { PublisherAgent } from '../../agents/publisher.agent';

/**
 * Serviço de publicação chamado pela API (publish/republish). Reusa o
 * PublisherAgent (Agente 6). A publicação em si é rápida (marca status); por
 * isso pode rodar síncrona aqui sem violar a regra de não bloquear a interface.
 */
@Injectable()
export class PublishService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly publisher: PublisherAgent,
  ) {}

  async publish(ownerId: string, id: string, channel = MarketplaceChannel.WEBSITE) {
    const doc = await this.products.findOne({ _id: id, ownerId });
    if (!doc) throw new NotFoundException('Produto não encontrado');
    const domain = { id: String(doc._id), ...doc.toObject() } as unknown as ProductDomain;
    return this.publisher.publish(domain, channel);
  }

  channels() {
    return this.publisher.availableChannels();
  }
}
