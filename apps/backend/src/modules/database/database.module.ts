import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { User, UserSchema } from './schemas/user.schema';
import { AgentLog, AgentLogSchema } from './schemas/agent-log.schema';
import { ShopeeConnection, ShopeeConnectionSchema } from './schemas/shopee-connection.schema';
import { ShopeeOauthState, ShopeeOauthStateSchema } from './schemas/shopee-oauth-state.schema';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { MarketingPost, MarketingPostSchema } from './schemas/marketing-post.schema';
import { MarketingInsight, MarketingInsightSchema } from './schemas/marketing-insight.schema';
import { MarketingAnalytics, MarketingAnalyticsSchema } from './schemas/marketing-analytics.schema';

const models = MongooseModule.forFeature([
  { name: Product.name, schema: ProductSchema },
  { name: User.name, schema: UserSchema },
  { name: AgentLog.name, schema: AgentLogSchema },
  { name: ShopeeConnection.name, schema: ShopeeConnectionSchema },
  { name: ShopeeOauthState.name, schema: ShopeeOauthStateSchema },
  { name: Campaign.name, schema: CampaignSchema },
  { name: MarketingPost.name, schema: MarketingPostSchema },
  { name: MarketingInsight.name, schema: MarketingInsightSchema },
  { name: MarketingAnalytics.name, schema: MarketingAnalyticsSchema },
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
