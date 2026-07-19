import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import {
  GeneratedContent,
  MarketingCampaignPlan,
  MarketingCampaignType,
  MarketingChannel,
  MarketingContentType,
  MarketingPostStatus,
  MarketingTheme,
  MarketResearchResult,
  ProductStatus,
  ProductVisionAttributes,
  TrendScore,
} from '@tecnoplus/shared';
import { MarketingPost, MarketingPostDocument } from '../database/schemas/marketing-post.schema';
import {
  MarketingInsight,
  MarketingInsightDocument,
} from '../database/schemas/marketing-insight.schema';
import {
  MarketingAnalytics as MarketingAnalyticsEntity,
  MarketingAnalyticsDocument,
} from '../database/schemas/marketing-analytics.schema';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { TrendHunterAgent } from '../../agents/marketing/trend-hunter.agent';
import { MarketingPlannerAgent } from '../../agents/marketing/marketing-planner.agent';
import { MarketingCopyAgent } from '../../agents/marketing/marketing-copy.agent';
import { MarketingImageAgent } from '../../agents/marketing/marketing-image.agent';
import {
  CalendarProductInput,
  MarketingCalendarAgent,
} from '../../agents/marketing/marketing-calendar.agent';
import { MarketingPublisherAgent } from '../../agents/marketing/marketing-publisher.agent';
import {
  MarketingVideoAgent,
  MarketingVideoFormat,
} from '../../agents/marketing/marketing-video.agent';
import { MarketingAnalyticsAgent } from '../../agents/marketing/marketing-analytics.agent';
import {
  MarketingLearningAgent,
  LearningSample,
} from '../../agents/marketing/marketing-learning.agent';

/**
 * Marketing IA: fundação (Fase 0) + Trend Hunter/Marketing Planner (Fase 1) +
 * Copywriter/Image (Fase 2) + Calendar (Fase 3) + Publisher/Editor Manual
 * (Fase 4) + Video (Fase 5) + Analytics/Learning (Fase 6) — módulo completo.
 */
