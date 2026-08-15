import type { Product } from '@tecnoplus/shared';

export interface ShopeeAddItemPayload {
  category_id: number;
  item_name: string;
  description: string;
  item_sku: string;
  weight: number;
  dimension: { package_length: number; package_width: number; package_height: number };
  original_price: number;
  seller_stock: Array<{ stock: number }>;
  logistic_info: Array<{ logistic_id: number; enabled: boolean }>;
  image: { image_id_list: string[] };
  condition: 'NEW';
  brand: { brand_id: number; original_brand_name: string };
}

/** Peso/estoque padrão quando o produto não trouxe o dado (modelo dropshipping — sem contagem física). */
const DEFAULT_WEIGHT_KG = 0.3;
const DEFAULT_STOCK = 50;
const DEFAULT_DIMENSION_CM = { package_length: 20, package_width: 15, package_height: 10 };

/**
 * Traduz o produto do catálogo para o corpo do `product.add_item` /
 * `product.update_item` da Shopee Open Platform API. Diferente do mapper de
 * `modules/products/shopee/` (que gera colunas de planilha), aqui o alvo é o
 * JSON da API — por isso o mapeamento é próprio, não reaproveitado.
 *
 * `category_id` é obrigatório pela API (ao contrário da planilha, que aceita
 * ficar em branco pra Shopee sugerir depois) — por isso lançamos se ausente,
 * em vez de inventar um valor.
 */
export function mapProductToShopeeItem(product: Product, imageIds: string[]): ShopeeAddItemPayload {
  const categoryId = Number(product.vision.shopeeCategoryId);
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    throw new Error(
      'Produto sem "shopeeCategoryId" (ID numérico da árvore de categorias Shopee). ' +
        'Defina-o no cadastro do produto antes de publicar via API.',
    );
  }
  if (!imageIds.length) {
    throw new Error('Produto sem imagens enviadas ao Media Space da Shopee.');
  }

  const title = product.content?.title || product.vision.name || product.internalSku;
  const description =
    product.content?.marketplaceDescription ||
    product.content?.longDescription ||
    product.content?.description ||
    title;
  const price = product.pricing?.suggestedPrice ?? product.vision.labelPrice;
  if (!price || price <= 0)
    throw new Error('Produto sem preço calculado — rode o Pricing Agent antes.');

  const weight = product.vision.weight ?? DEFAULT_WEIGHT_KG;
  const { length, width, height } = product.vision;
  const dimension =
    length && width && height
      ? { package_length: length, package_width: width, package_height: height }
      : DEFAULT_DIMENSION_CM;
  const brand = product.vision.brand?.trim() || 'NoBrand';

  return {
    category_id: categoryId,
    item_name: title.slice(0, 120),
    description: description.slice(0, 5000),
    item_sku: product.internalSku,
    weight,
    dimension,
    original_price: price,
    seller_stock: [{ stock: product.vision.quantity ?? DEFAULT_STOCK }],
    logistic_info: [],
    image: { image_id_list: imageIds.slice(0, 9) },
    condition: 'NEW',
    brand: { brand_id: 0, original_brand_name: brand },
  };
}
