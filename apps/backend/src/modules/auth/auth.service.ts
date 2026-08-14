import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { User, UserDocument } from '../database/schemas/user.schema';
import { EmailService } from './email.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async register(
    email: string,
    password: string,
    name?: string,
    profileType?: 'supplier' | 'seller',
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const displayName = name?.trim() ?? '';
    const exists = await this.users.findOne({ email: normalizedEmail });
    if (exists) throw new UnauthorizedException('E-mail já cadastrado');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create({
      email: normalizedEmail,
      passwordHash,
      name: displayName,
      role: profileType ?? 'seller',
    });
    this.email.sendWelcome(user.email, user.name).catch((err) => {
      this.logger.warn(`Falha ao enviar boas-vindas para ${user.email}: ${String(err)}`);
    });
    return this.issueTokens(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.issueTokens(user);
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

  async forgotPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findOne({ email: normalizedEmail });

    // Resposta neutra para nao revelar se o e-mail existe no cadastro.
    const response = {
      ok: true,
      message: 'Se este e-mail estiver cadastrado, enviaremos um link de recuperacao.',
    };
    if (!user) return response;

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(token);
    const expiresMinutes = this.config.get<number>('email.passwordResetExpiresMinutes') ?? 60;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpiresAt = expiresAt;
    await user.save();

    const publicUrl = (this.config.get<string>('app.publicUrl') ?? 'http://localhost:3000')
      .replace(/\/+$/, '')
      .replace(/\/api$/i, '');
    const link = `${publicUrl}/login?resetToken=${encodeURIComponent(token)}`;
    await this.email.sendPasswordReset(user.email, link, expiresMinutes);

    return response;
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = this.hashResetToken(token);
    const user = await this.users.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
    });
    if (!user) throw new UnauthorizedException('Link de recuperacao invalido ou expirado');

    user.passwordHash = await bcrypt.hash(password, 10);
    user.refreshTokenHashes = [];
    user.resetPasswordTokenHash = '';
    user.resetPasswordExpiresAt = null;
    await user.save();

    return this.issueTokens(user);
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
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
}
