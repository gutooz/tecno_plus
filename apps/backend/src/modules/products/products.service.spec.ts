import { ProductStatus } from '@tecnoplus/shared';
import { ProductsService } from './products.service';

describe('ProductsService.startPipeline', () => {
  it('marca o produto como processando antes de enfileirar a IA', async () => {
    const collection = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'product-1',
        ownerId: 'owner-1',
        status: ProductStatus.UPLOADED,
      }),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const queue = { startPipeline: jest.fn().mockResolvedValue(undefined) };
    const service = Object.assign(Object.create(ProductsService.prototype), {
      model: { collection },
      queue,
    }) as ProductsService;

    await service.startPipeline('owner-1', 'product-1');

    expect(collection.updateOne).toHaveBeenCalledWith(
      { ownerId: 'owner-1', _id: { $in: ['product-1'] } },
      { $set: { status: ProductStatus.PROCESSING } },
    );
    expect(queue.startPipeline).toHaveBeenCalledWith({
      productId: 'product-1',
      ownerId: 'owner-1',
    });
    expect(collection.updateOne.mock.invocationCallOrder[0]).toBeLessThan(
      queue.startPipeline.mock.invocationCallOrder[0],
    );
  });
});
