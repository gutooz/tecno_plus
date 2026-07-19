import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarketingAnalyticsDocument = HydratedDocument<MarketingAnalytics>;

/**
 * Métricas coletadas de um `MarketingPost` publicado de verdade (Agente 8 —
 * Analytics), via Graph API. Um documento por post (`postId` único) —
 * `syncAnalytics` faz upsert a cada coleta, então `collectedAt` reflete a
 * última sincronização. Alimenta o Learning Agent (Agente 9).
 */
@Schema({ collection: 'marketing_analytics', timestamps: { createdAt: false, updatedAt: false } })
export class MarketingAnalytics {
  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({ required: true, unique: true, index: true })
  postId!: string;

  @Prop({ default: 0 }) likes!: number;
  @Prop({ default: 0 }) comments!: number;
  @Prop({ default: 0 }) shares!: number;
  @Prop({ default: 0 }) saves!: number;
  @Prop({ default: 0 }) reach!: number;
  @Prop({ default: 0 }) impressions!: number;
  @Prop({ default: 0 }) clicks!: number;

  @Prop({ required: true })
  collectedAt!: string;
}

export const MarketingAnalyticsSchema = SchemaFactory.createForClass(MarketingAnalytics);
MarketingAnalyticsSchema.index({ ownerId: 1, collectedAt: -1 });
