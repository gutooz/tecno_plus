import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  MercadoPagoPayment,
  MercadoPagoPixPaymentPayload,
  MercadoPagoPixQrCode,
} from './mercado-pago.types';

type MercadoPagoApiError = {
  message?: string;
  error?: string;
  cause?: Array<{ code?: string | number; description?: string; message?: string }>;
};

@Injectable()
export class MercadoPagoApiClient {
  private readonly logger = new Logger(MercadoPagoApiClient.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.accessToken);
  }

  publicConfig() {
    return {
      configured: this.configured,
      environment: this.environment,
      baseUrl: this.baseUrl,
      webhookUrl: this.webhookUrl,
      webhookConfigured: Boolean(this.webhookSecret),
      missing: [!this.accessToken && 'MERCADO_PAGO_ACCESS_TOKEN'].filter(Boolean),
    };
  }

  async createPixPayment(input: MercadoPagoPixPaymentPayload): Promise<MercadoPagoPayment> {
    if (!Number.isFinite(input.transactionAmount) || input.transactionAmount <= 0) {
      throw new BadRequestException('Valor da cobrança Mercado Pago deve ser maior que zero.');
    }
    if (!input.payerEmail) {
      throw new BadRequestException('Email do pagador é obrigatório para Pix Mercado Pago.');
    }

    const payer = this.withoutEmpty({
      email: input.payerEmail,
      ...this.nameParts(input.payerName),
      identification:
        input.payerDocumentType && input.payerDocumentNumber
          ? {
              type: input.payerDocumentType,
              number: input.payerDocumentNumber.replace(/\D/g, ''),
            }
          : undefined,
    });

    return this.request<MercadoPagoPayment>('/v1/payments', {
      method: 'POST',
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      body: this.withoutEmpty({
        transaction_amount: Math.round(input.transactionAmount * 100) / 100,
        description: input.description,
        payment_method_id: 'pix',
        payer,
        external_reference: input.externalReference,
        notification_url: input.notificationUrl ?? this.webhookUrl,
      }),
    });
  }

  async getPayment(id: string | number): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(String(id))}`);
  }

  pixFromPayment(payment: MercadoPagoPayment): MercadoPagoPixQrCode {
    const data = payment.point_of_interaction?.transaction_data;
    return {
      encodedImage: data?.qr_code_base64,
      payload: data?.qr_code,
      ticketUrl: data?.ticket_url,
    };
  }

  verifyWebhookSignature(input: {
    xSignature?: string;
    xRequestId?: string;
    dataId?: string;
  }): void {
    if (!this.webhookSecret) return;
    const parsed = this.parseSignature(input.xSignature);
    const manifest = [
      input.dataId && `id:${input.dataId};`,
      input.xRequestId && `request-id:${input.xRequestId};`,
      parsed.ts && `ts:${parsed.ts};`,
    ]
      .filter(Boolean)
      .join('');
    if (!manifest || !parsed.v1) {
      throw new ForbiddenException('Webhook Mercado Pago sem assinatura válida.');
    }
    const expected = createHmac('sha256', this.webhookSecret).update(manifest).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(parsed.v1, 'hex');
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new ForbiddenException('Webhook Mercado Pago com assinatura inválida.');
    }
  }

  private get accessToken(): string {
    return this.config.get<string>('mercadoPago.accessToken')?.trim() ?? '';
  }

  private get webhookSecret(): string {
    return this.config.get<string>('mercadoPago.webhookSecret')?.trim() ?? '';
  }

  private get webhookUrl(): string {
    return this.config.get<string>('mercadoPago.webhookUrl')?.trim() ?? '';
  }

  private get environment(): string {
    return this.config.get<string>('mercadoPago.environment') ?? 'sandbox';
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('mercadoPago.baseUrl') ?? 'https://api.mercadopago.com'
    ).replace(/\/+$/, '');
  }

  private nameParts(name?: string): Record<string, string> {
    const clean = String(name ?? '').trim();
    if (!clean) return {};
    const [firstName, ...rest] = clean.split(/\s+/);
    return {
      first_name: firstName,
      last_name: rest.join(' '),
    };
  }

  private parseSignature(value?: string): { ts?: string; v1?: string } {
    return String(value ?? '')
      .split(',')
      .map((part) => part.trim().split('='))
      .reduce<{ ts?: string; v1?: string }>((acc, [key, val]) => {
        if (key === 'ts') acc.ts = val;
        if (key === 'v1') acc.v1 = val;
        return acc;
      }, {});
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: Record<string, unknown>;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    if (!this.accessToken)
      throw new BadRequestException('MERCADO_PAGO_ACCESS_TOKEN não configurado.');
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
    };
    if (options.idempotencyKey) headers['X-Idempotency-Key'] = options.idempotencyKey;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
    });
    const json = await this.parseResponse(res);
    if (!res.ok) this.raiseMercadoPagoError(path, res.status, json as MercadoPagoApiError);
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

  private raiseMercadoPagoError(path: string, status: number, body: MercadoPagoApiError): never {
    const details = body.cause
      ?.map((cause) => cause.description || cause.message || cause.code)
      .filter(Boolean)
      .join('; ');
    const message = details || body.message || body.error || `HTTP ${status}`;
    this.logger.warn(`Mercado Pago API falhou (${path}): ${message}`);
    throw new BadRequestException(`Mercado Pago ${status}: ${message}`);
  }

  private withoutEmpty(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (typeof value === 'object' && !Array.isArray(value))
          return Object.keys(value).length > 0;
        return true;
      }),
    );
  }
}
