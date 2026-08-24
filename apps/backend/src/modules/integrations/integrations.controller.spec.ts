import { BadRequestException } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';

function makeController() {
  return new IntegrationsController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    cleanShopeeProductPatch(body: Record<string, unknown>): Record<string, unknown>;
    shopeeProductStatuses(status?: string | null): string[];
  };
}

describe('IntegrationsController Shopee product patch parsing', () => {
  it('aceita numeros em formato brasileiro no CRUD da Shopee', () => {
    const controller = makeController();

    expect(
      controller.cleanShopeeProductPatch({
        itemName: ' Garrafa ',
        description: ' Produto teste ',
        price: '49,99',
        stock: '1',
        weight: '0,1',
      }),
    ).toEqual({
      itemName: 'Garrafa',
      description: 'Produto teste',
      price: 49.99,
      stock: 1,
      weight: 0.1,
    });
  });

  it('rejeita preco invalido em vez de enviar null para a Shopee', () => {
    const controller = makeController();

    expect(() => controller.cleanShopeeProductPatch({ price: null })).toThrow(BadRequestException);
  });

  it('usa todos os status oficiais quando o filtro Shopee vem vazio', () => {
    const controller = makeController();

    expect(controller.shopeeProductStatuses()).toEqual([
      'NORMAL',
      'UNLIST',
      'REVIEWING',
      'BANNED',
      'SELLER_DELETE',
      'SHOPEE_DELETE',
    ]);
  });

  it('aceita filtro Shopee com um ou mais status explicitos', () => {
    const controller = makeController();

    expect(controller.shopeeProductStatuses('normal,reviewing')).toEqual(['NORMAL', 'REVIEWING']);
  });
});

describe('IntegrationsController Shopee product listing', () => {
  it('agrega produtos de todos os status por padrao', async () => {
    const statuses: string[] = [];
    const shopeeClient = {
      getStoreProducts: jest.fn(async (_accessToken, _shopId, options) => {
        statuses.push(options.status);
        return {
          items: [
            {
              itemId: `${options.status}-1`,
              itemName: `Produto ${options.status}`,
              status: options.status,
              updateTime: options.status === 'NORMAL' ? 2 : 1,
            },
          ],
          total: 1,
          hasNextPage: false,
        };
      }),
    };
    const connections = {
      getValidAccessToken: jest.fn(async () => ({ accessToken: 'access', shopId: '123' })),
      recordSync: jest.fn(async () => undefined),
    };
    const controller = new IntegrationsController(
      shopeeClient as never,
      connections as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.shopeeProducts(
      { id: 'seller-1', role: 'seller' } as never,
      '1',
      '20',
    );

    expect(statuses).toEqual([
      'NORMAL',
      'UNLIST',
      'REVIEWING',
      'BANNED',
      'SELLER_DELETE',
      'SHOPEE_DELETE',
    ]);
    expect(result.status).toBe('ALL');
    expect(result.total).toBe(6);
    expect(result.items).toHaveLength(6);
  });
});
