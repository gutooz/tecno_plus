import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { MercadoPagoApiClient } from '../mercado-pago/mercado-pago.client';
import { DropshippingService } from './dropshipping.service';

// tipo mínimo do arquivo do Multer (evita depender de @types global)
interface MulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@ApiTags('dropshipping')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dropshipping')
export class DropshippingController {
  constructor(private readonly dropshipping: DropshippingService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.dropshipping.me(user);
  }

  @Post('onboarding/supplier')
  onboardSupplier(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dropshipping.onboardSupplier(user, body);
  }

  @Post('onboarding/seller')
  onboardSeller(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dropshipping.onboardSeller(user, body);
  }

  @Get('supplier/dashboard')
  supplierDashboard(@CurrentUser() user: AuthUser) {
    return this.dropshipping.supplierDashboard(user);
  }

  @Get('supplier/settings')
  supplierSettings(@CurrentUser() user: AuthUser) {
    return this.dropshipping.supplierSettings(user);
  }

  @Patch('supplier/settings')
  updateSupplierSettings(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dropshipping.updateSupplierSettings(user, body);
  }

  @Post('supplier/settings/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 1))
  async uploadSupplierLogo(@CurrentUser() user: AuthUser, @UploadedFiles() files: MulterFile[]) {
    return this.dropshipping.uploadSupplierLogo(user, {
      buffer: files?.[0]?.buffer,
      mimeType: files?.[0]?.mimetype ?? '',
    });
  }

  @Get('supplier/address/cep/:cep')
  lookupCep(@CurrentUser() user: AuthUser, @Param('cep') cep: string) {
    return this.dropshipping.lookupCep(user, cep);
  }

  @Get('supplier/products')
  supplierProducts(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dropshipping.listSupplierProducts(user, {
      search,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('supplier/products')
  createSupplierProduct(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dropshipping.createSupplierProduct(user, body);
  }

  /** Sobe fotos e cria produtos rascunho (pending_review) — mesma lógica do
   * "Envio em Lote" do catálogo principal, só que direto no cadastro do
   * fornecedor. Título/preço/estoque ficam pra depois, na tela do fornecedor. */
  @Post('supplier/products/photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 50))
  async uploadSupplierPhotos(@CurrentUser() user: AuthUser, @UploadedFiles() files: MulterFile[]) {
    const items = await Promise.all(
      (files ?? []).map((f) =>
        this.dropshipping.ingestSupplierPhoto(user, { buffer: f.buffer, mimeType: f.mimetype }),
      ),
    );
    return { received: items.length, items };
  }

  @Post('supplier/telegram/link')
  generateTelegramLink(@CurrentUser() user: AuthUser) {
    return this.dropshipping.generateTelegramLinkCode(user);
  }

  @Get('supplier/telegram/status')
  telegramStatus(@CurrentUser() user: AuthUser) {
    return this.dropshipping.telegramStatus(user);
  }

  @Post('supplier/telegram/unlink')
  unlinkTelegram(@CurrentUser() user: AuthUser) {
    return this.dropshipping.unlinkTelegram(user);
  }

  @Patch('supplier/products/:id')
  updateSupplierProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dropshipping.updateSupplierProduct(user, id, body);
  }

  @Post('supplier/products/:id/duplicate')
  duplicateSupplierProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dropshipping.duplicateSupplierProduct(user, id);
  }

  @Delete('supplier/products/:id')
  removeSupplierProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dropshipping.removeSupplierProduct(user, id);
  }

  @Get('supplier/orders')
  supplierOrders(@CurrentUser() user: AuthUser) {
    return this.dropshipping.supplierOrdersList(user);
  }

  @Get('seller/dashboard')
  sellerDashboard(@CurrentUser() user: AuthUser) {
    return this.dropshipping.sellerDashboard(user);
  }

  @Get('seller/catalog')
  catalog(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('supplier') supplier?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dropshipping.catalog(user, {
      search,
      category,
      supplier,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('seller/listings')
  prepareListing(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dropshipping.prepareListing(user, body);
  }

  @Get('seller/listings')
  sellerListings(
    @CurrentUser() user: AuthUser,
    @Query('marketplace') marketplace?: string,
  ): Promise<unknown> {
    return this.dropshipping.listSellerListings(user, { marketplace });
  }

  @Patch('seller/listings/:id')
  updateSellerListing(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.dropshipping.updateSellerListing(user, id, body);
  }

  @Delete('seller/listings/:id')
  removeSellerListing(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<unknown> {
    return this.dropshipping.removeSellerListing(user, id);
  }

  @Post('seller/listings/:id/request-publication')
  requestPublication(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dropshipping.requestPublication(user, id);
  }

  @Get('seller/orders')
  sellerOrders(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.dropshipping.sellerOrdersList(user, { date });
  }

  @Get('seller/finance')
  sellerFinance(@CurrentUser() user: AuthUser) {
    return this.dropshipping.sellerFinance(user);
  }

  @Post('seller/finance/:id/pix')
  sellerFinancePix(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dropshipping.createSellerFinancePix(user, id);
  }

  @Post('seller/orders/import')
  importMarketplaceOrder(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dropshipping.importMarketplaceOrder(user, body);
  }

  @Get('admin/dashboard')
  adminDashboard(@CurrentUser() user: AuthUser) {
    return this.dropshipping.adminDashboard(user);
  }

  @Get('admin/platform-fee-rules')
  adminPlatformFeeRules(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.dropshipping.adminPlatformFeeRules(user);
  }

  @Patch('admin/platform-fee-rules')
  updateAdminPlatformFeeRules(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.dropshipping.updateAdminPlatformFeeRules(user, body);
  }
}

@ApiTags('dropshipping')
@Controller('dropshipping/asaas')
export class AsaasWebhookController {
  constructor(
    private readonly dropshipping: DropshippingService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  webhook(
    @Body() body: Record<string, unknown>,
    @Headers('asaas-access-token') accessToken?: string,
  ) {
    const expected = this.config.get<string>('asaas.webhookToken') ?? '';
    if (expected && accessToken !== expected) {
      throw new ForbiddenException('Webhook Asaas com token inválido.');
    }
    return this.dropshipping.asaasWebhook(body);
  }
}

@ApiTags('dropshipping')
@Controller('dropshipping/mercado-pago')
export class MercadoPagoWebhookController {
  constructor(
    private readonly dropshipping: DropshippingService,
    private readonly mercadoPago: MercadoPagoApiClient,
  ) {}

  @Post('webhook')
  webhook(
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string | undefined>,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    const data =
      body.data && typeof body.data === 'object' && !Array.isArray(body.data)
        ? (body.data as Record<string, unknown>)
        : {};
    const dataId = String(query['data.id'] ?? data.id ?? '');
    this.mercadoPago.verifyWebhookSignature({ xSignature, xRequestId, dataId });
    return this.dropshipping.mercadoPagoWebhook(body, query);
  }
}
