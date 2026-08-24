import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasApiClient } from './asaas.client';

const config = new ConfigService({
  asaas: {
    apiKey: '$aact_hmlg_test',
    baseUrl: 'https://api-sandbox.asaas.com/v3',
    environment: 'sandbox',
  },
});

function makeClient() {
  return new AsaasApiClient(config);
}

describe('AsaasApiClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('envia access_token e User-Agent no header oficial do Asaas', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'cus_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await makeClient().createCustomer({
      name: 'Cliente Teste',
      cpfCnpj: '123.456.789-09',
      externalReference: 'user-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-sandbox.asaas.com/v3/customers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          access_token: '$aact_hmlg_test',
          'User-Agent': 'zycron/0.1.0 (Node.js; sandbox)',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      cpfCnpj: '12345678909',
    });
  });

  it('nao envia body em GET de QR Code Pix', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ payload: 'pix-copia-e-cola' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await makeClient().getPaymentPixQrCode('pay_123');

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', body: undefined });
  });

  it('remove campos de parcelamento quando cria cobranca avulsa', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'pay_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await makeClient().createPayment({
      customer: 'cus_123',
      billingType: 'PIX',
      value: 99.9,
      dueDate: '2026-08-25',
      installmentCount: undefined,
      installmentValue: undefined,
      totalValue: undefined,
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      customer: 'cus_123',
      billingType: 'PIX',
      value: 99.9,
      dueDate: '2026-08-25',
    });
  });

  it('rejeita parcelamento sem exatamente uma forma de valor', async () => {
    await expect(
      makeClient().createPayment({
        customer: 'cus_123',
        billingType: 'PIX',
        value: 99.9,
        dueDate: '2026-08-25',
        installmentCount: 3,
        installmentValue: 33.3,
        totalValue: 99.9,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
