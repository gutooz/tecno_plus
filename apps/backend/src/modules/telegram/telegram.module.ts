import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [UploadsModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
