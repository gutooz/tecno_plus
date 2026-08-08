import type { Product } from '@tecnoplus/shared';
import { collectImages } from '../products/shopee/shopee-mapper';

export interface MercadoLivreItemPayload {
  title: string;
  category_id: string;
  price: number;
  currency_id: 'BRL';
  available_quantity: number;
  buying_mode: 'buy_it_now';
  listing_type_id: string;
  condition: 'new';
  pictures: Array<{ source: string }>;
}

/** Estoque padrão quando o produto não trouxe o dado (modelo dropshipping — sem contagem física). */
const DEFAULT_STOCK = 50;

/**
 * Traduz o produto do catálogo para o corpo do `POST /items` /
 * `PUT /items/:id` da API oficial do Mercado Livre. Mesmo princípio do
 * mapper da Shopee: só preenche o que existe nos dados, nunca inventa valor
 * para "passar" na validação — `category_id` e `listing_type_id` são
 * obrigatórios e variam por conta/categoria, por isso lançam se ausentes.
 */
export function mapProductToMercadoLivreItem(product: Product): {
  item: MercadoLivreItemPayload;
  description: string;
} {
  const categoryId = String(product.vision.mercadoLivreCategoryId ?? '').trim();
  if (!categoryId) {
    throw new Error(
      'Produto sem "mercadoLivreCategoryId" (ID da categoria do Mercado Livre, ex.: MLB1051). ' +
        'Defina-o no cadastro do produto antes de publicar via API.',
    );
  }
  const listingTypeId = String(product.vision.mercadoLivreListingTypeId ?? '').trim();
  if (!listingTypeId) {
    throw new Error(
      'Produto sem "mercadoLivreListingTypeId" (tipo de anúncio, ex.: gold_special). ' +
        'Defina-o no cadastro do produto antes de publicar via API.',
    );
  }

  const pictures = collectImages(product.images as unknown as Record<string, unknown>).map(
    (source) => ({ source }),
  );
  if (!pictures.length) {
    throw new Error('Produto sem imagens tratadas para publicar.');
  }

  const title = String(product.content?.title || product.vision.name || product.internalSku);
  const description = String(
    product.content?.marketplaceDescription ||
      product.content?.longDescription ||
      product.content?.description ||
      title,
  ).slice(0, 50000);

  const price = product.pricing?.suggestedPrice ?? product.vision.labelPrice;
  if (!price || price <= 0) {
    throw new Error('Produto sem preço calculado — rode o Pricing Agent antes.');
  }

  return {
    item: {
      title: title.slice(0, 60),
      category_id: categoryId,
      price,
      currency_id: 'BRL',
      available_quantity: product.vision.quantity ?? DEFAULT_STOCK,
      buying_mode: 'buy_it_now',
      listing_type_id: listingTypeId,
      condition: 'new',
      pictures,
    },
    description,
  };
}
