import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\D/g, '') : value;

export class CreateMercadoPagoPixPaymentDto {
  @IsNumber()
  @Min(0.01)
  @Max(999999.99)
  transactionAmount!: number;

  @IsString()
  @MaxLength(255)
  @Transform(trim)
  description!: string;

  @IsEmail()
  @MaxLength(255)
  @Transform(trim)
  payerEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  payerName?: string;

  @IsOptional()
  @IsEnum(['CPF', 'CNPJ'])
  payerDocumentType?: 'CPF' | 'CNPJ';

  @IsOptional()
  @IsString()
  @MaxLength(14)
  @Transform(digitsOnly)
  payerDocumentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  externalReference?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(500)
  @Transform(trim)
  notificationUrl?: string;
}
