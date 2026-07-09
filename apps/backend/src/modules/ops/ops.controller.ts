import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { OpsService } from './ops.service';

@ApiTags('ops')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.ops.dashboard(user.id);
  }

  @Get('jobs')
  jobs() {
    return this.ops.jobs();
  }

  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return this.ops.recentLogs(limit ? Number(limit) : 100);
  }
}
