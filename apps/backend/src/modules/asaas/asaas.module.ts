import { Module } from '@nestjs/common';
import { AsaasApiClient } from './asaas.client';
import { AsaasController } from './asaas.controller';

@Module({
  controllers: [AsaasController],
  providers: [AsaasApiClient],
  exports: [AsaasApiClient],
})
export class AsaasModule {}
