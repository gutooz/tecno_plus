import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShopeeOauthStateDocument = HydratedDocument<ShopeeOauthState>;

/**
 * Token CSRF de curta duração que liga o redirect de autorização da Shopee
 * de volta ao usuário que iniciou a conexão (a Shopee só devolve `state` +
 * `code` + `shop_id`, sem sessão/JWT). TTL de 5min via índice Mongo — expira
 * sozinho, não precisa de limpeza manual.
 */
@Schema({ collection: 'shopee_oauth_states' })
export class ShopeeOauthState {
  @Prop({ required: true, unique: true })
  state!: string;

  @Prop({ required: true })
  ownerId!: string;

  @Prop({ default: '/integrations' })
  returnTo!: string;

  @Prop({ required: true, expires: 300 })
  createdAt!: Date;
}

export const ShopeeOauthStateSchema = SchemaFactory.createForClass(ShopeeOauthState);
