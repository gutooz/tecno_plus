import { Module } from '@nestjs/common';
import { AgentsModule } from '../../agents/agents.module';
import { PublishService } from './publish.service';

@Module({
  imports: [AgentsModule],
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishModule {}
