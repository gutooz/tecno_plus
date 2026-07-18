import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MarketplaceChannel, PaidCampaignConfig, PaidCampaignTargeting } from '@tecnoplus/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CampaignsService } from './campaigns.service';
import { PaidCampaignsService } from './paid-campaigns.service';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly paid: PaidCampaignsService,
  ) {}

  @Get()
  list(@Query('type') type?: 'organic' | 'paid') {
    return this.campaigns.list(type);
  }

  @Post('organic')
  createOrganic(
    @Body()
    body: {
      name: string;
      productIds: string[];
      channels: MarketplaceChannel[];
      startDate: string;
      intervalDays: number;
    },
  ) {
    return this.campaigns.createOrganic(body);
  }

  @Patch('organic/:id/status')
  setOrganicStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'paused' }) {
    return this.campaigns.setStatus(id, body.status);
  }

  @Delete('organic/:id')
  removeOrganic(@Param('id') id: string) {
    return this.campaigns.remove(id);
  }

  @Post('paid')
  createPaid(
    @Body()
    body: {
      name: string;
      productId: string;
      channel: MarketplaceChannel;
      objective: PaidCampaignConfig['objective'];
      dailyBudgetCents: number;
      currency: string;
      targeting: PaidCampaignTargeting;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.paid.createPaid(body);
  }

  @Patch('paid/:id/status')
  setPaidStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'paused' }) {
    return this.paid.setStatus(id, body.status);
  }

  @Delete('paid/:id')
  removePaid(@Param('id') id: string) {
    return this.paid.archive(id);
  }
}
