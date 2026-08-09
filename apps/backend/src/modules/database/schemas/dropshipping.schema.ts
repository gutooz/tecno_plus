import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;
export type SupplierProfileDocument = HydratedDocument<SupplierProfile>;
export type SellerProfileDocument = HydratedDocument<SellerProfile>;
export type StoreDocument = HydratedDocument<Store>;
export type AddressDocument = HydratedDocument<Address>;
export type SupplierProductDocument = HydratedDocument<SupplierProduct>;
export type ProductListingDocument = HydratedDocument<ProductListing>;
export type ProductListingMappingDocument = HydratedDocument<ProductListingMapping>;
export type MarketplaceOrderDocument = HydratedDocument<MarketplaceOrder>;
export type SupplierOrderDocument = HydratedDocument<SupplierOrder>;
export type OrderDocumentFileDocument = HydratedDocument<OrderDocumentFile>;
export type InventoryMovementDocument = HydratedDocument<InventoryMovement>;
export type SyncJobDocument = HydratedDocument<SyncJob>;
export type IntegrationLogDocument = HydratedDocument<IntegrationLog>;
export type NotificationDocument = HydratedDocument<Notification>;
export type FinancialEntryDocument = HydratedDocument<FinancialEntry>;
export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: 'organizations', timestamps: true })
export class Organization {
  @Prop({ required: true, index: true })
  ownerUserId!: string;

  @Prop({ required: true, enum: ['supplier', 'seller', 'admin'], index: true })
  type!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: 'pending', enum: ['pending', 'approved', 'rejected', 'blocked'], index: true })
  status!: string;

  @Prop({ type: Object, default: {} })
  settings!: Record<string, unknown>;
}

@Schema({ collection: 'supplier_profiles', timestamps: true })
export class SupplierProfile {
  @Prop({ required: true, unique: true, index: true })
  userId!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ type: Object, default: {} })
  personal!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  company!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  policies!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  activationChecklist!: Record<string, boolean>;

  @Prop({ default: 'pending', enum: ['pending', 'approved', 'rejected', 'blocked'], index: true })
  approvalStatus!: string;

  /** Chat do Telegram vinculado a este fornecedor (fotos enviadas nele viram
   * produtos pendentes só dele). Vínculo feito via `telegramLinkCode`. */
  @Prop({ index: true, sparse: true })
  telegramChatId?: string;

  @Prop()
  telegramLinkCode?: string;

  @Prop()
  telegramLinkCodeExpiresAt?: Date;
}

@Schema({ collection: 'seller_profiles', timestamps: true })
export class SellerProfile {
  @Prop({ required: true, unique: true, index: true })
  userId!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ type: Object, default: {} })
  personal!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  storeProfile!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  activationChecklist!: Record<string, boolean>;

  @Prop({ default: 'pending', enum: ['pending', 'approved', 'rejected', 'blocked'], index: true })
  approvalStatus!: string;
}

@Schema({ collection: 'stores', timestamps: true })
export class Store {
  @Prop({ required: true, index: true })
  ownerUserId!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, enum: ['supplier_origin', 'seller_marketplace'], index: true })
  type!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: 'shopee', index: true })
  marketplace!: string;

  @Prop({ default: '' })
  externalStoreId!: string;

  @Prop({ default: 'active', enum: ['active', 'inactive', 'disconnected'] })
  status!: string;
}

@Schema({ collection: 'addresses', timestamps: true })
export class Address {
  @Prop({ required: true, index: true })
  ownerUserId!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ default: 'origin', enum: ['origin', 'billing', 'shipping'] })
  type!: string;

  @Prop({ type: Object, default: {} })
  data!: Record<string, unknown>;
}

@Schema({ collection: 'supplier_products', timestamps: true })
export class SupplierProduct {
  @Prop({ required: true, index: true })
  supplierUserId!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  supplierSku!: string;

  @Prop({ default: '' })
  shortDescription!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: '', index: true })
  category!: string;

  @Prop({ default: '' })
  brand!: string;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ default: '' })
  videoUrl!: string;

  @Prop({ default: 0, min: 0, index: true })
  costPrice!: number;

  @Prop({ default: 0, min: 0 })
  suggestedPrice!: number;

  @Prop({ default: 0, min: 0, index: true })
  stock!: number;

  @Prop({ default: 0, min: 0 })
  minStock!: number;

  /** Peso (kg) — obrigatório pela Shopee para calcular frete. */
  @Prop()
  weight?: number;

  /** Dimensões do pacote (cm) — a Shopee trata como tudo-ou-nada. */
  @Prop({ type: Object })
  dimensions?: { length: number; width: number; height: number };

  /** Código de barras (GTIN/EAN) — opcional, valida formato quando presente. */
  @Prop({ default: '' })
  gtin!: string;

  @Prop({ type: Object, default: {} })
  shipping!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  fiscal!: Record<string, unknown>;

  @Prop({ type: [Object], default: [] })
  variations!: Record<string, unknown>[];

  /** `pending_review` = só tem foto(s), aguardando o fornecedor anotar os
   * dados antes de entrar no catálogo dos vendedores. */
  @Prop({
    default: 'active',
    enum: ['active', 'inactive', 'archived', 'pending_review'],
    index: true,
  })
  status!: string;

  @Prop({ default: true, index: true })
  allowSellers!: boolean;

  @Prop({ default: 0 })
  salesCount!: number;
}

