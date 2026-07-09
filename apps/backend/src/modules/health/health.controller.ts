import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AiService } from '../ai/ai.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    private readonly ai: AiService,
  ) {}

  @Get()
  async check() {
    return {
      status: 'ok',
      mongo: this.mongo.readyState === 1 ? 'up' : 'down',
      aiProvider: this.ai.providerName,
      timestamp: new Date().toISOString(),
    };
  }
}
