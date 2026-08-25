import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @IsEmail()
  @Transform(normalizeEmail)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  name?: string;

  @IsOptional()
  profileType?: 'seller';
}

export class LoginDto {
  @IsEmail()
  @Transform(normalizeEmail)
  email!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class RegistrationPaymentStatusDto {
  @IsEmail()
  @Transform(normalizeEmail)
  email!: string;

  @IsString()
  password!: string;

  @IsString()
  @MaxLength(100)
  @Transform(trim)
  paymentId!: string;
}
