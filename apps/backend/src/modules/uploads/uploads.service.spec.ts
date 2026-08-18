import { ProductStatus } from '@tecnoplus/shared';
import { UploadsService } from './uploads.service';

function makeService(duplicate: unknown = null) {
  const savedDoc = {
    _id: 'product-1',
    internalSku: 'SKU-1',
    status: ProductStatus.PROCESSING,
    set: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const model = {
    findOne: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(duplicate),
    }),
    create: jest.fn().mockResolvedValue(savedDoc),
  };
  const storage = {
    upload: jest.fn().mockResolvedValue('https://cdn.test/original.jpg'),
  };
  const queue = {
    startPipeline: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UploadsService(model as never, storage as never, queue as never);
  return { service, model, storage, queue, savedDoc };
}

describe('UploadsService.ingestAutoProcessed', () => {
  const file = {
    buffer: Buffer.from('same image'),
    originalName: 'foto.jpg',
    mimeType: 'image/jpeg',
  };

  it('não cadastra de novo quando a mesma imagem já existe para o dono', async () => {
    const { service, model, storage, queue } = makeService({
      _id: 'existing-1',
      internalSku: 'SKU-OLD',
      vision: { name: 'Cabo USB-C' },
    });

    const result = await service.ingestAutoProcessed('owner-1', file, 'telegram');

    expect(result).toEqual({
      duplicate: true,
      existing: { id: 'existing-1', internalSku: 'SKU-OLD', name: 'Cabo USB-C' },
    });
    expect(model.create).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(queue.startPipeline).not.toHaveBeenCalled();
  });

  it('cria produto em processamento e dispara a IA para imagem nova', async () => {
    const { service, model, storage, queue, savedDoc } = makeService();

    const result = await service.ingestAutoProcessed('owner-1', file, 'telegram');

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        status: ProductStatus.PROCESSING,
        source: 'telegram',
        images: {},
        vision: {},
        imageHash: expect.any(String),
      }),
    );
    expect(savedDoc.set).toHaveBeenCalledWith('images', {
      original: 'https://cdn.test/original.jpg',
    });
    expect(savedDoc.save).toHaveBeenCalled();
    expect(queue.startPipeline).toHaveBeenCalledWith({
      productId: 'product-1',
      ownerId: 'owner-1',
    });
    expect(result).toEqual({
      duplicate: false,
      id: 'product-1',
      internalSku: 'SKU-1',
      status: ProductStatus.PROCESSING,
    });
    expect(storage.upload).toHaveBeenCalledWith(
      'products/product-1/original.jpeg',
      file.buffer,
      'image/jpeg',
    );
  });

  it('salva imagens de referência do álbum para a visão ler preço/etiqueta', async () => {
    const { service, storage, savedDoc } = makeService();
    const pricePhoto = {
      buffer: Buffer.from('price label'),
      originalName: 'preco.jpg',
      mimeType: 'image/jpeg',
    };

    await service.ingestAutoProcessedWithReferences('owner-1', file, [pricePhoto], 'telegram');

    expect(storage.upload).toHaveBeenNthCalledWith(
      1,
      'products/product-1/original.jpeg',
      file.buffer,
      'image/jpeg',
    );
    expect(storage.upload).toHaveBeenNthCalledWith(
      2,
      'products/product-1/reference-1.jpeg',
      pricePhoto.buffer,
      'image/jpeg',
    );
    expect(savedDoc.set).toHaveBeenCalledWith('images', {
      original: 'https://cdn.test/original.jpg',
      references: ['https://cdn.test/original.jpg'],
    });
  });
});
