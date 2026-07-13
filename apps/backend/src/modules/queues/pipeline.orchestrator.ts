import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MarketplaceChannel,
  PipelineJobData,
  Product as ProductDomain,
  ProductStatus,
  QueueName,
} from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { AgentLog, AgentLogDocument } from '../database/schemas/agent-log.schema';
import { VisionAgent } from '../../agents/vision.agent';
import { MarketAgent } from '../../agents/market/market.agent';
import { ContentAgent } from '../../agents/content.agent';
import { ImageAgent } from '../../agents/image.agent';
import { PricingAgent } from '../../agents/pricing.agent';
import { PublisherAgent } from '../../agents/publisher.agent';
import { QueueService } from './queue.service';

/**
 * Orquestra o pipeline dos agentes. Cada método `handleX` é o corpo de um
 * worker BullMQ (definido em worker.ts). Persiste o resultado, registra o log
 * do agente (início/fim/tempo/tokens/modelo) e enfileira a próxima etapa.
 *
 * Confiança baixa (< 0.5) desvia para revisão manual (NEEDS_REVIEW) e o
 * pipeline pausa até o operador aprovar.
 */
@Injectable()
export class PipelineOrchestrator {
  private readonly logger = new Logger(PipelineOrchestrator.name);
  private static readonly REVIEW_THRESHOLD = 0.5;

  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(AgentLog.name) private readonly logs: Model<AgentLogDocument>,
    private readonly vision: VisionAgent,
    private readonly market: MarketAgent,
    private readonly content: ContentAgent,
    private readonly image: ImageAgent,
    private readonly pricing: PricingAgent,
    private readonly publisher: PublisherAgent,
    private readonly queue: QueueService,
  ) {}

  // ── Etapa 1: Visão ─────────────────────────────────────────
  async handleVision(data: PipelineJobData) {
    await this.withLog('vision', data.productId, async () => {
      const product = await this.load(data.productId);
      const originalUrl = (product.images as { original?: string }).original;
      if (!originalUrl) throw new Error('Produto sem imagem original.');

      const out = await this.vision.run(originalUrl);

      // Preserva TÍTULO e PREÇO informados pelo operador (fluxo Telegram):
      // a visão enriquece marca/categoria, mas não sobrescreve o que o humano deu.
      const existing = (product.vision ?? {}) as { name?: string; labelPrice?: number };
      const hasUserTitle = Boolean(existing.name);
      const mergedVision = {
        ...out.attributes,
        name: existing.name || out.attributes.name,
        labelPrice: existing.labelPrice ?? out.attributes.labelPrice,
      };

      // Com título humano, não barra por foto difícil — confiamos no operador.
      const needsReview = !hasUserTitle && out.confidence < PipelineOrchestrator.REVIEW_THRESHOLD;

      await this.products.updateOne(
        { _id: data.productId },
        {
          $set: {
            vision: mergedVision,
            aiConfidence: out.confidence,
            multipleProductsDetected: out.multipleProductsDetected,
            status: needsReview ? ProductStatus.NEEDS_REVIEW : ProductStatus.PROCESSING,
          },
        },
      );

      if (!needsReview) await this.queue.enqueue(QueueName.MARKET, data);
      return out.usage;
    });
  }

  // ── Etapa 2: Mercado ───────────────────────────────────────
  async handleMarket(data: PipelineJobData) {
    await this.withLog('market', data.productId, async () => {
      const product = await this.load(data.productId);
      const result = await this.market.run(product.vision);
      await this.products.updateOne({ _id: data.productId }, { $set: { market: result } });
      await this.queue.enqueue(QueueName.CONTENT, data);
      return undefined;
    });
  }

  // ── Etapa 3: Conteúdo ──────────────────────────────────────
  async handleContent(data: PipelineJobData) {
    await this.withLog('content', data.productId, async () => {
      const product = await this.load(data.productId);
      const out = await this.content.run(product.vision, (product.market as never) ?? undefined);
      await this.products.updateOne({ _id: data.productId }, { $set: { content: out.content } });
      await this.queue.enqueue(QueueName.IMAGE, data);
      return out.usage;
    });
  }

  // ── Etapa 4: Imagem ────────────────────────────────────────
  async handleImage(data: PipelineJobData) {
    await this.withLog('image', data.productId, async () => {
      const product = await this.load(data.productId);
      const original = (product.images as { original?: string }).original!;
      const images = await this.image.run(data.productId, original);
      await this.products.updateOne({ _id: data.productId }, { $set: { images } });
      await this.queue.enqueue(QueueName.PRICING, data);
      return undefined;
    });
  }

  // ── Etapa 5: Preço ─────────────────────────────────────────
  async handlePricing(data: PipelineJobData) {
    await this.withLog('pricing', data.productId, async () => {
      const product = await this.load(data.productId);
      const purchase =
        (product.vision as { labelPrice?: number }).labelPrice ??
        (product.market as { minPrice?: number })?.minPrice ??
        0;
      const result = this.pricing.run(purchase, (product.market as never) ?? undefined);
      await this.products.updateOne(
        { _id: data.productId },
        { $set: { pricing: result, status: ProductStatus.READY } },
      );
      // No MVP publicamos automaticamente na loja; ajuste para exigir revisão se preferir.
      await this.queue.enqueue(QueueName.PUBLISH, data);
      return undefined;
    });
  }

  // ── Etapa 6: Publicação ────────────────────────────────────
  async handlePublish(data: PipelineJobData) {
    await this.withLog('publish', data.productId, async () => {
      const product = await this.load(data.productId);
      await this.publisher.publish(this.toDomain(product), MarketplaceChannel.WEBSITE);
      return undefined;
    });
  }

  // ── Infra de log + carga ───────────────────────────────────
  private async load(id: string): Promise<ProductDocument> {
    const p = await this.products.findById(id);
    if (!p) throw new Error(`Produto não encontrado: ${id}`);
    return p;
  }

  private toDomain(doc: ProductDocument): ProductDomain {
    return { id: String(doc._id), ...doc.toObject() } as unknown as ProductDomain;
  }

  /** Envolve a execução do agente com métricas e persistência de log. */
  private async withLog(
    agent: string,
    productId: string,
    fn: () => Promise<
      { provider: string; model: string; inputTokens: number; outputTokens: number } | undefined
    >,
  ) {
    const startedAt = new Date();
    try {
      const usage = await fn();
      const finishedAt = new Date();
      await this.logs.create({
        agent,
        productId,
        outcome: 'success',
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        aiProvider: usage?.provider ?? '',
        aiModel: usage?.model ?? '',
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      });
    } catch (err) {
      const finishedAt = new Date();
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Agente ${agent} falhou p/ ${productId}: ${message}`);
      await this.logs.create({
        agent,
        productId,
        outcome: 'error',
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error: message,
      });
      await this.products.updateOne({ _id: productId }, { $set: { status: ProductStatus.ERROR } });
      throw err; // deixa o BullMQ aplicar retry/backoff
    }
  }
}
