import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MercadoLivreConnectionDocument = HydratedDocument<MercadoLivreConnection>;

/**
 * Uma conta Mercado Livre conectada via OAuth a um usuário do catálogo (mesmo
 * padrão de `ShopeeConnection`). Um usuário tem no máximo uma conta conectada
 * por vez. access_token/refresh_token são criptografados em repouso — ver
 * `modules/integrations/token-crypto.util.ts`.
 */
@Schema({ collection: 'mercado_livre_connections', timestamps: true })
export class MercadoLivreConnection {
  @Prop({ required: true, unique: true, index: true })
  ownerId!: string;

  @Prop({ required: true })
  mlUserId!: string;

  @Prop({ default: '' })
  nickname!: string;

  @Prop({ required: true })
  accessToken!: string;

  @Prop({ required: true })
  refreshToken!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: '' })
  scope!: string;
}

export const MercadoLivreConnectionSchema = SchemaFactory.createForClass(MercadoLivreConnection);
