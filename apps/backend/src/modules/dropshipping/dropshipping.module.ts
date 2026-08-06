import { Module } from '@nestjs/common';
import { DropshippingController } from './dropshipping.controller';
import { DropshippingService } from './dropshipping.service';
import { ShopeeProvider } from './marketplaces/shopee.provider';

@Module({
  controllers: [DropshippingController],
  providers: [DropshippingService, ShopeeProvider],
})
export class DropshippingModule {}