@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(MarketingPost.name) private readonly posts: Model<MarketingPostDocument>,
    @InjectModel(MarketingInsight.name) private readonly insights: Model<MarketingInsightDocument>,
    @InjectModel(MarketingAnalyticsEntity.name)
    private readonly analyticsModel: Model<MarketingAnalyticsDocument>,
    private readonly trendHunter: TrendHunterAgent,
    private readonly planner: MarketingPlannerAgent,
    private readonly copywriter: MarketingCopyAgent,
    private readonly marketingImage: MarketingImageAgent,
    private readonly calendarAgent: MarketingCalendarAgent,
    private readonly publisher: MarketingPublisherAgent,
    private readonly videoAgent: MarketingVideoAgent,
    private readonly analyticsAgent: MarketingAnalyticsAgent,
    private readonly learningAgent: MarketingLearningAgent,
  ) {}

  async dashboard(ownerId: string) {
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date();
    startOfMonth.setHours(0, 0, 0, 0);
    startOfMonth.setDate(1);

    // Posts cancelados não contam como "posts da semana/mês" nem entram nas
    // contagens por tipo — senão o dashboard mostraria número inflado por
    // conteúdo que o operador decidiu não publicar.
    const notCanceled = { status: { $ne: MarketingPostStatus.CANCELED } };

    const [productsAnalyzed, campaignsCreated, postsThisWeek, postsThisMonth, byType, byStatus] =
      await Promise.all([
        this.products.countDocuments({ ownerId }),
        this.products.countDocuments({ ownerId, marketing: { $ne: null } }),
        this.posts.countDocuments({
          ownerId,
          ...notCanceled,
          scheduledFor: { $gte: startOfWeek.toISOString() },
        }),
        this.posts.countDocuments({
          ownerId,
          ...notCanceled,
          scheduledFor: { $gte: startOfMonth.toISOString() },
        }),
        this.countByField(ownerId, 'type', notCanceled),
        this.countByField(ownerId, 'status'),
      ]);

    return {
      productsAnalyzed,
      campaignsCreated,
      postsThisWeek,
      postsThisMonth,
      reels: byType[MarketingContentType.REEL] ?? 0,
      stories: byType[MarketingContentType.STORY] ?? 0,
      videos: 0, // populado a partir da Fase 5 (Video Creator)
      published: byStatus[MarketingPostStatus.PUBLISHED] ?? 0,
      scheduled: byStatus[MarketingPostStatus.SCHEDULED] ?? 0,
    };
  }

  async listInsights(ownerId: string) {
    return this.insights.find({ ownerId }).sort({ createdAt: -1 }).limit(20).lean();
  }

  /**
   * Produtos já analisados pelo Trend Hunter, ordenados por score (maior
   * potencial primeiro) — alimenta o Painel de Tendências.
   */
  async listTrends(ownerId: string) {
    const docs = await this.products
      .find({ ownerId, marketing: { $ne: null } })
      .sort({ 'marketing.trend.score': -1 })
      .limit(50)
      .lean();

    return docs.map((d) => {
      const vision = (d.vision ?? {}) as { name?: string };
      const content = (d.content ?? {}) as { title?: string };
      const images = (d.images ?? {}) as { hd?: string; square?: string; original?: string };
      const marketing = (d.marketing ?? {}) as {
        trend?: TrendScore;
        plan?: MarketingCampaignPlan;
      };
      return {
        id: String(d._id),
        title: content.title || vision.name || d.internalSku,
        image: images.hd || images.square || images.original || '',
        trend: marketing.trend ?? null,
        plan: marketing.plan ?? null,
      };
    });
  }

  /**
   * Dispara o Trend Hunter + Marketing Planner em segundo plano (mesmo
   * espírito do `QueueService`: `setImmediate`, sem fila/Redis) para produtos
   * prontos ainda sem análise — ou todos, se `force`. Retorna na hora; o
   * resultado aparece em `listTrends` conforme cada produto termina.
   */
  async analyzeTrends(ownerId: string, opts?: { force?: boolean }): Promise<{ queued: number }> {
    const filter: FilterQuery<ProductDocument> = {
      ownerId,
      status: { $in: [ProductStatus.READY, ProductStatus.PUBLISHED] },
    };
    if (!opts?.force) filter.marketing = null;

    const docs = await this.products.find(filter, { _id: 1 }).lean();
    const ids = docs.map((d) => String(d._id));
    setImmediate(() => void this.runAnalysis(ids));
    return { queued: ids.length };
  }

  /** Sequencial de propósito: poucos produtos por vez e o provedor de IA tem rate limit
   * (mesma cautela do `estimateWeightBatch` em `ProductsService`). */
  private async runAnalysis(productIds: string[]): Promise<void> {
    for (const id of productIds) {
      try {
        const product = await this.products.findById(id);
        if (!product) continue;

        const vision = (product.vision ?? {}) as ProductVisionAttributes;
        const market = (product.market as MarketResearchResult | null) ?? undefined;
        const content = (product.content as GeneratedContent | null) ?? undefined;

        const { trend } = await this.trendHunter.run(id, vision, market);
        const { plan } = await this.planner.run(id, vision, content, trend);

        await this.products.updateOne({ _id: id }, { $set: { marketing: { trend, plan } } });
      } catch (err) {
        this.logger.warn(`Análise de tendência falhou p/ ${id}: ${String(err)}`);
      }
    }
  }

  listImageStyles() {
    return this.marketingImage.listStyles();
  }

  /**
   * Preview isolado do Copywriter (Agente 3) — não persiste nada ainda; o
   * Calendar Agent (Fase 3) é quem grava o resultado num `MarketingPost`.
   */
  async previewCopy(
    ownerId: string,
    productId: string,
    channel: MarketingChannel,
    type: MarketingContentType,
  ) {
    const product = await this.products.findOne({ _id: productId, ownerId });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const vision = (product.vision ?? {}) as ProductVisionAttributes;
    const content = (product.content as GeneratedContent | null) ?? undefined;
    const marketing = (product.marketing ?? {}) as {
      trend?: TrendScore;
      plan?: MarketingCampaignPlan;
    };

    const { content: generated } = await this.copywriter.run(
      productId,
      vision,
      content,
      marketing.trend,
      marketing.plan,
      channel,
      type,
    );
    return generated;
  }

  /**
   * Preview isolado do Image Agent de marketing (Agente 4) — gera e já sobe
   * a imagem (mesmo comportamento de `ImageAgent.regenerateScene`), mas em
   * `products/{id}/marketing/`, separado das fotos de catálogo.
   */
  async previewImage(ownerId: string, productId: string, styleKey: string) {
    const product = await this.products.findOne({ _id: productId, ownerId }).lean();
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const images = (product.images ?? {}) as { original?: string };
    if (!images.original) throw new BadRequestException('Produto sem imagem original.');

    const url = await this.marketingImage.generate(productId, images.original, styleKey);
    return { url };
  }

  /**
   * Preview isolado do Video Creator (Agente 5) — monta um slideshow (Ken
   * Burns) a partir das imagens já existentes do produto (catálogo). Reusa a
   * legenda/resumo já gerado pelo Content Agent como texto de capa; se o
   * produto tiver post de marketing com legenda própria, essa prevalece.
   */
  async previewVideo(ownerId: string, productId: string, format: MarketingVideoFormat) {
    const product = await this.products.findOne({ _id: productId, ownerId }).lean();
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const images = (product.images ?? {}) as { shopee?: string[]; hd?: string; square?: string };
    const frames = (images.shopee?.length ? images.shopee : [images.hd || images.square]).filter(
      Boolean,
    ) as string[];
    if (!frames.length) {
      throw new BadRequestException('Produto sem imagens para gerar vídeo.');
    }

    const content = (product.content ?? {}) as { title?: string; summary?: string };
    const caption = content.summary || content.title || '';

    const url = await this.videoAgent.generate(productId, frames, caption, format);
    return { url };
  }

  /**
   * Gera o calendário (Agente 6): monta o esqueleto (produto/horário/canal/
   * formato/tema) de forma determinística e instantânea — nunca repete
   * produto+campanha já agendado (`usedCombos`, do histórico real) — e
   * persiste como `MarketingPost` em DRAFT. A legenda (Copywriter) é gerada
   * depois, em segundo plano (mesmo padrão `setImmediate` do `analyzeTrends`),
   * pra não bloquear a resposta com N chamadas de IA sequenciais.
   */
  async generateCalendar(
    ownerId: string,
    opts: { days: number; startDate?: string },
  ): Promise<{ created: number }> {
    const start = opts.startDate ? new Date(opts.startDate) : new Date();
    start.setHours(0, 0, 0, 0);
    const days = Math.min(30, Math.max(1, opts.days));

    const analyzed = await this.products
      .find({ ownerId, marketing: { $ne: null } })
      .sort({ 'marketing.trend.score': -1 })
      .lean();

    const inputs: CalendarProductInput[] = analyzed
      .map((p) => {
        const marketing = (p.marketing ?? {}) as {
          trend?: TrendScore;
          plan?: MarketingCampaignPlan;
        };
        if (!marketing.trend || !marketing.plan) return null;
        return { productId: String(p._id), trend: marketing.trend, plan: marketing.plan };
      })
      .filter((x): x is CalendarProductInput => x !== null);

    if (!inputs.length) {
      throw new BadRequestException(
        'Nenhum produto com score de tendência ainda — rode a análise de tendências primeiro.',
      );
    }

    const existing = await this.posts.find({ ownerId }, { productId: 1, campaignType: 1 }).lean();
    const usedCombos = new Set(existing.map((p) => `${p.productId}:${p.campaignType}`));

    const slots = this.calendarAgent.build(inputs, start, days, usedCombos);

    const docs = await this.posts.insertMany(
      slots.map((slot) => ({
        ownerId,
        productId: slot.productId,
        channel: slot.channel,
        type: slot.type,
        theme: slot.theme,
        campaignType: slot.campaignType,
        status: MarketingPostStatus.DRAFT,
        scheduledFor: slot.scheduledFor,
        content: { caption: '', hashtags: [], cta: '', mediaUrls: [] },
        trendScore: slot.trendScore,
      })),
    );

    const ids = docs.map((d) => String(d._id));
    setImmediate(() => void this.fillCalendarContent(ids));
    return { created: ids.length };
  }

  /** Sequencial de propósito, mesma cautela de rate limit do `runAnalysis`. */
  private async fillCalendarContent(postIds: string[]): Promise<void> {
    for (const id of postIds) {
      try {
        const post = await this.posts.findById(id);
        if (!post) continue;
        const product = await this.products.findById(post.productId);
        if (!product) continue;

        const vision = (product.vision ?? {}) as ProductVisionAttributes;
        const content = (product.content as GeneratedContent | null) ?? undefined;
        const marketing = (product.marketing ?? {}) as {
          trend?: TrendScore;
          plan?: MarketingCampaignPlan;
        };

        const { content: generated } = await this.copywriter.run(
          post.productId,
          vision,
          content,
          marketing.trend,
          marketing.plan,
          post.channel as MarketingChannel,
          post.type,
        );

        await this.posts.updateOne(
          { _id: id },
          { $set: { content: generated, status: MarketingPostStatus.SCHEDULED } },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Geração de legenda falhou p/ post ${id}: ${message}`);
        await this.posts.updateOne({ _id: id }, { $set: { lastError: message } });
      }
    }
  }

  /** Posts do calendário num intervalo de datas, com título/imagem do produto já resolvidos. */
  async listCalendar(ownerId: string, from: string, to: string) {
    const posts = await this.posts
      .find({ ownerId, scheduledFor: { $gte: from, $lte: to } })
      .sort({ scheduledFor: 1 })
      .lean();

    const productIds = [...new Set(posts.map((p) => p.productId))];
    const products = await this.products
      .find({ _id: { $in: productIds } }, { content: 1, vision: 1, images: 1 })
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    return posts.map((post) => {
      const product = byId.get(post.productId);
      const vision = (product?.vision ?? {}) as { name?: string };
      const content = (product?.content ?? {}) as { title?: string };
      const images = (product?.images ?? {}) as { thumbnail?: string; square?: string };
      return {
        id: String(post._id),
        productId: post.productId,
        productTitle: content.title || vision.name || 'Produto',
        productImage: images.thumbnail || images.square || '',
        channel: post.channel,
        type: post.type,
        theme: post.theme,
        campaignType: post.campaignType,
        status: post.status,
        scheduledFor: post.scheduledFor,
        content: post.content,
        trendScore: post.trendScore,
        lastError: post.lastError || undefined,
      };
    });
  }

  /** Um post específico, com título/imagem do produto resolvidos — usado pelo Editor Manual. */
  async getPost(ownerId: string, id: string) {
    const post = await this.posts.findOne({ _id: id, ownerId }).lean();
    if (!post) throw new NotFoundException('Post não encontrado.');

    const product = await this.products.findById(post.productId).lean();
    const vision = (product?.vision ?? {}) as { name?: string };
    const content = (product?.content ?? {}) as { title?: string };
    const images = (product?.images ?? {}) as { thumbnail?: string; square?: string };

    return {
      id: String(post._id),
      productId: post.productId,
      productTitle: content.title || vision.name || 'Produto',
      productImage: images.thumbnail || images.square || '',
      channel: post.channel,
      type: post.type,
      theme: post.theme,
      campaignType: post.campaignType,
      status: post.status,
      scheduledFor: post.scheduledFor,
      content: post.content,
      trendScore: post.trendScore,
      lastError: post.lastError || undefined,
    };
  }

  async cancelPost(ownerId: string, id: string) {
    const res = await this.posts.updateOne(
      { _id: id, ownerId },
      { $set: { status: MarketingPostStatus.CANCELED } },
    );
    if (!res.matchedCount) throw new NotFoundException('Post não encontrado.');
    return { ok: true };
  }

  async updatePostContent(
    ownerId: string,
    id: string,
    patch: { caption?: string; hashtags?: string[]; cta?: string; mediaUrls?: string[] },
  ) {
    const post = await this.posts.findOne({ _id: id, ownerId });
    if (!post) throw new NotFoundException('Post não encontrado.');

    const content = { ...(post.content as Record<string, unknown>) };
    if (patch.caption !== undefined) content.caption = patch.caption;
    if (patch.hashtags !== undefined) content.hashtags = patch.hashtags;
    if (patch.cta !== undefined) content.cta = patch.cta;
    if (patch.mediaUrls !== undefined) content.mediaUrls = patch.mediaUrls;

    post.content = content;
    await post.save();
    return post.toObject();
  }

  /**
   * Editor Manual (Agente 7): cria um post do zero (fora do Calendar Agent) —
   * mesmo fluxo de preenchimento em segundo plano do `generateCalendar`
   * (reaproveita `fillCalendarContent`), só que para 1 post só.
   */
  async createManualPost(
    ownerId: string,
    input: {
      productId: string;
      channel: MarketingChannel;
      type: MarketingContentType;
      theme: MarketingTheme;
      campaignType: MarketingCampaignType;
      scheduledFor: string;
    },
  ): Promise<{ id: string }> {
    const product = await this.products.findOne({ _id: input.productId, ownerId }).lean();
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const marketing = (product.marketing ?? {}) as { trend?: TrendScore };
    const doc = await this.posts.create({
      ownerId,
      productId: input.productId,
      channel: input.channel,
      type: input.type,
      theme: input.theme,
      campaignType: input.campaignType,
      status: MarketingPostStatus.DRAFT,
      scheduledFor: input.scheduledFor,
      content: { caption: '', hashtags: [], cta: '', mediaUrls: [] },
      trendScore: marketing.trend?.score ?? 0,
    });

    const id = String(doc._id);
    setImmediate(() => void this.fillCalendarContent([id]));
    return { id };
  }

  private composeCaption(content: { caption: string; cta: string; hashtags: string[] }): string {
    const hashtags = (content.hashtags ?? [])
      .slice(0, 10)
      .map((h) => `#${h.replace(/\s+/g, '')}`)
      .join(' ');
    return [content.caption, content.cta, hashtags].filter(Boolean).join('\n\n');
  }

  private resolveImageUrl(
    content: { mediaUrls?: string[] },
    product: ProductDocument | null,
  ): string {
    if (content.mediaUrls?.[0]) return content.mediaUrls[0];
    const images = (product?.images ?? {}) as { hd?: string; square?: string; original?: string };
    return images.hd || images.square || images.original || '';
  }

  /**
   * Publica UM post agora — ação explícita (botão manual do Editor, ou
   * chamada pelo scheduler automático quando `MARKETING_AUTO_PUBLISH=true`).
   * Isola a falha no próprio post (status=FAILED + lastError) sem derrubar o
   * chamador em lote.
   */
  async publishPost(ownerId: string, id: string): Promise<{ ok: true; externalId: string }> {
    const post = await this.posts.findOne({ _id: id, ownerId });
    if (!post) throw new NotFoundException('Post não encontrado.');
    if (post.status === MarketingPostStatus.PUBLISHED) {
      throw new BadRequestException('Este post já foi publicado.');
    }

    const product = await this.products.findById(post.productId);
    const content = post.content as {
      caption: string;
      cta: string;
      hashtags: string[];
      mediaUrls?: string[];
    };
    const imageUrl = this.resolveImageUrl(content, product);
    const caption = this.composeCaption(content);

    try {
      const result = await this.publisher.publish({
        channel: post.channel as MarketingChannel,
        caption,
        imageUrl,
      });
      await this.posts.updateOne(
        { _id: id },
        {
          $set: {
            status: MarketingPostStatus.PUBLISHED,
            externalId: result.externalId,
            publishedAt: result.publishedAt,
          },
        },
      );
      return { ok: true, externalId: result.externalId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.posts.updateOne(
        { _id: id },
        { $set: { status: MarketingPostStatus.FAILED, lastError: message } },
      );
      throw new BadRequestException(`Falha ao publicar: ${message}`);
    }
  }

  /**
   * Chamado pelo `MarketingPublishScheduler` — publica todos os posts
   * SCHEDULED cujo horário já chegou. Isola falha por post (via `publishPost`).
   */
  async publishDuePosts(): Promise<void> {
    const now = new Date().toISOString();
    const due = await this.posts
      .find({ status: MarketingPostStatus.SCHEDULED, scheduledFor: { $lte: now } })
      .lean();

    for (const post of due) {
      try {
        await this.publishPost(post.ownerId, String(post._id));
      } catch (err) {
        this.logger.warn(`Publicação automática falhou p/ post ${post._id}: ${String(err)}`);
      }
    }
  }

  async duplicatePost(ownerId: string, id: string, scheduledFor: string) {
    const source = await this.posts.findOne({ _id: id, ownerId }).lean();
    if (!source) throw new NotFoundException('Post não encontrado.');

    const { _id, createdAt, updatedAt, publishedAt, externalId, lastError, ...rest } =
      source as Record<string, unknown>;
    void _id;
    void createdAt;
    void updatedAt;
    void publishedAt;
    void externalId;
    void lastError;

    const copy = await this.posts.create({
      ...rest,
      status: MarketingPostStatus.SCHEDULED,
      scheduledFor,
    });
    return copy.toObject();
  }

  /**
   * Sincroniza métricas reais (Agente 8) de todos os posts PUBLISHED com
   * `externalId` — upsert por post, então rodar de novo só atualiza os
   * números. Sem posts publicados ainda (nenhuma publicação real foi feita
   * até agora), retorna `{ synced: 0 }` — estado honesto, não um erro.
   */
  async syncAnalytics(ownerId: string): Promise<{ synced: number; failed: number }> {
    const published = await this.posts
      .find({
        ownerId,
        status: MarketingPostStatus.PUBLISHED,
        externalId: { $exists: true, $ne: '' },
      })
      .lean();

    let synced = 0;
    let failed = 0;
    for (const post of published) {
      try {
        const metrics = await this.analyticsAgent.fetchFor(
          post.channel as MarketingChannel,
          post.externalId!,
        );
        await this.analyticsModel.updateOne(
          { postId: String(post._id) },
          {
            $set: {
              ownerId,
              postId: String(post._id),
              ...metrics,
              collectedAt: new Date().toISOString(),
            },
          },
          { upsert: true },
        );
        synced++;
      } catch (err) {
        failed++;
        this.logger.warn(`Coleta de analytics falhou p/ post ${post._id}: ${String(err)}`);
      }
    }
    return { synced, failed };
  }

  /**
   * Resumo agregado de analytics (Agente 8) — totais + melhores horário/tipo/
   * tema por engajamento (curtidas+comentários+compartilhamentos). Com zero
   * posts publicados, devolve tudo zerado e `hasData: false` (a UI trata isso
   * como estado vazio real, não erro).
   */
  async analyticsSummary(ownerId: string) {
    const rows = await this.analyticsModel.find({ ownerId }).lean();
    if (!rows.length) {
      return {
        hasData: false,
        totals: { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 },
        bestHour: null as number | null,
        bestType: null as string | null,
        bestTheme: null as string | null,
        posts: 0,
      };
    }

    const postIds = rows.map((r) => r.postId);
    const posts = await this.posts
      .find({ _id: { $in: postIds } }, { type: 1, theme: 1, scheduledFor: 1 })
      .lean();
    const postById = new Map(posts.map((p) => [String(p._id), p]));

    const totals = rows.reduce(
      (acc, r) => {
        acc.likes += r.likes;
        acc.comments += r.comments;
        acc.shares += r.shares;
        acc.saves += r.saves;
        acc.reach += r.reach;
        acc.impressions += r.impressions;
        return acc;
      },
      { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 },
    );

    const byHour = new Map<number, number>();
    const byType = new Map<string, number>();
    const byTheme = new Map<string, number>();
    for (const r of rows) {
      const post = postById.get(r.postId);
      if (!post) continue;
      const engagement = r.likes + r.comments + r.shares;
      const hour = new Date(post.scheduledFor).getHours();
      byHour.set(hour, (byHour.get(hour) ?? 0) + engagement);
      byType.set(post.type, (byType.get(post.type) ?? 0) + engagement);
      byTheme.set(post.theme, (byTheme.get(post.theme) ?? 0) + engagement);
    }

    const topKey = (m: Map<string | number, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      hasData: true,
      totals,
      bestHour: topKey(byHour) as number | null,
      bestType: topKey(byType) as string | null,
      bestTheme: topKey(byTheme) as string | null,
      posts: rows.length,
    };
  }

  /**
   * Roda o Learning Agent (Agente 9) sobre o histórico real de analytics.
   * Com amostra menor que `MIN_SAMPLES`, devolve `status: 'insufficient'` em
   * vez de forçar um "aprendizado" sem base estatística.
   */
  async runLearning(ownerId: string) {
    const rows = await this.analyticsModel.find({ ownerId }).lean();
    const minSamples = MarketingLearningAgent.MIN_SAMPLES;

    if (rows.length < minSamples) {
      return { status: 'insufficient' as const, current: rows.length, minRequired: minSamples };
    }

    const postIds = rows.map((r) => r.postId);
    const posts = await this.posts
      .find({ _id: { $in: postIds } }, { channel: 1, type: 1, theme: 1, scheduledFor: 1 })
      .lean();
    const postById = new Map(posts.map((p) => [String(p._id), p]));

    const samples: LearningSample[] = rows
      .map((r): LearningSample | null => {
        const post = postById.get(r.postId);
        if (!post) return null;
        return {
          channel: post.channel as string,
          type: post.type as string,
          theme: post.theme as string,
          hour: new Date(post.scheduledFor).getHours(),
          engagement: r.likes + r.comments + r.shares,
          reach: r.reach,
        };
      })
      .filter((s): s is LearningSample => s !== null);

    const insights = await this.learningAgent.synthesize(samples);
    if (!insights) {
      return { status: 'insufficient' as const, current: samples.length, minRequired: minSamples };
    }

    const saved = await this.insights.insertMany(
      insights.map((i) => ({
        ownerId,
        summary: i.summary,
        metric: i.metric,
        confidence: i.confidence,
        sampleSize: samples.length,
      })),
    );
    return { status: 'ok' as const, insights: saved.map((s) => s.toObject()) };
  }

  private async countByField(
    ownerId: string,
    field: 'type' | 'status',
    extraMatch: Record<string, unknown> = {},
  ) {
    const rows = await this.posts.aggregate<{ _id: string; count: number }>([
      { $match: { ownerId, ...extraMatch } },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    ]);
    return rows.reduce<Record<string, number>>((acc, r) => ((acc[r._id] = r.count), acc), {});
  }
}