@Schema({ collection: 'marketplace_listings', timestamps: true })
export class ProductListing {
  @Prop({ required: true, index: true })
  sellerUserId!: string;

  @Prop({ required: true, index: true })
  sellerOrganizationId!: string;

  @Prop({ required: true, index: true })
  supplierProductId!: string;

  @Prop({ required: true, index: true })
  supplierUserId!: string;

  @Prop({ default: 'shopee', index: true })
  marketplace!: string;

  @Prop({ default: '' })
  connectedStoreId!: string;

  @Prop({ default: '' })
  externalItemId!: string;

  @Prop({ type: [Object], default: [] })
  variants!: Record<string, unknown>[];

  @Prop({ type: Object, default: {} })
  listingData!: Record<string, unknown>;

  @Prop({
    default: 'draft',
    enum: [
      'draft',
      'pending_publication',
      'publishing',
      'published',
      'published_with_warning',
      'rejected',
      'paused',
      'out_of_stock',
      'sync_error',
    ],
    index: true,
  })
  status!: string;

  @Prop({ type: Object, default: {} })
  pricing!: Record<string, unknown>;

  @Prop({ default: '' })
  lastError!: string;
}

@Schema({ collection: 'product_listing_mappings', timestamps: true })
export class ProductListingMapping {
  @Prop({ required: true, unique: true, index: true })
  idempotencyKey!: string;

  @Prop({ required: true, index: true })
  listingId!: string;

  @Prop({ required: true, index: true })
  supplierProductId!: string;

  @Prop({ required: true, index: true })
  supplierUserId!: string;

  @Prop({ required: true, index: true })
  sellerUserId!: string;

  @Prop({ required: true, index: true })
  marketplace!: string;

  @Prop({ required: true, index: true })
  externalItemId!: string;

  @Prop({ default: '', index: true })
  externalVariationId!: string;

  @Prop({ default: '' })
  internalVariationSku!: string;
}

@Schema({ collection: 'marketplace_orders', timestamps: true })
export class MarketplaceOrder {
  @Prop({ required: true, unique: true, index: true })
  idempotencyKey!: string;

  @Prop({ required: true, index: true })
  marketplace!: string;

  @Prop({ required: true, index: true })
  sellerUserId!: string;

  @Prop({ required: true, index: true })
  externalOrderId!: string;

  @Prop({ default: '' })
  externalStoreId!: string;

  @Prop({ type: [Object], default: [] })
  items!: Record<string, unknown>[];

  @Prop({ type: Object, default: {} })
  rawPayload!: Record<string, unknown>;

  @Prop({ default: 'received', enum: ['received', 'mapped', 'exception', 'canceled'], index: true })
  status!: string;

  @Prop({ default: '' })
  exceptionReason!: string;
}

@Schema({ collection: 'supplier_orders', timestamps: true })
export class SupplierOrder {
  @Prop({ required: true, unique: true, index: true })
  idempotencyKey!: string;

  @Prop({ required: true, index: true })
  supplierUserId!: string;

  @Prop({ required: true, index: true })
  sellerUserId!: string;

  @Prop({ required: true, index: true })
  marketplaceOrderId!: string;

  @Prop({ required: true, index: true })
  externalOrderId!: string;

  @Prop({ default: 'new', index: true })
  preparationStatus!: string;

  @Prop({ default: 'pending', index: true })
  paymentStatus!: string;

  @Prop({ default: 'pending', index: true })
  shippingStatus!: string;

  @Prop({ type: [Object], default: [] })
  items!: Record<string, unknown>[];

  @Prop({ type: Object, default: {} })
  totals!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  deadlines!: Record<string, unknown>;

  @Prop({ default: '' })
  notes!: string;
}

@Schema({ collection: 'order_documents', timestamps: true })
export class OrderDocumentFile {
  @Prop({ required: true, index: true })
  orderId!: string;

  @Prop({ required: true, index: true })
  ownerUserId!: string;

  @Prop({
    required: true,
    enum: ['invoice', 'content_declaration', 'shipping_label', 'transport', 'receipt', 'other'],
  })
  type!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  url!: string;

  @Prop({ default: 'available', enum: ['pending', 'available'] })
  status!: string;

  @Prop({ type: [Object], default: [] })
  accessHistory!: Record<string, unknown>[];
}

@Schema({ collection: 'inventory_movements', timestamps: true })
export class InventoryMovement {
  @Prop({ required: true, index: true })
  supplierProductId!: string;

  @Prop({ required: true, index: true })
  supplierUserId!: string;

  @Prop({ default: '' })
  variationSku!: string;

  @Prop({ required: true, enum: ['in', 'out', 'reserve', 'release', 'adjustment', 'sync'] })
  type!: string;

  @Prop({ required: true })
  quantity!: number;

