import { ShopeeApiClient } from './shopee-api.client';

describe('ShopeeApiClient product details', () => {
  it('busca detalhes em blocos de 50 itens sem descartar produtos', async () => {
    const client = new ShopeeApiClient({ get: jest.fn(() => '') } as never);
    const request = jest.fn(async (_path: string, _access: string, _shop: string, options) => {
      const ids = String(options.query.item_id_list)
        .split(',')
        .map((id) => Number(id));
      return {
        response: {
          item_list: ids.map((id) => ({
            item_id: id,
            item_name: `Produto ${id}`,
            item_status: 'NORMAL',
          })),
        },
      };
    });
    (client as unknown as { request: typeof request }).request = request;

    const items = await client.getStoreProductBaseInfo(
      'access-token',
      'shop-1',
      Array.from({ length: 55 }, (_, index) => index + 1),
    );

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][3].query.item_id_list).toBe(
      Array.from({ length: 50 }, (_, index) => index + 1).join(','),
    );
    expect(request.mock.calls[1][3].query.item_id_list).toBe('51,52,53,54,55');
    expect(items).toHaveLength(55);
    expect(items[54]).toMatchObject({ itemId: '55', itemName: 'Produto 55' });
  });
});
