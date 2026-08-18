import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GeneratedContent,
  MarketplaceChannel,
  PipelineJobData,
  Product as ProductDomain,
  ProductVisionAttributes,
  ProductStatus,
  QueueName,
  slugify,
} from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { AgentLog, AgentLogDocument } from '../database/schemas/agent-log.schema';
import { VisionAgent } from '../../agents/vision.agent';
import { WeightAgent } from '../../agents/weight.agent';
import { MarketAgent } from '../../agents/market/market.agent';
import { ContentAgent } from '../../agents/content.agent';
import { ImageAgent } from '../../agents/image.agent';
import { PricingAgent } from '../../agents/pricing.agent';
import { PublisherAgent } from '../../agents/publisher.agent';
import { QueueService } from './queue.service';

/**
 * Orquestra o pipeline dos agentes. Cada método `handleX` é uma etapa,
 * executada em segundo plano pelo QueueService (no próprio processo, sem Redis).
 * Persiste o resultado, registra o log do agente (início/fim/tempo/tokens/modelo)
 * e agenda a próxima etapa via `queue.enqueue`.
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
    private readonly weight: WeightAgent,
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
      const productImages = product.images as { original?: string; references?: string[] };
      const originalUrl = productImages.original;
      if (!originalUrl) throw new Error('Produto sem imagem original.');

      const out = await this.vision.run(
        originalUrl,
        Array.isArray(productImages.references) ? productImages.references : [],
      );

      // Preserva TÍTULO e PREÇO informados pelo operador (fluxo Telegram):
      // a visão enriquece marca/categoria, mas não sobrescreve o que o humano deu.
      const existing = (product.vision ?? {}) as ProductVisionAttributes;
      const hasUserTitle = Boolean(nonBlankString(existing.name));
      const mergedVision = mergeVisionWithOperatorFields(
        existing,
        out.attributes,
        Math.floor(50 + Math.random() * 51),
      );

      // Medidas do pacote (comprimento/largura/altura): a visão não lê isso da
      // foto, então pedimos ao Weight Agent — mesma estimativa por atributos que
      // roda em "Estimar peso" em lote, só que automática pra todo produto novo.
      // A Shopee trata as três como um conjunto: sem elas o produto sobe, mas
      // fica sem envio configurado até alguém preencher.
      const hasDims = existing.length != null && existing.width != null && existing.height != null;
      if (!hasDims) {
        try {
          const est = await this.weight.run(mergedVision as never);
          if (est.dimensions) {
            mergedVision.length = est.dimensions.length;
            mergedVision.width = est.dimensions.width;
            mergedVision.height = est.dimensions.height;
          }
        } catch (err) {
          this.logger.warn(`Estimativa de medidas falhou p/ ${data.productId}: ${String(err)}`);
        }
      }

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
      await this.products.updateOne(
        { _id: data.productId },
        { $set: { content: mergeContentWithOperatorTitle(product.vision, out.content) } },
      );
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
      const decision = resolvePricingDecision(product);
      if (decision.missingPurchasePrice) {
        await this.products.updateOne(
          { _id: data.productId },
          { $set: { pricing: null, status: ProductStatus.NEEDS_REVIEW } },
        );
        this.logger.warn(
          `Preço pago ausente p/ ${product.internalSku} — fica em revisão, sem publicar.`,
        );
        return undefined;
      }

      // Preserva o PREÇO DE VENDA informado pelo operador (fluxo Envio em Lote):
      // se ele já digitou um preço, mantemos e só derivamos lucro/margem/ROI.
      // Sem preço informado, o Pricing Agent sugere via markup + mercado.
      const manualSale = (product.pricing as { suggestedPrice?: number })?.suggestedPrice;
      const result =
        manualSale && manualSale > 0
          ? this.pricing.withSalePrice(decision.purchasePrice, manualSale)
          : this.pricing.run(decision.purchasePrice, (product.market as never) ?? undefined);

      await this.products.updateOne(
        { _id: data.productId },
        { $set: { pricing: result, status: ProductStatus.READY } },
      );
      if (decision.shouldAutoPublish) {
        // No MVP uploads web ainda publicam automaticamente na loja; Telegram
        // fica para revisão manual porque preço pago pode estar em outra foto.
        await this.queue.enqueue(QueueName.PUBLISH, data);
      }
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

export interface PricingDecision {
  purchasePrice: number;
  missingPurchasePrice: boolean;
  shouldAutoPublish: boolean;
}

export function resolvePricingDecision(product: {
  source?: string;
  vision?: Record<string, unknown>;
  pricing?: Record<string, unknown> | null;
  market?: Record<string, unknown> | null;
}): PricingDecision {
  const isTelegram = product.source === 'telegram';
  const fromManualPricing = positiveNumber(product.pricing?.purchasePrice);
  const fromVision = positiveNumber(product.vision?.labelPrice);
  const fromMarket = positiveNumber(product.market?.minPrice);

  const purchasePrice = fromManualPricing ?? fromVision ?? (isTelegram ? undefined : fromMarket);

  return {
    purchasePrice: purchasePrice ?? 0,
    missingPurchasePrice: purchasePrice == null,
    shouldAutoPublish: !isTelegram,
  };
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function mergeVisionWithOperatorFields(
  existing: ProductVisionAttributes,
  detected: ProductVisionAttributes,
  generatedQuantity: number,
): ProductVisionAttributes {
  return {
    ...detected,
    name: nonBlankString(existing.name) ?? detected.name,
    labelPrice: positiveNumber(existing.labelPrice) ?? detected.labelPrice,
    // Mesmo princípio para o PESO: o que já existe veio de medição ou da tela
    // do operador; o da IA é estimativa. Estimativa não sobrescreve medição.
    weight: positiveNumber(existing.weight) ?? detected.weight,
    weightSource:
      positiveNumber(existing.weight) != null ? existing.weightSource : detected.weightSource,
    quantity:
      typeof existing.quantity === 'number' && Number.isFinite(existing.quantity)
        ? existing.quantity
        : (detected.quantity ?? generatedQuantity),
  };
}

export function mergeContentWithOperatorTitle(
  vision: ProductVisionAttributes,
  content: GeneratedContent,
): GeneratedContent {
  const operatorTitle = nonBlankString(vision.name);
  if (!operatorTitle) return content;

  return {
    ...content,
    title: operatorTitle,
    seo: {
      ...content.seo,
      slug: content.seo?.slug || slugify(operatorTitle),
      metaDescription: content.seo?.metaDescription || operatorTitle.slice(0, 155),
    },
  };
}
