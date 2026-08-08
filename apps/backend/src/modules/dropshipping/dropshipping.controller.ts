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
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { DropshippingService } from './dropshipping.service';

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

  @Get('supplier/products')
  supplierProducts(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dropshipping.listSupplierProducts(user, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('supplier/products')
  createSupplierProduct(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dropshipping.createSupplierProduct(user, body);
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
  sellerListings(@CurrentUser() user: AuthUser) {
    return this.dropshipping.listSellerListings(user);
  }

  @Post('seller/listings/:id/request-publication')
  requestPublication(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dropshipping.requestPublication(user, id);
  }

  @Get('seller/orders')
  sellerOrders(@CurrentUser() user: AuthUser) {
    return this.dropshipping.sellerOrdersList(user);
  }

  @Post('seller/orders/import')
  importMarketplaceOrder(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dropshipping.importMarketplaceOrder(user, body);
  }

  @Get('admin/dashboard')
  adminDashboard(@CurrentUser() user: AuthUser) {
    return this.dropshipping.adminDashboard(user);
  }
}
