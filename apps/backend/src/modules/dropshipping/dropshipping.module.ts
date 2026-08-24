import { Module } from '@nestjs/common';
import { AgentsModule } from '../../agents/agents.module';
import { AsaasModule } from '../asaas/asaas.module';
import { MercadoPagoModule } from '../mercado-pago/mercado-pago.module';
import {
  AsaasWebhookController,
  DropshippingController,
  MercadoPagoWebhookController,
} from './dropshipping.controller';
import { DropshippingService } from './dropshipping.service';
import { ShopeeProvider } from './marketplaces/shopee.provider';

@Module({
  imports: [AgentsModule, AsaasModule, MercadoPagoModule],
  controllers: [DropshippingController, AsaasWebhookController, MercadoPagoWebhookController],
  providers: [DropshippingService, ShopeeProvider],
  exports: [DropshippingService],
})
export class DropshippingModule {}
