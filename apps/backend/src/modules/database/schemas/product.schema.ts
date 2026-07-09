import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ProductStatus } from '@tecnoplus/shared';

export type ProductDocument = HydratedDocument<Product>;

/**
 * Documento central do catálogo. Subdocumentos (vision, market, content,
 * pricing, images) são guardados como objetos livres — o formato canônico vive
 * nos tipos de `@tecnoplus/shared`; aqui o Mongo apenas persiste.
 */
@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({ required: true, unique: true })
  internalSku!: string;

  @Prop({
    required: true,
    enum: Object.values(ProductStatus),
    default: ProductStatus.UPLOADED,
    index: true,
  })
  status!: ProductStatus;

  @Prop({ default: 0, min: 0, max: 1 })
  aiConfidence!: number;

  @Prop({ type: Object, default: {} })
  vision!: Record<string, unknown>;

  @Prop({ type: Object, default: null })
  market!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  content!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  pricing!: Record<string, unknown> | null;

  @Prop({ type: Object, default: {} })
  images!: Record<string, unknown>;

  @Prop({ default: false })
  multipleProductsDetected!: boolean;

  @Prop({ type: [String], default: [] })
  publishedChannels!: string[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Índices para pesquisa instantânea e ordenação na tela de Produtos.
ProductSchema.index({ 'vision.name': 'text', 'vision.brand': 'text', internalSku: 'text' });
ProductSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
