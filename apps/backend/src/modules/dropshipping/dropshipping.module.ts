import { Module } from '@nestjs/common';
import { AgentsModule } from '../../agents/agents.module';
import { AsaasWebhookController, DropshippingController } from './dropshipping.controller';
import { DropshippingService } from './dropshipping.service';
import { ShopeeProvider } from './marketplaces/shopee.provider';

@Module({
  imports: [AgentsModule],
  controllers: [DropshippingController, AsaasWebhookController],
  providers: [DropshippingService, ShopeeProvider],
  exports: [DropshippingService],
})
export class DropshippingModule {}