  @Prop({ required: true })
  balanceAfter!: number;

  @Prop({ default: '' })
  reference!: string;

  @Prop({ default: '' })
  reason!: string;
}

@Schema({ collection: 'sync_jobs', timestamps: true })
export class SyncJob {
  @Prop({ required: true, unique: true, index: true })
  idempotencyKey!: string;

  @Prop({ required: true, index: true })
  marketplace!: string;

  @Prop({ required: true, enum: ['inventory', 'price', 'publication', 'order'], index: true })
  type!: string;

  @Prop({ required: true, index: true })
  ownerUserId!: string;

  @Prop({
    default: 'queued',
    enum: ['queued', 'processing', 'done', 'failed', 'canceled'],
    index: true,
  })
  status!: string;

  @Prop({ default: 0 })
  attempts!: number;

  @Prop({ default: 5 })
  maxAttempts!: number;

  @Prop({ type: Date, default: null })
  nextRunAt!: Date | null;

  @Prop({ type: Object, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ default: '' })
  lastError!: string;
}

@Schema({ collection: 'integration_logs', timestamps: true })
export class IntegrationLog {
  @Prop({ required: true, index: true })
  marketplace!: string;

  @Prop({ required: true, index: true })
  ownerUserId!: string;

  @Prop({ required: true, index: true })
  action!: string;

  @Prop({ default: 'info', enum: ['info', 'warning', 'error'], index: true })
  level!: string;

  @Prop({ default: '' })
  message!: string;

  @Prop({ type: Object, default: {} })
  context!: Record<string, unknown>;
}

@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ default: 'info', enum: ['info', 'success', 'warning', 'error'] })
  tone!: string;

  @Prop({ default: false, index: true })
  read!: boolean;

  @Prop({ type: Object, default: {} })
  data!: Record<string, unknown>;
}

@Schema({ collection: 'financial_entries', timestamps: true })
export class FinancialEntry {
  @Prop({ required: true, index: true })
  supplierOrderId!: string;

  @Prop({ required: true, index: true })
  supplierUserId!: string;

  @Prop({ required: true, index: true })
  sellerUserId!: string;

  @Prop({ type: Object, default: {} })
  amounts!: Record<string, unknown>;

  @Prop({
    default: 'pending',
    enum: ['pending', 'awaiting_confirmation', 'paid', 'dispute', 'canceled', 'refunded'],
    index: true,
  })
  status!: string;

  @Prop({ type: Date, default: null })
  expectedAt!: Date | null;

  @Prop({ type: Date, default: null })
  paidAt!: Date | null;

  @Prop({ default: '' })
  proofUrl!: string;

  @Prop({ default: '' })
  notes!: string;
}

@Schema({ collection: 'audit_logs', timestamps: true })
export class AuditLog {
  @Prop({ required: true, index: true })
  actorUserId!: string;

  @Prop({ required: true, index: true })
  action!: string;

  @Prop({ required: true, index: true })
  entity!: string;

  @Prop({ default: '' })
  entityId!: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
export const SupplierProfileSchema = SchemaFactory.createForClass(SupplierProfile);
export const SellerProfileSchema = SchemaFactory.createForClass(SellerProfile);
export const StoreSchema = SchemaFactory.createForClass(Store);
export const AddressSchema = SchemaFactory.createForClass(Address);
export const SupplierProductSchema = SchemaFactory.createForClass(SupplierProduct);
export const ProductListingSchema = SchemaFactory.createForClass(ProductListing);
export const ProductListingMappingSchema = SchemaFactory.createForClass(ProductListingMapping);
export const MarketplaceOrderSchema = SchemaFactory.createForClass(MarketplaceOrder);
export const SupplierOrderSchema = SchemaFactory.createForClass(SupplierOrder);
export const OrderDocumentFileSchema = SchemaFactory.createForClass(OrderDocumentFile);
export const InventoryMovementSchema = SchemaFactory.createForClass(InventoryMovement);
export const SyncJobSchema = SchemaFactory.createForClass(SyncJob);
export const IntegrationLogSchema = SchemaFactory.createForClass(IntegrationLog);
export const NotificationSchema = SchemaFactory.createForClass(Notification);
export const FinancialEntrySchema = SchemaFactory.createForClass(FinancialEntry);
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

SupplierProductSchema.index({ organizationId: 1, supplierSku: 1 }, { unique: true });
SupplierProductSchema.index({ name: 'text', category: 'text', brand: 'text', supplierSku: 'text' });
ProductListingSchema.index({ sellerUserId: 1, supplierProductId: 1, marketplace: 1 });
ProductListingMappingSchema.index(
  { marketplace: 1, externalItemId: 1, externalVariationId: 1 },
  { unique: true },
);
MarketplaceOrderSchema.index({ marketplace: 1, externalOrderId: 1 }, { unique: true });
SupplierOrderSchema.index({ supplierUserId: 1, preparationStatus: 1, createdAt: -1 });
InventoryMovementSchema.index({ supplierProductId: 1, createdAt: -1 });
SyncJobSchema.index({ status: 1, nextRunAt: 1, createdAt: 1 });
