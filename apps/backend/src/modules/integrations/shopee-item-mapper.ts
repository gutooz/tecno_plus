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

const TITLE_MIN = 2;
const TITLE_MAX = 120;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;
const PRICE_MIN = 1;
const PRICE_MAX = 100000;
const STOCK_MAX = 10000000;
const MEASURE_MAX = 10000000;

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

  const title = (product.content?.title || product.vision.name || product.internalSku).trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    throw new Error(`Título Shopee deve ter entre ${TITLE_MIN} e ${TITLE_MAX} caracteres.`);
  }

  const description =
    product.content?.marketplaceDescription ||
    product.content?.longDescription ||
    product.content?.description ||
    title;
  const trimmedDescription = description.trim();
  if (trimmedDescription.length < DESCRIPTION_MIN || trimmedDescription.length > DESCRIPTION_MAX) {
    throw new Error(
      `Descrição Shopee deve ter entre ${DESCRIPTION_MIN} e ${DESCRIPTION_MAX} caracteres.`,
    );
  }

  const rawPrice = product.pricing?.suggestedPrice ?? product.vision.labelPrice;
  if (
    typeof rawPrice !== 'number' ||
    !Number.isFinite(rawPrice) ||
    rawPrice < PRICE_MIN ||
    rawPrice > PRICE_MAX
  ) {
    throw new Error(`Preço Shopee deve ficar entre R$ ${PRICE_MIN} e R$ ${PRICE_MAX}.`);
  }
  const price = rawPrice;

  const weight = requirePositiveMeasure(product.vision.weight, 'Peso com embalagem');
  const length = requirePositiveMeasure(product.vision.length, 'Comprimento da embalagem');
  const width = requirePositiveMeasure(product.vision.width, 'Largura da embalagem');
  const height = requirePositiveMeasure(product.vision.height, 'Altura da embalagem');
  const stock = requireStock(product.vision.quantity);
  const brand = product.vision.brand?.trim() || 'NoBrand';

  return {
    category_id: categoryId,
    item_name: title,
    description: trimmedDescription,
    item_sku: product.internalSku,
    weight,
    dimension: { package_length: length, package_width: width, package_height: height },
    original_price: price,
    seller_stock: [{ stock }],
    logistic_info: [],
    image: { image_id_list: imageIds.slice(0, 9) },
    condition: 'NEW',
    brand: { brand_id: 0, original_brand_name: brand },
  };
}

function requirePositiveMeasure(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MEASURE_MAX) {
    throw new Error(`${label} é obrigatório para cadastrar na Shopee.`);
  }
  return value;
}

function requireStock(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > STOCK_MAX
  ) {
    throw new Error('Estoque inteiro é obrigatório para cadastrar na Shopee.');
  }
  return value;
}
