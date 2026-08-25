import { MarketplaceChannel } from '@tecnoplus/shared';
import { SocialApprovalService } from './social.service';

function makeProduct() {
  return {
    _id: 'product-1',
    internalSku: 'SKU-1',
    socialApproval: null,
    vision: { name: 'Produto Teste' },
    content: { title: 'Produto Teste', description: 'Descrição' },
    pricing: { suggestedPrice: 19.9 },
    images: { original: 'https://cdn.test/product.jpg' },
    toObject: jest.fn().mockReturnValue({
      _id: 'product-1',
      internalSku: 'SKU-1',
      vision: { name: 'Produto Teste' },
    }),
  };
}

describe('SocialApprovalService', () => {
  it('publica posts sociais somente no Facebook', async () => {
    const product = makeProduct();
    const products = {
      findById: jest.fn().mockResolvedValue(product),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const publisher = {
      publish: jest.fn().mockResolvedValue({ ok: true }),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'telegram.allowedChatIds') return ['123'];
        if (key === 'telegram.ownerId') return 'owner-1';
        return undefined;
      }),
    };
    const service = new SocialApprovalService(
      config as never,
      products as never,
      publisher as never,
    );

    await service.createManualPost('product-1', 'immediate');

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'product-1' }),
      MarketplaceChannel.FACEBOOK,
    );
  });
});
