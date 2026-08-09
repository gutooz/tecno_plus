import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { SocialModule } from '../social/social.module';
import { DropshippingModule } from '../dropshipping/dropshipping.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [UploadsModule, SocialModule, DropshippingModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
