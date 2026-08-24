import { WhatsAppService } from './whatsapp.service';

function makeService() {
  return new WhatsAppService(
    { get: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('WhatsAppService', () => {
  it('nao considera estados negativos como conectado', () => {
    const service = makeService() as unknown as {
      looksConnected(value: unknown): boolean;
    };

    expect(service.looksConnected({ status: 'disconnected' })).toBe(false);
    expect(service.looksConnected({ message: 'not connected' })).toBe(false);
    expect(service.looksConnected({ isLogged: false })).toBe(false);
    expect(service.looksConnected({ status: 'qrcode', message: 'Waiting for QRCode Scan' })).toBe(
      false,
    );
  });

  it('reconhece estados positivos como conectado', () => {
    const service = makeService() as unknown as {
      looksConnected(value: unknown): boolean;
    };

    expect(service.looksConnected({ status: 'connected' })).toBe(true);
    expect(service.looksConnected({ isLogged: true })).toBe(true);
    expect(service.looksConnected({ state: 'inChat' })).toBe(true);
  });
});
