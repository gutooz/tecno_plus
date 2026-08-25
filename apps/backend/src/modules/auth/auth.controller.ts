import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, RegistrationPaymentStatusDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Cria um usuário e retorna tokens' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.name);
  }

  @Post('register/payment-status')
  @ApiOperation({ summary: 'Confirma pagamento do cadastro no Mercado Pago' })
  registrationPaymentStatus(@Body() dto: RegistrationPaymentStatusDto) {
    return this.auth.confirmRegistrationPayment(dto.email, dto.password, dto.paymentId);
  }

  @Post('login')
  @ApiOperation({ summary: 'Autentica e retorna access + refresh token' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renova o access token' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}
