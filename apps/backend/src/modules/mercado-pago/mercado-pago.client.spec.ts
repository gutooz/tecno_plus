import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { MercadoPagoApiClient } from './mercado-pago.client';

const config = new ConfigService({
  mercadoPago: {
    accessToken: 'APP_USR-test-token',
    baseUrl: 'https://api.mercadopago.com',
    environment: 'sandbox',
    webhookUrl: 'https://zycron.online/api/dropshipping/mercado-pago/webhook',
    webhookSecret: 'webhook-secret',
  },
});

function makeClient() {
  return new MercadoPagoApiClient(config);
}

describe('MercadoPagoApiClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('cria pagamento Pix com bearer token e idempotencia obrigatoria', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 123, status: 'pending' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await makeClient().createPixPayment({
      transactionAmount: 6,
      description: 'Cobrança teste',
      payerEmail: 'cliente@example.com',
      payerName: 'Cliente Teste',
      payerDocumentType: 'CPF',
      payerDocumentNumber: '123.456.789-09',
      externalReference: 'settings-test',
      idempotencyKey: 'fixed-key',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer APP_USR-test-token',
          'X-Idempotency-Key': 'fixed-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      transaction_amount: 6,
      payment_method_id: 'pix',
      notification_url: 'https://zycron.online/api/dropshipping/mercado-pago/webhook',
      payer: {
        email: 'cliente@example.com',
        first_name: 'Cliente',
        last_name: 'Teste',
        identification: { type: 'CPF', number: '12345678909' },
      },
    });
  });

  it('nao envia body em consulta de pagamento', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 123, status: 'approved' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await makeClient().getPayment(123);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', body: undefined });
  });

  it('rejeita valor invalido antes de chamar a API', async () => {
    await expect(
      makeClient().createPixPayment({
        transactionAmount: 0,
        description: 'Teste',
        payerEmail: 'cliente@example.com',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('valida assinatura HMAC do webhook', () => {
    const dataId = '123';
    const xRequestId = 'request-1';
    const ts = '1742505638683';
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const v1 = createHmac('sha256', 'webhook-secret').update(manifest).digest('hex');

    expect(() =>
      makeClient().verifyWebhookSignature({
        dataId,
        xRequestId,
        xSignature: `ts=${ts},v1=${v1}`,
      }),
    ).not.toThrow();
  });

  it('rejeita assinatura HMAC invalida do webhook', () => {
    expect(() =>
      makeClient().verifyWebhookSignature({
        dataId: '123',
        xRequestId: 'request-1',
        xSignature: 'ts=1742505638683,v1=00',
      }),
    ).toThrow(ForbiddenException);
  });
});
