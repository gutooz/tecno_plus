import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { SocialModule } from '../social/social.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [UploadsModule, SocialModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
