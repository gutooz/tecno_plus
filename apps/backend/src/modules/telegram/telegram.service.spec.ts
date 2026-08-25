import { TelegramService } from './telegram.service';

function makeUsersModel(options: { configuredExists?: boolean; adminId?: string }) {
  const findOneChain = {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(options.adminId ? { _id: options.adminId } : null),
  };

  return {
    exists: jest.fn().mockResolvedValue(options.configuredExists ? { _id: 'configured' } : null),
    findOne: jest.fn().mockReturnValue(findOneChain),
    findOneChain,
  };
}

function makeService(ownerId: string | undefined, users: ReturnType<typeof makeUsersModel>) {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'telegram.botToken') return '';
      if (key === 'telegram.allowedChatIds') return [];
      if (key === 'telegram.ownerId') return ownerId;
      return undefined;
    }),
  };

  return new TelegramService(
    config as never,
    {} as never,
    {} as never,
    {} as never,
    users as never,
  ) as unknown as {
    resolveOwnerId: () => Promise<string>;
  };
}

describe('TelegramService.resolveOwnerId', () => {
  it('usa o owner configurado quando ele existe no banco', async () => {
    const ownerId = '507f1f77bcf86cd799439011';
    const users = makeUsersModel({ configuredExists: true, adminId: '507f1f77bcf86cd799439012' });
    const service = makeService(ownerId, users);

    await expect(service.resolveOwnerId()).resolves.toBe(ownerId);

    expect(users.exists).toHaveBeenCalledWith({ _id: ownerId });
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('usa o primeiro admin quando o owner configurado foi removido', async () => {
    const staleOwnerId = '507f1f77bcf86cd799439011';
    const adminId = '507f1f77bcf86cd799439012';
    const users = makeUsersModel({ configuredExists: false, adminId });
    const service = makeService(staleOwnerId, users);

    await expect(service.resolveOwnerId()).resolves.toBe(adminId);

    expect(users.exists).toHaveBeenCalledWith({ _id: staleOwnerId });
    expect(users.findOne).toHaveBeenCalledWith({ role: 'admin' });
    expect(users.findOneChain.sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(users.findOneChain.select).toHaveBeenCalledWith('_id');
  });
});
