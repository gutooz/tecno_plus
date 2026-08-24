import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { AsaasBillingType } from './asaas.types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\D/g, '') : value;

export class CreateAsaasCustomerDto {
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  name!: string;

  @IsString()
  @Transform(digitsOnly)
  cpfCnpj!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  @Transform(trim)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(digitsOnly)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(digitsOnly)
  mobilePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(trim)
  addressNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  complement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(digitsOnly)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  externalReference?: string;

  @IsOptional()
  @IsBoolean()
  notificationDisabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  additionalEmails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  groupName?: string;

  @IsOptional()
  @IsBoolean()
  foreignCustomer?: boolean;
}

export class CreateAsaasPaymentDto {
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  customer!: string;

  @IsEnum(['UNDEFINED', 'BOLETO', 'CREDIT_CARD', 'PIX'])
  billingType!: AsaasBillingType;

  @IsNumber()
  @Min(0.01)
  @Max(999999.99)
  value!: number;

  @IsDateString({ strict: true })
  dueDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  externalReference?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  daysAfterDueDateToRegistrationCancellation?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(120)
  installmentCount?: number;

  @ValidateIf((body: CreateAsaasPaymentDto) => body.installmentCount !== undefined)
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  totalValue?: number;

  @ValidateIf((body: CreateAsaasPaymentDto) => body.installmentCount !== undefined)
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  installmentValue?: number;

  @IsOptional()
  @IsBoolean()
  postalService?: boolean;
}
