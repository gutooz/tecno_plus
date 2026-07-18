import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { AgentsModule } from '../../agents/agents.module';
import { CampaignsModule } from '../campaigns/campaigns.module';

/**
 * `ShopeeApiClient`/`ShopeeConnectionsService` já são providers do
 * `AgentsModule` (o `ShopeePublisher` precisa deles) — este módulo só reusa
 * os exports em vez de duplicar os providers. `CampaignsModule` entra só
 * pelo `PaidCampaignsService.configured` (flag `paidAdsConfigured` na lista).
 */
@Module({
  imports: [AgentsModule, CampaignsModule],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
