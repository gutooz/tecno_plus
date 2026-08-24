import { ConfigService } from '@nestjs/config';
import { WppConnectClient } from './wppconnect.client';

const config = new ConfigService({
  whatsapp: {
    baseUrl: 'http://wppconnect:21465',
    session: 'tecnoplus',
    secretKey: 'secret-key',
    token: '',
    webhookUrl: 'https://zycron.online/api/whatsapp/webhook',
  },
});

function makeClient() {
  return new WppConnectClient(config);
}

describe('WppConnectClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('usa close-session como fallback quando logout-session falha', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'generated-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'req.client.logout is not a function' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'closed' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    global.fetch = fetchMock;

    await expect(makeClient().logoutSession()).resolves.toEqual({ status: 'closed' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://wppconnect:21465/api/tecnoplus/logout-session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://wppconnect:21465/api/tecnoplus/close-session',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
