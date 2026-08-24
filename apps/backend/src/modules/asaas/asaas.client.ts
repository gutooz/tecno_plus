import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AsaasCustomer,
  AsaasCustomerPayload,
  AsaasPayment,
  AsaasPaymentPayload,
  AsaasPixQrCode,
} from './asaas.types';

type AsaasApiError = {
  errors?: Array<{ code?: string; description?: string }>;
  error?: string;
  message?: string;
};

@Injectable()
export class AsaasApiClient {
  private readonly logger = new Logger(AsaasApiClient.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  publicConfig() {
    return {
      configured: this.configured,
      environment: this.environment,
      baseUrl: this.baseUrl,
      webhookConfigured: Boolean(this.webhookToken),
      missing: [!this.apiKey && 'ASAAS_API_KEY'].filter(Boolean),
    };
  }

  get webhookToken(): string {
    return this.config.get<string>('asaas.webhookToken') ?? '';
  }

  async createCustomer(input: AsaasCustomerPayload): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>('/customers', {
      method: 'POST',
      body: this.withoutEmpty({
        ...input,
        cpfCnpj: input.cpfCnpj.replace(/\D/g, ''),
      }),
    });
  }

  async createPayment(input: AsaasPaymentPayload): Promise<AsaasPayment> {
    const body = this.normalizePaymentPayload(input);
    return this.request<AsaasPayment>('/payments', { method: 'POST', body });
  }

  async getPayment(id: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>(`/payments/${encodeURIComponent(id)}`);
  }

  async getPaymentPixQrCode(id: string): Promise<AsaasPixQrCode> {
    return this.request<AsaasPixQrCode>(`/payments/${encodeURIComponent(id)}/pixQrCode`);
  }

  private get apiKey(): string {
    return this.config.get<string>('asaas.apiKey')?.trim() ?? '';
  }

  private get environment(): string {
    return this.config.get<string>('asaas.environment') ?? 'sandbox';
  }

  private get baseUrl(): string {
    return (this.config.get<string>('asaas.baseUrl') ?? 'https://api-sandbox.asaas.com/v3').replace(
      /\/+$/,
      '',
    );
  }

  private get userAgent(): string {
    return (
      this.config.get<string>('asaas.userAgent') || `zycron/0.1.0 (Node.js; ${this.environment})`
    );
  }

  private normalizePaymentPayload(input: AsaasPaymentPayload): Record<string, unknown> {
    if (!['UNDEFINED', 'BOLETO', 'CREDIT_CARD', 'PIX'].includes(input.billingType)) {
      throw new BadRequestException('Forma de pagamento Asaas inválida.');
    }
    if (!Number.isFinite(input.value) || input.value <= 0) {
      throw new BadRequestException('Valor da cobrança Asaas deve ser maior que zero.');
    }

    const hasInstallments = input.installmentCount !== undefined;
    if (!hasInstallments) {
      const { installmentCount, installmentValue, totalValue, ...singlePayment } = input;
      return this.withoutEmpty({ ...singlePayment });
    }

    const totalModes = [
      input.totalValue !== undefined,
      input.installmentValue !== undefined,
    ].filter(Boolean).length;
    if (!input.installmentCount || input.installmentCount < 2 || totalModes !== 1) {
      throw new BadRequestException(
        'Cobrança parcelada Asaas exige installmentCount e exatamente um entre totalValue ou installmentValue.',
      );
    }
    return this.withoutEmpty({ ...input });
  }

  private async request<T>(
    path: string,
    options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    if (!this.apiKey) throw new BadRequestException('ASAAS_API_KEY não configurada.');
    const method = options.method ?? 'GET';
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        // Docs oficiais: https://docs.asaas.com/docs/authentication
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
        access_token: this.apiKey,
      },
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
    });

    const json = await this.parseResponse(res);
    if (!res.ok) this.raiseAsaasError(path, res.status, json as AsaasApiError);
    return json as T;
  }

  private async parseResponse(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  private raiseAsaasError(path: string, status: number, body: AsaasApiError): never {
    const details = body.errors
      ?.map((error) => error.description || error.code)
      .filter(Boolean)
      .join('; ');
    const message = details || body.message || body.error || `HTTP ${status}`;
    this.logger.warn(`Asaas API falhou (${path}): ${message}`);
    throw new BadRequestException(`Asaas ${status}: ${message}`);
  }

  private withoutEmpty(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        return true;
      }),
    );
  }
}
