import { TelegramApi } from './telegram-api';

describe('TelegramApi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws when Telegram rejects sendMessage', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ ok: false, description: 'chat not found' }),
    } as Response);

    const api = new TelegramApi('token');

    await expect(api.sendMessage('123', 'teste')).rejects.toThrow('sendMessage: chat not found');
  });

  it('resolves when Telegram accepts sendMessage', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    } as Response);

    const api = new TelegramApi('token');

    await expect(api.sendMessage('123', 'teste')).resolves.toBeUndefined();
  });
});
