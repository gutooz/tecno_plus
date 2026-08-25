import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

function makeUser(overrides: Record<string, unknown> = {}): any {
  return {
    _id: 'user-1',
    email: 'cliente@example.com',
    name: 'Cliente',
    role: 'seller',
    passwordHash: '',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeService() {
  const users = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };
  const jwt = {
    signAsync: jest.fn(async (payload: { sub: string; email: string; role: string }) =>
      payload.email === 'cliente@example.com' ? `${payload.role}-token` : 'token',
    ),
  };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'jwt.secret': 'access-secret',
        'jwt.refreshSecret': 'refresh-secret',
        'jwt.expiresIn': '15m',
        'jwt.refreshExpiresIn': '7d',
      };
      return values[key];
    }),
  };
  const mercadoPago = {
    createPixPayment: jest.fn().mockResolvedValue({
      id: 123,
      status: 'pending',
      transaction_amount: 20,
      external_reference: 'signup:cliente@example.com',
    }),
    getPayment: jest.fn(),
    pixFromPayment: jest.fn().mockReturnValue({
      encodedImage: 'base64-image',
      payload: 'pix-payload',
      ticketUrl: 'https://mercadopago.example/pay',
    }),
  };
  const service = new AuthService(users as any, jwt as any, config as any, mercadoPago as any);
  return { service, users, jwt, mercadoPago };
}

describe('AuthService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cria uma cobrança Pix Mercado Pago de R$ 20 no cadastro', async () => {
    const { service, users, jwt, mercadoPago } = makeService();
    users.findOne.mockResolvedValue(null);
    users.create.mockResolvedValue(makeUser({ signupPaymentId: '123' }));

    const response = await service.register(' Cliente@Example.com ', 'senha1234', 'Cliente');

    expect(users.findOne).toHaveBeenCalledWith({ email: 'cliente@example.com' });
    expect(mercadoPago.createPixPayment).toHaveBeenCalledWith({
      transactionAmount: 20,
      description: 'Cadastro zycron',
      payerEmail: 'cliente@example.com',
      payerName: 'Cliente',
      externalReference: 'signup:cliente@example.com',
      idempotencyKey: 'signup:cliente@example.com',
    });
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'cliente@example.com',
        name: 'Cliente',
        role: 'seller',
        signupPaymentStatus: 'pending',
        signupPaymentId: '123',
        signupPaymentAmount: 20,
        signupPaymentExternalReference: 'signup:cliente@example.com',
      }),
    );
    expect(response).toEqual({
      paymentRequired: true,
      amount: 20,
      status: 'pending',
      paymentId: '123',
      pix: {
        encodedImage: 'base64-image',
        payload: 'pix-payload',
        ticketUrl: 'https://mercadopago.example/pay',
      },
    });
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('bloqueia login enquanto o pagamento do cadastro estiver pendente', async () => {
    const { service, users, mercadoPago } = makeService();
    const passwordHash = await bcrypt.hash('senha1234', 10);
    users.findOne.mockResolvedValue(
      makeUser({ passwordHash, signupPaymentStatus: 'pending', signupPaymentId: '123' }),
    );
    mercadoPago.getPayment.mockResolvedValue({ id: 123, status: 'pending' });

    await expect(service.login('cliente@example.com', 'senha1234')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('libera login quando o pagamento do Mercado Pago estiver aprovado', async () => {
    const { service, users, mercadoPago } = makeService();
    const passwordHash = await bcrypt.hash('senha1234', 10);
    const user = makeUser({ passwordHash, signupPaymentStatus: 'pending', signupPaymentId: '123' });
    users.findOne.mockResolvedValue(user);
    mercadoPago.getPayment.mockResolvedValue({ id: 123, status: 'approved' });

    const response = await service.login('cliente@example.com', 'senha1234');

    expect(user.signupPaymentStatus).toBe('approved');
    expect(user.save).toHaveBeenCalled();
    expect(response).toMatchObject({
      accessToken: 'seller-token',
      refreshToken: 'seller-token',
      user: { email: 'cliente@example.com', role: 'seller' },
    });
  });

  it('confirma o pagamento do cadastro e retorna sessão', async () => {
    const { service, users, mercadoPago } = makeService();
    const passwordHash = await bcrypt.hash('senha1234', 10);
    const user = makeUser({ passwordHash, signupPaymentStatus: 'pending', signupPaymentId: '123' });
    users.findOne.mockResolvedValue(user);
    mercadoPago.getPayment.mockResolvedValue({ id: 123, status: 'approved' });

    const response = await service.confirmRegistrationPayment(
      'cliente@example.com',
      'senha1234',
      '123',
    );

    expect(user.signupPaymentStatus).toBe('approved');
    expect(response).toMatchObject({
      paymentRequired: false,
      accessToken: 'seller-token',
      refreshToken: 'seller-token',
    });
  });

  it('nao libera sessao de pagamento sem a senha do cadastro', async () => {
    const { service, users, mercadoPago } = makeService();
    const passwordHash = await bcrypt.hash('senha1234', 10);
    const user = makeUser({ passwordHash, signupPaymentStatus: 'pending', signupPaymentId: '123' });
    users.findOne.mockResolvedValue(user);

    await expect(
      service.confirmRegistrationPayment('cliente@example.com', 'senha-errada', '123'),
    ).rejects.toThrow(UnauthorizedException);
    expect(mercadoPago.getPayment).not.toHaveBeenCalled();
  });
});
