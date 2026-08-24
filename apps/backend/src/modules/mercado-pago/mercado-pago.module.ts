import { Module } from '@nestjs/common';
import { MercadoPagoApiClient } from './mercado-pago.client';
import { MercadoPagoController } from './mercado-pago.controller';

@Module({
  controllers: [MercadoPagoController],
  providers: [MercadoPagoApiClient],
  exports: [MercadoPagoApiClient],
})
export class MercadoPagoModule {}
