import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.whatsapp.status(user);
  }

  @Post('start')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  start(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.whatsapp.start(user);
  }

  @Get('qr-code')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  qrCode(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.whatsapp.qrCode(user);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.whatsapp.logout(user);
  }

  @Get('products')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  products(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    return this.whatsapp.listProducts(user, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('preview-products')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  previewProducts(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.whatsapp.preview(user, body);
  }

  @Post('send-products')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  sendProducts(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.whatsapp.sendProducts(user, body);
  }
}

@ApiTags('whatsapp')
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Post()
  webhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-wppconnect-secret') secret?: string,
  ): Promise<unknown> {
    return this.whatsapp.webhook(body, secret);
  }
}
