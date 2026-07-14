import { Module } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MARKET_SOURCES, MARKETPLACE_PUBLISHERS } from '@tecnoplus/shared';
import { VisionAgent } from './vision.agent';
import { MarketAgent } from './market/market.agent';
import { SampleMarketSource } from './market/sample-market.source';
import { ContentAgent } from './content.agent';
import { ImageAgent } from './image.agent';
import { PricingAgent } from './pricing.agent';
import { PublisherAgent } from './publisher.agent';
import { WebsitePublisher } from './publishers/website.publisher';
import {
  AmazonPublisher,
  MercadoLivrePublisher,
  ShopeePublisher,
} from './publishers/marketplace.publishers';
import { Product, ProductDocument } from '../modules/database/schemas/product.schema';
import { PipelineOrchestrator } from '../modules/queues/pipeline.orchestrator';
import { PIPELINE_ORCHESTRATOR } from '../modules/queues/queue.service';

/**
 * Reúne os 6 agentes + as coleções de adapters (fontes de mercado, publishers).
 * Os arrays são resolvidos por token (MARKET_SOURCES / MARKETPLACE_PUBLISHERS),
 * então registrar uma nova fonte/canal é adicionar uma linha aqui.
 */
@Module({
  providers: [
    VisionAgent,
    MarketAgent,
    ContentAgent,
    ImageAgent,
    PricingAgent,
    PublisherAgent,
    PipelineOrchestrator,
    // Alias por token string p/ o QueueService resolver a orquestração sem
    // importar a classe (evita ciclo de import).
    { provide: PIPELINE_ORCHESTRATOR, useExisting: PipelineOrchestrator },
    WebsitePublisher,
    {
      provide: MARKET_SOURCES,
      useFactory: () => [new SampleMarketSource()],
    },
    {
      provide: MARKETPLACE_PUBLISHERS,
      inject: [WebsitePublisher],
      useFactory: (website: WebsitePublisher) => [
        website,
        new ShopeePublisher(),
        new MercadoLivrePublisher(),
        new AmazonPublisher(),
      ],
    },
  ],
  exports: [
    VisionAgent,
    MarketAgent,
    ContentAgent,
    ImageAgent,
    PricingAgent,
    PublisherAgent,
    PipelineOrchestrator,
    PIPELINE_ORCHESTRATOR,
    MARKET_SOURCES,
    MARKETPLACE_PUBLISHERS,
  ],
})
export class AgentsModule {
  // model injetado só para garantir que o schema esteja carregado ao publisher
  constructor(@InjectModel(Product.name) private readonly _product: Model<ProductDocument>) {}
}
