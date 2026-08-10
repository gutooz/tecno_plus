import { BadRequestException, Injectable } from '@nestjs/common';
import { ShopeeApiClient } from '../../integrations/shopee-api.client';
import { ShopeeConnectionsService } from '../../integrations/shopee-connections.service';
import {
  MarketplaceProvider,
  MarketplacePublicationDraft,
  MarketplacePublicationResult,
} from './marketplace-provider';

@Injectable()
export class ShopeeProvider implements MarketplaceProvider {
  readonly channel = 'shopee';

  constructor(
    private readonly client: ShopeeApiClient,
    private readonly connections: ShopeeConnectionsService,
  ) {}

  async validatePublication(draft: MarketplacePublicationDraft): Promise<string[]> {
    const errors: string[] = [];
    if (!draft.title?.trim()) errors.push('Titulo obrigatorio.');
    if (!draft.description?.trim()) errors.push('Descricao obrigatoria.');
    if (!Number.isFinite(Number(draft.categoryId)) || Number(draft.categoryId) <= 0) {
      errors.push('Categoria Shopee precisa ser o ID numerico da arvore de categorias.');
    }
    if (!draft.images?.length) errors.push('Ao menos uma imagem e obrigatoria.');
    if (!draft.price || draft.price <= 0) errors.push('Preco final precisa ser maior que zero.');
    if (draft.stock == null || draft.stock < 0) errors.push('Estoque nao pode ser negativo.');
    if (draft.weight != null && draft.weight <= 0) errors.push('Peso precisa ser maior que zero.');
    return errors;
  }

  async publishProduct(draft: MarketplacePublicationDraft): Promise<MarketplacePublicationResult> {
    const errors = await this.validatePublication(draft);
    if (errors.length) throw new BadRequestException(errors.join(' '));

    const auth = await this.connections.getValidAccessToken(draft.sellerUserId);
    if (!auth) {
      throw new BadRequestException('Conecte a loja Shopee em Integracoes antes de publicar.');
    }

    const imageIds = await this.uploadImages(auth.accessToken, auth.shopId, draft);
    if (!imageIds.length) {
      throw new BadRequestException('Nenhuma imagem do anuncio conseguiu subir para a Shopee.');
    }

    const logisticInfo = (
      await this.client.getEnabledLogisticIds(auth.accessToken, auth.shopId)
    ).map((logistic_id) => ({ logistic_id, enabled: true }));

    if (!logisticInfo.length) {
      throw new BadRequestException(
        'Habilite ao menos um canal logistico no Seller Center da Shopee.',
      );
    }

    const dimension = this.dimensionPayload(draft);
    const body = {
      category_id: Number(draft.categoryId),
      item_name: draft.title.slice(0, 120),
      description: draft.description.slice(0, 5000),
      item_sku: (draft.sellerSku || draft.listingId).slice(0, 100),
      weight: draft.weight ?? 0.3,
      ...(dimension ? { dimension } : {}),
      price_info: [{ original_price: draft.price }],
      normal_stock: draft.stock,
      logistic_info: logisticInfo,
      image: { image_id_list: imageIds.slice(0, 9) },
    };

    const json = await this.client.request<{ response?: { item_id?: number } }>(
      '/api/v2/product/add_item',
      auth.accessToken,
      auth.shopId,
      { body },
    );
    const externalItemId = json.response?.item_id ? String(json.response.item_id) : '';
    if (!externalItemId) throw new BadRequestException('Shopee nao retornou item_id.');

    return { externalItemId, externalStoreId: auth.shopId };
  }

  private async uploadImages(
    accessToken: string,
    shopId: string,
    draft: MarketplacePublicationDraft,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const [index, url] of draft.images.slice(0, 9).entries()) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      const extension = contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : 'jpg';
      const buffer = Buffer.from(await res.arrayBuffer());
      ids.push(
        await this.client.uploadImage(
          accessToken,
          shopId,
          buffer,
          `${draft.listingId}-${index + 1}.${extension}`,
        ),
      );
    }
    return ids;
  }

  private dimensionPayload(draft: MarketplacePublicationDraft) {
    const { length, width, height } = draft.dimensions ?? {};
    if (!length || !width || !height) return undefined;
    return { package_length: length, package_width: width, package_height: height };
  }
}
