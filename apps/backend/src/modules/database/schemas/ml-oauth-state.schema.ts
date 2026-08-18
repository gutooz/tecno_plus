import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MercadoLivreOauthStateDocument = HydratedDocument<MercadoLivreOauthState>;

/**
 * Token CSRF de curta duração + `code_verifier` (PKCE) que liga o redirect de
 * autorização do Mercado Livre de volta ao usuário que iniciou a conexão
 * (mesmo padrão de `ShopeeOauthState`). TTL de 10min via índice Mongo — expira
 * sozinho, não precisa de limpeza manual. Consumido uma única vez (proteção
 * contra replay).
 */
@Schema({ collection: 'mercado_livre_oauth_states' })
export class MercadoLivreOauthState {
  @Prop({ required: true, unique: true })
  state!: string;

  @Prop({ required: true })
  ownerId!: string;

  @Prop({ required: true })
  codeVerifier!: string;

  @Prop({ default: '/integrations' })
  returnTo!: string;

  @Prop({ required: true, expires: 600 })
  createdAt!: Date;
}

export const MercadoLivreOauthStateSchema = SchemaFactory.createForClass(MercadoLivreOauthState);
