import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../database/schemas/user.schema';
import { MercadoPagoApiClient } from '../mercado-pago/mercado-pago.client';
import type { MercadoPagoPayment } from '../mercado-pago/mercado-pago.types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

const SIGNUP_PAYMENT_AMOUNT = 20;
const SIGNUP_PAYMENT_DESCRIPTION = 'Cadastro zycron';
const MERCADO_PAGO_APPROVED_STATUSES = new Set(['approved']);
const MERCADO_PAGO_REJECTED_STATUSES = new Set([
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
]);

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mercadoPago: MercadoPagoApiClient,
  ) {}

  async register(email: string, password: string, name?: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const cleanName = String(name ?? '').trim();
    const exists = await this.users.findOne({ email: normalizedEmail });
    if (exists) throw new UnauthorizedException('E-mail já cadastrado');

    const externalReference = this.signupPaymentReference(normalizedEmail);
    const payment = await this.mercadoPago.createPixPayment({
      transactionAmount: SIGNUP_PAYMENT_AMOUNT,
      description: SIGNUP_PAYMENT_DESCRIPTION,
      payerEmail: normalizedEmail,
      payerName: cleanName,
      externalReference,
      idempotencyKey: externalReference,
    });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create({
      email: normalizedEmail,
      passwordHash,
      name: cleanName,
      role: 'seller',
      signupPaymentStatus: this.signupPaymentStatusFromMercadoPago(payment),
      signupPaymentId: String(payment.id),
      signupPaymentAmount: SIGNUP_PAYMENT_AMOUNT,
      signupPaymentExternalReference: externalReference,
    });
    if (this.isPaymentApproved(payment)) {
      return { paymentRequired: false, ...(await this.issueTokens(user)) };
    }
    return this.signupPaymentResponse(payment);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ email: this.normalizeEmail(email) });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (this.needsSignupPayment(user)) {
      const approved = await this.refreshSignupPayment(user);
      if (!approved) {
        throw new UnauthorizedException('Pagamento do cadastro pendente');
      }
    }
    return this.issueTokens(user);
  }

  async confirmRegistrationPayment(email: string, password: string, paymentId: string) {
    const cleanPaymentId = String(paymentId ?? '').trim();
    const user = await this.users.findOne({
      email: this.normalizeEmail(email),
      signupPaymentId: cleanPaymentId,
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Cadastro não encontrado para esse pagamento');
    }

    const approved = await this.refreshSignupPayment(user);
    if (approved) {
      return { paymentRequired: false, ...(await this.issueTokens(user)) };
    }

    return {
      paymentRequired: true,
      amount: user.signupPaymentAmount || SIGNUP_PAYMENT_AMOUNT,
      status: user.signupPaymentStatus || 'pending',
      paymentId: cleanPaymentId,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      const user = await this.users.findById(payload.sub);
      if (!user) throw new UnauthorizedException();
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  private async issueTokens(user: UserDocument) {
    const payload: JwtPayload = { sub: String(user._id), email: user.email, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get<string>('jwt.expiresIn'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);
    return {
      accessToken,
      refreshToken,
      user: { id: payload.sub, email: user.email, name: user.name, role: user.role },
    };
  }

  private normalizeEmail(email: string) {
    return String(email ?? '')
      .trim()
      .toLowerCase();
  }

  private signupPaymentReference(email: string) {
    return `signup:${email}`;
  }

  private signupPaymentResponse(payment: MercadoPagoPayment) {
    return {
      paymentRequired: true,
      amount: SIGNUP_PAYMENT_AMOUNT,
      status: this.signupPaymentStatusFromMercadoPago(payment),
      paymentId: String(payment.id),
      pix: this.mercadoPago.pixFromPayment(payment),
    };
  }

  private needsSignupPayment(user: UserDocument) {
    return user.signupPaymentStatus === 'pending';
  }

  private async refreshSignupPayment(user: UserDocument) {
    if (!user.signupPaymentId) return false;
    const payment = await this.mercadoPago.getPayment(user.signupPaymentId);
    user.signupPaymentStatus = this.signupPaymentStatusFromMercadoPago(payment);
    if (this.isPaymentApproved(payment)) {
      await user.save();
      return true;
    }
    if (user.signupPaymentStatus !== 'pending') {
      await user.save();
    }
    return false;
  }

  private signupPaymentStatusFromMercadoPago(payment: MercadoPagoPayment) {
    const status = String(payment.status ?? '').toLowerCase();
    if (MERCADO_PAGO_APPROVED_STATUSES.has(status)) return 'approved';
    if (MERCADO_PAGO_REJECTED_STATUSES.has(status)) return 'rejected';
    return 'pending';
  }

  private isPaymentApproved(payment: MercadoPagoPayment) {
    return MERCADO_PAGO_APPROVED_STATUSES.has(String(payment.status ?? '').toLowerCase());
  }
}
