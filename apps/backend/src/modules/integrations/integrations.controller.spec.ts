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
});
