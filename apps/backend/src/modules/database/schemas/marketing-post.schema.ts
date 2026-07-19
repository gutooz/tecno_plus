import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  MarketingCampaignType,
  MarketingContentType,
  MarketingPostStatus,
  MarketingTheme,
} from '@tecnoplus/shared';

export type MarketingPostDocument = HydratedDocument<MarketingPost>;

/**
 * Entrada do calendário de conteúdo do Marketing IA — uma publicação (feed,
 * story, reel, carrossel ou oferta) gerada automaticamente pelo Calendar
 * Agent para um produto do catálogo. `content` é objeto livre — o formato
 * canônico vive em `@tecnoplus/shared` (`MarketingPostContent`), aqui o Mongo
 * apenas persiste, mesmo padrão usado em `Product`/`Campaign`.
 */
@Schema({ collection: 'marketing_posts', timestamps: true })
export class MarketingPost {
  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({ required: true, index: true })
  productId!: string;

  @Prop({ required: true })
  channel!: string;

  @Prop({ required: true, enum: Object.values(MarketingContentType) })
  type!: MarketingContentType;

  @Prop({ required: true, enum: Object.values(MarketingTheme) })
  theme!: MarketingTheme;

  @Prop({ required: true, enum: Object.values(MarketingCampaignType) })
  campaignType!: MarketingCampaignType;

  @Prop({
    required: true,
    enum: Object.values(MarketingPostStatus),
    default: MarketingPostStatus.DRAFT,
    index: true,
  })
  status!: MarketingPostStatus;

  @Prop({ required: true, index: true })
  scheduledFor!: string;

  @Prop({ type: Object, default: {} })
  content!: Record<string, unknown>;

  @Prop({ default: 0 })
  trendScore!: number;

  @Prop() publishedAt?: string;
  @Prop() externalId?: string;
  @Prop({ default: '' }) lastError!: string;
}

export const MarketingPostSchema = SchemaFactory.createForClass(MarketingPost);

MarketingPostSchema.index({ ownerId: 1, status: 1, scheduledFor: 1 });
MarketingPostSchema.index({ ownerId: 1, productId: 1, createdAt: -1 });
