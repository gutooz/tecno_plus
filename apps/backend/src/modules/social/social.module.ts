import { Module } from '@nestjs/common';
import { AgentsModule } from '../../agents/agents.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { SocialApprovalService } from './social.service';
import { SocialScheduler } from './social.scheduler';
import { SocialController } from './social.controller';

/** Divulgação diária no Facebook com aprovação via Telegram (ver `TelegramModule`). */
@Module({
  imports: [AgentsModule, CampaignsModule],
  controllers: [SocialController],
  providers: [SocialApprovalService, SocialScheduler],
  exports: [SocialApprovalService, SocialScheduler],
})
export class SocialModule {}
