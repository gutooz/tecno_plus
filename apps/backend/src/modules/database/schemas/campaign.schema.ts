import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CampaignStatus } from '@tecnoplus/shared';

export type CampaignDocument = HydratedDocument<Campaign>;

/**
 * Campanha de divulgação social (Facebook/Instagram) — orgânica ou paga (ver
 * `type`). Os blocos `organic`/`paid` são objetos livres — o formato canônico
 * vive em `@tecnoplus/shared` (`OrganicCampaignConfig`/`PaidCampaignConfig`);
 * aqui o Mongo apenas persiste, igual ao padrão usado em `Product`.
 */
@Schema({ collection: 'campaigns', timestamps: true })
export class Campaign {
  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({ required: true, enum: ['organic', 'paid'], index: true })
  type!: 'organic' | 'paid';

  @Prop({ required: true })
  name!: string;

  @Prop({
    required: true,
    enum: Object.values(CampaignStatus),
    default: CampaignStatus.DRAFT,
    index: true,
  })
  status!: CampaignStatus;

  @Prop({ type: Object, default: null })
  organic!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  paid!: Record<string, unknown> | null;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

CampaignSchema.index({ ownerId: 1, type: 1, status: 1, createdAt: -1 });
