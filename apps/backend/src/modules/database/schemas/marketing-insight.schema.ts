import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarketingInsightDocument = HydratedDocument<MarketingInsight>;

/**
 * Padrão aprendido pelo Learning Agent a partir do histórico de analytics
 * (ex.: "Reels às 19h convertem mais"). Consumido pelo Marketing Planner para
 * ponderar futuras campanhas — ver `MarketingLearningAgent`/`MarketingPlannerAgent`.
 */
@Schema({ collection: 'marketing_insights', timestamps: true })
export class MarketingInsight {
  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({ required: true })
  summary!: string;

  @Prop({ required: true, index: true })
  metric!: string;

  @Prop({ default: 0, min: 0, max: 1 })
  confidence!: number;

  @Prop({ default: 0 })
  sampleSize!: number;
}

export const MarketingInsightSchema = SchemaFactory.createForClass(MarketingInsight);
MarketingInsightSchema.index({ ownerId: 1, createdAt: -1 });
