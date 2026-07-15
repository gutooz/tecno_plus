import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MarketplaceChannel, ProductStatus } from '@tecnoplus/shared';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { ProductsService } from './products.service';
import { PublishService } from '../publish/publish.service';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly publish: PublishService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('status') status?: ProductStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.products.list({
      ownerId: user.id,
      search,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy,
      sortDir,
    });
  }

  @Get('export/shopee')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportShopee(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('ids') ids?: string,
  ) {
    const selectedIds = ids
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const buffer = await this.products.exportShopee(user.id, selectedIds);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="shopee-lote-${stamp}.xlsx"`);
    res.send(buffer);
  }

  @Post('publish-batch')
  publishBatch(
    @CurrentUser() user: AuthUser,
    @Body() body: { ids?: string[]; channel?: MarketplaceChannel },
  ) {
    return this.publish.publishBatch(user.id, body.ids ?? [], body.channel);
  }

  @Post('regenerate-images-batch')
  regenerateImagesBatch(@CurrentUser() user: AuthUser, @Body() body: { ids?: string[] }) {
    return this.products.regenerateImagesBatch(user.id, body.ids ?? []);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.findById(user.id, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() patch: Record<string, unknown>,
  ) {
    return this.products.update(user.id, id, patch);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.duplicate(user.id, id);
  }

  @Post(':id/process')
  process(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.startPipeline(user.id, id);
  }

  @Post(':id/regenerate-images')
  regenerateImages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.regenerateImages(user.id, id);
  }

  @Post(':id/regenerate-image')
  regenerateImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { index?: number; prompt?: string },
  ) {
    return this.products.regenerateImage(user.id, id, body.index ?? 0, body.prompt ?? '');
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.remove(user.id, id);
  }

  @Post(':id/publish')
  publishProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.publish.publish(user.id, id);
  }

  @Post(':id/republish')
  republish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.publish.publish(user.id, id);
  }
}
