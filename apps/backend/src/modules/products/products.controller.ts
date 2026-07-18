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
import { encodeReportHeader } from './shopee';
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

  /**
   * `?report=1` devolve a versão anotada (com as abas Validação/Corrigidos/
   * Rejeitados/Leia-me) para conferência. O arquivo padrão vai limpo, porque o
   * importador do Seller Center espera a estrutura exata do template.
   */
  @Get('export/shopee')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportShopee(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('ids') ids?: string,
    @Query('report') report?: string,
  ) {
    const selectedIds = ids
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const withReport = report === '1' || report === 'true';
    const { buffer, report: summary } = await this.products.exportShopee(user.id, selectedIds, {
      includeReportSheets: withReport,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = withReport ? '-conferencia' : '';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="shopee-lote-${stamp}${suffix}.xlsx"`,
    );
    // O relatório antes só existia no log do servidor — quem baixava não tinha
    // como saber que produtos ficaram de fora, nem qual template foi usado.
    // Vai escapado: header não aceita os acentos do texto (ver encodeReportHeader).
    res.setHeader('X-Shopee-Export-Report', encodeReportHeader(summary));
    res.setHeader('Access-Control-Expose-Headers', 'X-Shopee-Export-Report');
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

  /**
   * Estima por IA o peso dos produtos que estão sem — sem `ids`, varre o catálogo
   * inteiro do dono. Não toca em quem já tem peso.
   */
  @Post('estimate-weight-batch')
  estimateWeightBatch(@CurrentUser() user: AuthUser, @Body() body: { ids?: string[] }) {
    return this.products.estimateWeightBatch(user.id, body.ids ?? []);
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
  publishProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('channel') channel?: MarketplaceChannel,
  ) {
    return this.publish.publish(user.id, id, channel);
  }

  @Post(':id/republish')
  republish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('channel') channel?: MarketplaceChannel,
  ) {
    return this.publish.publish(user.id, id, channel);
  }
}
