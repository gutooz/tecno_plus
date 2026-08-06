import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../database/schemas/user.schema';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(
    email: string,
    password: string,
    name?: string,
    profileType?: 'supplier' | 'seller',
  ) {
    const exists = await this.users.findOne({ email });
    if (exists) throw new UnauthorizedException('E-mail já cadastrado');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create({
      email,
      passwordHash,
      name: name ?? '',
      role: profileType ?? 'seller',
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
