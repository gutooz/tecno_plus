import { Module } from '@nestjs/common';
import { WhatsAppController, WhatsAppWebhookController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WppConnectClient } from './wppconnect.client';

@Module({
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, WppConnectClient],
})
export class WhatsAppModule {}
