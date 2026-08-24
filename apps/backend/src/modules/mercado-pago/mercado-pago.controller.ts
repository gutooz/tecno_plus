import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { CreateMercadoPagoPixPaymentDto } from './dto';
import { MercadoPagoApiClient } from './mercado-pago.client';

@ApiTags('mercado-pago')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mercado-pago')
export class MercadoPagoController {
  constructor(private readonly mercadoPago: MercadoPagoApiClient) {}

  @Get('config')
  config() {
    return this.mercadoPago.publicConfig();
  }

  @Post('payments/pix')
  async createPixPayment(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateMercadoPagoPixPaymentDto,
  ) {
    this.requireAdmin(user);
    const payment = await this.mercadoPago.createPixPayment(body);
    return { payment, pix: this.mercadoPago.pixFromPayment(payment) };
  }

  @Get('payments/:id')
  getPayment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.requireAdmin(user);
    return this.mercadoPago.getPayment(id);
  }

  private requireAdmin(user: AuthUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException(
        'Apenas administradores podem operar a API direta do Mercado Pago.',
      );
    }
  }
}
