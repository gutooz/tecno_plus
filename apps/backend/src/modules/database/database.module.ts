import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { User, UserSchema } from './schemas/user.schema';
import { AgentLog, AgentLogSchema } from './schemas/agent-log.schema';
import { ShopeeConnection, ShopeeConnectionSchema } from './schemas/shopee-connection.schema';
import { ShopeeOauthState, ShopeeOauthStateSchema } from './schemas/shopee-oauth-state.schema';
import {
  MercadoLivreConnection,
  MercadoLivreConnectionSchema,
} from './schemas/ml-connection.schema';
import {
  MercadoLivreOauthState,
  MercadoLivreOauthStateSchema,
} from './schemas/ml-oauth-state.schema';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { MarketingPost, MarketingPostSchema } from './schemas/marketing-post.schema';
import { MarketingInsight, MarketingInsightSchema } from './schemas/marketing-insight.schema';
import { MarketingAnalytics, MarketingAnalyticsSchema } from './schemas/marketing-analytics.schema';
import {
  Address,
  AddressSchema,
  AuditLog,
  AuditLogSchema,
  FinancialEntry,
  FinancialEntrySchema,
  IntegrationLog,
  IntegrationLogSchema,
  InventoryMovement,
  InventoryMovementSchema,
  MarketplaceOrder,
  MarketplaceOrderSchema,
  Notification,
  NotificationSchema,
  OrderDocumentFile,
  OrderDocumentFileSchema,
  Organization,
  OrganizationSchema,
  ProductListing,
  ProductListingMapping,
  ProductListingMappingSchema,
  ProductListingSchema,
  SellerProfile,
  SellerProfileSchema,
  Store,
  StoreSchema,
  SupplierOrder,
  SupplierOrderSchema,
  SupplierProduct,
  SupplierProductSchema,
  SupplierProfile,
  SupplierProfileSchema,
  SyncJob,
  SyncJobSchema,
} from './schemas/dropshipping.schema';

const models = MongooseModule.forFeature([
  { name: Product.name, schema: ProductSchema },
  { name: User.name, schema: UserSchema },
  { name: AgentLog.name, schema: AgentLogSchema },
  { name: ShopeeConnection.name, schema: ShopeeConnectionSchema },
  { name: ShopeeOauthState.name, schema: ShopeeOauthStateSchema },
  { name: MercadoLivreConnection.name, schema: MercadoLivreConnectionSchema },
  { name: MercadoLivreOauthState.name, schema: MercadoLivreOauthStateSchema },
  { name: Campaign.name, schema: CampaignSchema },
  { name: MarketingPost.name, schema: MarketingPostSchema },
  { name: MarketingInsight.name, schema: MarketingInsightSchema },
  { name: MarketingAnalytics.name, schema: MarketingAnalyticsSchema },
  { name: Organization.name, schema: OrganizationSchema },
  { name: SupplierProfile.name, schema: SupplierProfileSchema },
  { name: SellerProfile.name, schema: SellerProfileSchema },
  { name: Store.name, schema: StoreSchema },
  { name: Address.name, schema: AddressSchema },
  { name: SupplierProduct.name, schema: SupplierProductSchema },
  { name: ProductListing.name, schema: ProductListingSchema },
  { name: ProductListingMapping.name, schema: ProductListingMappingSchema },
  { name: MarketplaceOrder.name, schema: MarketplaceOrderSchema },
  { name: SupplierOrder.name, schema: SupplierOrderSchema },
  { name: OrderDocumentFile.name, schema: OrderDocumentFileSchema },
  { name: InventoryMovement.name, schema: InventoryMovementSchema },
  { name: SyncJob.name, schema: SyncJobSchema },
  { name: IntegrationLog.name, schema: IntegrationLogSchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: FinancialEntry.name, schema: FinancialEntrySchema },
  { name: AuditLog.name, schema: AuditLogSchema },
]);

/**
 * Torna os models disponíveis globalmente para evitar reimport em cada módulo
 * de agente. A CONEXÃO em si é criada no AppModule (MongooseModule.forRootAsync).
 */
@Global()
@Module({
  imports: [models],
  exports: [models],
})
export class DatabaseModule {}
