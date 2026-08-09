import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MarketplaceChannel, Product as ProductDomain } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { PublisherAgent } from '../../agents/publisher.agent';

function productIdValues(id: string): unknown[] {
  return Types.ObjectId.isValid(id) ? [new Types.ObjectId(id), id] : [id];
}

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

  async publish(
    ownerId: string,
    id: string,
    channel: MarketplaceChannel = MarketplaceChannel.WEBSITE,
  ) {
    const raw = await this.products.collection.findOne({
      ownerId,
      _id: { $in: productIdValues(id) },
    } as never);
    const doc = raw ? this.products.hydrate(raw) : null;
    if (!doc) throw new NotFoundException('Produto não encontrado');
    const domain = { id: String(doc._id), ...doc.toObject() } as unknown as ProductDomain;
    return this.publisher.publish(domain, channel);
  }

  /**
   * Publica vários produtos de uma vez. Cada item é independente — uma falha
   * não interrompe os demais (mesmo comportamento de `publish`, só em lote).
   */
  async publishBatch(
    ownerId: string,
    ids: string[],
    channel: MarketplaceChannel = MarketplaceChannel.WEBSITE,
  ) {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          await this.publish(ownerId, id, channel);
          return { id, ok: true as const };
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          return { id, ok: false as const, error };
        }
      }),
    );
    return {
      total: results.length,
      published: results.filter((r) => r.ok).length,
      results,
    };
  }

  channels() {
    return this.publisher.availableChannels();
  }
}
