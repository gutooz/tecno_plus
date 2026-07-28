import { Module } from '@nestjs/common';
import { AgentsModule } from '../../agents/agents.module';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [AgentsModule],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
