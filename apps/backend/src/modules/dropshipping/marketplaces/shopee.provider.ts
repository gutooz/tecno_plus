import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MarketplaceProvider,
  MarketplacePublicationDraft,
  MarketplacePublicationResult,
} from './marketplace-provider';

@Injectable()
export class ShopeeProvider implements MarketplaceProvider {
  readonly channel = 'shopee';

  async validatePublication(draft: MarketplacePublicationDraft): Promise<string[]> {
    const errors: string[] = [];
    if (!draft.title?.trim()) errors.push('Título obrigatório.');
    if (!draft.description?.trim()) errors.push('Descrição obrigatória.');
    if (!draft.categoryId?.trim()) errors.push('Categoria Shopee obrigatória.');
    if (!draft.images?.length) errors.push('Ao menos uma imagem é obrigatória.');
    if (!draft.price || draft.price <= 0) errors.push('Preço final precisa ser maior que zero.');
    if (draft.stock == null || draft.stock < 0) errors.push('Estoque não pode ser negativo.');
    return errors;
  }

  async publishProduct(draft: MarketplacePublicationDraft): Promise<MarketplacePublicationResult> {
    const errors = await this.validatePublication(draft);
    if (errors.length) throw new BadRequestException(errors.join(' '));

    throw new BadRequestException(
      'Publicação direta na Shopee está preparada na fila, mas depende da confirmação final dos payloads e permissões no app Shopee Open Platform.',
    );
  }
}
