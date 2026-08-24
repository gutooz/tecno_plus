import { Body, Controller, Get, Param, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { AsaasApiClient } from './asaas.client';
import { CreateAsaasCustomerDto, CreateAsaasPaymentDto } from './dto';

@ApiTags('asaas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('asaas')
export class AsaasController {
  constructor(private readonly asaas: AsaasApiClient) {}

  @Get('config')
  config() {
    return this.asaas.publicConfig();
  }

  @Post('customers')
  createCustomer(@CurrentUser() user: AuthUser, @Body() body: CreateAsaasCustomerDto) {
    this.requireAdmin(user);
    return this.asaas.createCustomer(body);
  }

  @Post('payments')
  createPayment(@CurrentUser() user: AuthUser, @Body() body: CreateAsaasPaymentDto) {
    this.requireAdmin(user);
    return this.asaas.createPayment(body);
  }

  @Get('payments/:id')
  getPayment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.requireAdmin(user);
    return this.asaas.getPayment(id);
  }

  @Get('payments/:id/pix-qrcode')
  getPaymentPixQrCode(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.requireAdmin(user);
    return this.asaas.getPaymentPixQrCode(id);
  }

  private requireAdmin(user: AuthUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Apenas administradores podem operar a API direta do Asaas.');
    }
  }
}
