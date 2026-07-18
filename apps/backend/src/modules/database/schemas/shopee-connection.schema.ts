import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShopeeConnectionDocument = HydratedDocument<ShopeeConnection>;

/**
 * Uma loja Shopee conectada via OAuth (Open Platform) a um usuário do
 * catálogo. Um usuário tem no máximo uma loja conectada por vez.
 */
@Schema({ collection: 'shopee_connections', timestamps: true })
export class ShopeeConnection {
  @Prop({ required: true, unique: true, index: true })
  ownerId!: string;

  @Prop({ required: true })
  shopId!: string;

  @Prop({ default: '' })
  shopName!: string;

  @Prop({ required: true })
  accessToken!: string;

  @Prop({ required: true })
  refreshToken!: string;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const ShopeeConnectionSchema = SchemaFactory.createForClass(ShopeeConnection);
