import { Module } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PaidCampaignsService } from './paid-campaigns.service';
import { CampaignsController } from './campaigns.controller';

/**
 * Campanhas de divulgação social — orgânicas (agendamento em lote, sem custo)
 * e pagas (Facebook Marketing API, com gasto real — ver `PaidCampaignsService`
 * para o gate de configuração/segurança). Os models `Campaign`/`Product` vêm
 * do `DatabaseModule` global — nenhum import extra necessário aqui.
 */
@Module({
  controllers: [CampaignsController],
  providers: [CampaignsService, PaidCampaignsService],
  exports: [CampaignsService, PaidCampaignsService],
})
export class CampaignsModule {}
