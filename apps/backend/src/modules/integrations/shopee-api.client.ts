import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface ShopeeTokenResult {
  accessToken: string;
  refreshToken: string;
  expireIn: number; // segundos
  shopId: string;
}

export interface ShopeeCategoryApiItem {
  category_id: number;
  parent_category_id?: number;
  category_name?: string;
  display_category_name?: string;
  original_category_name?: string;
  has_children?: boolean;
}

export interface ShopeeStoreProduct {
  itemId: string;
  itemName: string;
  sku?: string;
  status: string;
  categoryId?: number;
  categoryName?: string;
  imageUrl?: string;
  price?: number;
  stock?: number;
  weight?: number;
  description?: string;
  createTime?: number;
  updateTime?: number;
}

export interface ShopeeStoreProductPatch {
  itemName?: string;
  description?: string;
  price?: number;
  stock?: number;
  weight?: number;
}

type ShopeeApiResponse = Record<string, unknown> & { error?: string; message?: string };

/**
 * Cliente de baixo nível da Shopee Open Platform API v2 — assinatura HMAC-SHA256
 * (esquema oficial: partner_id + path + timestamp [+ access_token + shop_id]),
 * troca/renovação de token OAuth e chamadas de negócio assinadas.
 *
 * Este é o caminho de integração REAL (API), diferente de
 * `modules/products/shopee/` que só gera a planilha de importação em massa.
 */
@Injectable()
export class ShopeeApiClient {
  private readonly logger = new Logger(ShopeeApiClient.name);

  constructor(private readonly config: ConfigService) {}

  private get partnerId(): string {
    return this.config.get<string>('shopee.partnerId') ?? '';
  }
  private get partnerKey(): string {
    return this.config.get<string>('shopee.partnerKey') ?? '';
  }
  private get host(): string {
    return this.config.get<string>('shopee.host') ?? 'https://partner.shopeemobile.com';
  }
  private get authHost(): string {
    return this.config.get<string>('shopee.authHost') ?? this.host;
  }
  get redirectUrl(): string {
    return this.config.get<string>('shopee.redirectUrl') ?? '';
  }
  get webhookUrl(): string {
    return this.config.get<string>('shopee.webhookUrl') ?? '';
  }
  get environment(): string {
    return this.config.get<string>('shopee.environment') ?? 'production';
  }
  get region(): string {
    return this.config.get<string>('shopee.region') ?? 'BR';
  }

  /** Sem partner_id/partner_key não há como assinar nada — a UI usa isso pra ocultar o botão de conectar. */
  get configured(): boolean {
    return Boolean(this.partnerId && this.partnerKey && this.redirectUrl);
  }

  publicConfig() {
    return {
      configured: this.configured,
      environment: this.environment,
      region: this.region,
      host: this.host,
      authHost: this.authHost,
      redirectUrl: this.redirectUrl,
      webhookUrl: this.webhookUrl,
      missing: [
        !this.partnerId && 'SHOPEE_PARTNER_ID',
        !this.partnerKey && 'SHOPEE_PARTNER_KEY',
        !this.redirectUrl && 'SHOPEE_REDIRECT_URL',
      ].filter(Boolean),
    };
  }

  private sign(path: string, timestamp: number, extra = ''): string {
    const base = `${this.partnerId}${path}${timestamp}${extra}`;
    return createHmac('sha256', this.partnerKey).update(base).digest('hex');
  }

  /** URL de autorização — o navegador do lojista é redirecionado pra cá (login Shopee + aceite). */
  buildAuthorizationUrl(state: string): string {
    const path = '/api/v2/shop/auth_partner';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.sign(path, timestamp);
    const params = new URLSearchParams({
      partner_id: this.partnerId,
      timestamp: String(timestamp),
      sign,
      redirect: `${this.redirectUrl}?state=${encodeURIComponent(state)}`,
    });
    return `${this.authHost}${path}?${params.toString()}`;
  }

  /** Troca o `code` do redirect por access_token/refresh_token (1ª autorização). */
  async exchangeCodeForToken(code: string, shopId: string): Promise<ShopeeTokenResult> {
    const path = '/api/v2/auth/token/get';
    const json = await this.publicCall(path, {
      code,
      shop_id: Number(shopId),
      partner_id: Number(this.partnerId),
    });
    return this.toTokenResult(json, shopId);
  }

  /** Renova o access_token (dura ~4h) usando o refresh_token (dura ~30 dias). */
  async refreshAccessToken(refreshToken: string, shopId: string): Promise<ShopeeTokenResult> {
    const path = '/api/v2/auth/access_token/get';
    const json = await this.publicCall(path, {
      refresh_token: refreshToken,
      shop_id: Number(shopId),
      partner_id: Number(this.partnerId),
    });
    return this.toTokenResult(json, shopId);
  }

  private toTokenResult(json: ShopeeApiResponse, fallbackShopId: string): ShopeeTokenResult {
    return {
      accessToken: String(json.access_token),
      refreshToken: String(json.refresh_token),
      expireIn: Number(json.expire_in ?? 14400),
      shopId: String(json.shop_id ?? fallbackShopId),
    };
  }

  /** Endpoints de auth (sem access_token/shop_id na assinatura). */
  private async publicCall(
    path: string,
    body: Record<string, unknown>,
  ): Promise<ShopeeApiResponse> {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.sign(path, timestamp);
    const params = new URLSearchParams({
      partner_id: this.partnerId,
      timestamp: String(timestamp),
      sign,
    });
    return this.send(`${this.host}${path}?${params.toString()}`, 'POST', body);
  }

  /** Chamada assinada genérica p/ endpoints de negócio (loja, produto, pedido). */
  async request<T extends ShopeeApiResponse = ShopeeApiResponse>(
    path: string,
    accessToken: string,
    shopId: string,
    options: { method?: 'GET' | 'POST'; body?: object; query?: Record<string, string> } = {},
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.sign(path, timestamp, `${accessToken}${shopId}`);
    const params = new URLSearchParams({
      partner_id: this.partnerId,
      timestamp: String(timestamp),
      sign,
      shop_id: shopId,
      access_token: accessToken,
      ...(options.query ?? {}),
    });
    const method = options.method ?? 'POST';
    return this.send(
      `${this.host}${path}?${params.toString()}`,
      method,
      options.body,
    ) as Promise<T>;
  }

  /** Dados básicos da loja conectada — usado ao conectar (pega o nome) e no botão "Testar conexão". */
  async getShopInfo(
    accessToken: string,
    shopId: string,
  ): Promise<{ shop_name?: string; status?: string }> {
    return this.request('/api/v2/shop/get_shop_info', accessToken, shopId, { method: 'GET' });
  }

  /**
   * Pedidos recentes da loja (janela de 15 dias, limite da própria API por
   * chamada). Prova viva e útil de integração: mostra dado real do lojista,
   * não só um "conectado com sucesso".
   */
  async getRecentOrders(accessToken: string, shopId: string, days = 15): Promise<unknown[]> {
    const timeTo = Math.floor(Date.now() / 1000);
    const timeFrom = timeTo - Math.min(days, 15) * 24 * 60 * 60;
    const json = await this.request<{
      response?: { order_list?: Array<{ order_sn: string }> };
    }>('/api/v2/order/get_order_list', accessToken, shopId, {
      method: 'GET',
      query: {
        time_range_field: 'create_time',
        time_from: String(timeFrom),
        time_to: String(timeTo),
        page_size: '20',
      },
    });
    return json.response?.order_list ?? [];
  }

  /**
   * Canais logísticos habilitados para a loja — variam por conta, por isso
   * são sempre consultados ao vivo (nunca hardcoded) antes de montar o
   * `logistic_info` de um `product.add_item`.
   */
  async getEnabledLogisticIds(accessToken: string, shopId: string): Promise<number[]> {
    const json = await this.request<{
      response?: {
        logistics_channel_list?: Array<{ logistics_channel_id: number; enabled: boolean }>;
      };
    }>('/api/v2/logistics/get_channel_list', accessToken, shopId, { method: 'GET' });
    return (json.response?.logistics_channel_list ?? [])
      .filter((c) => c.enabled)
      .map((c) => c.logistics_channel_id);
  }

  /** Árvore oficial de categorias disponível para a loja. Usada antes de publicar via API. */
  async getCategories(accessToken: string, shopId: string): Promise<ShopeeCategoryApiItem[]> {
    const json = await this.request<{
      response?: { category_list?: ShopeeCategoryApiItem[] };
    }>('/api/v2/product/get_category', accessToken, shopId, {
      method: 'GET',
      query: { language: 'pt-br' },
    });
    return json.response?.category_list ?? [];
  }

  async getStoreProducts(
    accessToken: string,
    shopId: string,
    options: { offset?: number; pageSize?: number; status?: string } = {},
  ): Promise<{ items: ShopeeStoreProduct[]; total: number; hasNextPage: boolean }> {
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    const status = options.status || 'NORMAL';
    const list = await this.request<{
      response?: {
        item?: Array<{ item_id?: number; item_status?: string; update_time?: number }>;
        item_list?: Array<{ item_id?: number; item_status?: string; update_time?: number }>;
        total_count?: number;
        has_next_page?: boolean;
      };
    }>('/api/v2/product/get_item_list', accessToken, shopId, {
      method: 'GET',
      query: {
        offset: String(options.offset ?? 0),
        page_size: String(pageSize),
        item_status: status,
      },
    });

    const summaries = list.response?.item ?? list.response?.item_list ?? [];
    const itemIds = summaries
      .map((item) => item.item_id)
      .filter((itemId): itemId is number => Number.isFinite(itemId));
    const details = itemIds.length
      ? await this.getStoreProductBaseInfo(accessToken, shopId, itemIds)
      : [];
    const byId = new Map(details.map((item) => [item.itemId, item]));
    const items = itemIds.map((itemId) => {
      const detail = byId.get(String(itemId));
      const summary = summaries.find((item) => item.item_id === itemId);
      return {
        itemId: String(itemId),
        itemName: detail?.itemName ?? `Produto ${itemId}`,
        sku: detail?.sku,
        status: detail?.status ?? summary?.item_status ?? status,
        categoryId: detail?.categoryId,
        categoryName: detail?.categoryName,
        imageUrl: detail?.imageUrl,
        price: detail?.price,
        stock: detail?.stock,
        weight: detail?.weight,
        description: detail?.description,
        createTime: detail?.createTime,
        updateTime: detail?.updateTime ?? summary?.update_time,
      };
    });

    return {
      items,
      total: Number(list.response?.total_count ?? items.length),
      hasNextPage: Boolean(list.response?.has_next_page),
    };
  }

  async getStoreProductBaseInfo(
    accessToken: string,
    shopId: string,
    itemIds: number[],
  ): Promise<ShopeeStoreProduct[]> {
    const ids = itemIds.slice(0, 50).filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) return [];

    const json = await this.request<{
      response?: { item_list?: Array<Record<string, unknown>> };
    }>('/api/v2/product/get_item_base_info', accessToken, shopId, {
      method: 'GET',
      query: { item_id_list: ids.join(',') },
    });

    return (json.response?.item_list ?? []).map((item) => this.normalizeStoreProduct(item));
  }

  /**
   * `update_item` só aceita nome/descrição/peso — preço e estoque não têm
   * efeito nesse endpoint na Shopee Open API v2, precisam de `update_price`
   * e `update_stock` dedicados (cada um assinado e chamado separadamente).
   */
  async updateStoreProduct(
    accessToken: string,
    shopId: string,
    itemId: string,
    patch: ShopeeStoreProductPatch,
  ) {
    const numericItemId = Number(itemId);

    if (
      patch.itemName !== undefined ||
      patch.description !== undefined ||
      patch.weight !== undefined
    ) {
      const body: Record<string, unknown> = { item_id: numericItemId };
      if (patch.itemName !== undefined) body.item_name = patch.itemName.slice(0, 120);
      if (patch.description !== undefined) body.description = patch.description.slice(0, 5000);
      if (patch.weight !== undefined) body.weight = patch.weight;
      await this.request('/api/v2/product/update_item', accessToken, shopId, { body });
    }

    if (patch.price !== undefined) {
      await this.request('/api/v2/product/update_price', accessToken, shopId, {
        body: {
          item_id: numericItemId,
          price_list: [{ model_id: 0, original_price: patch.price }],
        },
      });
    }

    if (patch.stock !== undefined) {
      await this.request('/api/v2/product/update_stock', accessToken, shopId, {
        body: {
          item_id: numericItemId,
          stock_list: [{ model_id: 0, seller_stock: [{ stock: patch.stock }] }],
        },
      });
    }
  }

  async setStoreProductListed(
    accessToken: string,
    shopId: string,
    itemId: string,
    listed: boolean,
  ) {
    return this.request('/api/v2/product/unlist_item', accessToken, shopId, {
      body: { item_list: [{ item_id: Number(itemId), unlist: !listed }] },
    });
  }

  async deleteStoreProduct(accessToken: string, shopId: string, itemId: string) {
    return this.request('/api/v2/product/delete_item', accessToken, shopId, {
      body: { item_id: Number(itemId) },
    });
  }

  /**
   * Sobe uma imagem (buffer) para o Media Space da Shopee. Só imagens lá têm
   * `image_id` — o Add/Update Item da API não aceita URL direta como a
   * planilha de importação em massa aceita.
   */
  async uploadImage(
    accessToken: string,
    shopId: string,
    imageBuffer: Buffer,
    filename: string,
  ): Promise<string> {
    const path = '/api/v2/media_space/upload_image';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.sign(path, timestamp, `${accessToken}${shopId}`);
    const params = new URLSearchParams({
      partner_id: this.partnerId,
      timestamp: String(timestamp),
      sign,
      shop_id: shopId,
      access_token: accessToken,
    });
    const form = new FormData();
    form.append('image', new Blob([imageBuffer]), filename);
    const res = await fetch(`${this.host}${path}?${params.toString()}`, {
      method: 'POST',
      body: form,
    });
    const json = (await res.json()) as ShopeeApiResponse & {
      response?: { image_info?: { image_id?: string } };
    };
    this.assertOk(path, res.ok, res.status, json);
    const imageId = json.response?.image_info?.image_id;
    if (!imageId) throw new Error(`Shopee media_space/upload_image: resposta sem image_id`);
    return imageId;
  }

  private async send(url: string, method: 'GET' | 'POST', body?: object) {
    const res = await fetch(url, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
    const json = (await res.json()) as ShopeeApiResponse;
    this.assertOk(url, res.ok, res.status, json);
    return json;
  }

  private assertOk(pathOrUrl: string, ok: boolean, status: number, json: ShopeeApiResponse) {
    if (ok && !json.error) return;
    const message = json.message || json.error || `HTTP ${status}`;
    this.logger.warn(`Shopee API falhou (${pathOrUrl}): ${message}`);
    throw new Error(`Shopee API: ${message}`);
  }

  private normalizeStoreProduct(item: Record<string, unknown>): ShopeeStoreProduct {
    const image = this.objectValue(item.image);
    const imageUrls = this.arrayValue<string>(image?.image_url_list);
    const sellerStock = this.arrayValue<Record<string, unknown>>(item.seller_stock);
    const stockInfo = this.objectValue(item.stock_info_v2);
    const sellerStockV2 = this.arrayValue<Record<string, unknown>>(stockInfo?.seller_stock);
    const priceInfo = this.arrayValue<Record<string, unknown>>(item.price_info);
    const price = this.numberValue(
      priceInfo[0]?.current_price ?? priceInfo[0]?.original_price ?? item.original_price,
    );

    return {
      itemId: String(item.item_id ?? ''),
      itemName: String(item.item_name ?? ''),
      sku: item.item_sku ? String(item.item_sku) : undefined,
      status: String(item.item_status ?? 'NORMAL'),
      categoryId: this.numberValue(item.category_id),
      categoryName: item.category_name ? String(item.category_name) : undefined,
      imageUrl: imageUrls[0],
      price,
      stock:
        this.numberValue(sellerStockV2[0]?.stock) ??
        this.numberValue(sellerStock[0]?.stock) ??
        undefined,
      weight: this.numberValue(item.weight),
      description: item.description ? String(item.description) : undefined,
      createTime: this.numberValue(item.create_time),
      updateTime: this.numberValue(item.update_time),
    };
  }

  private objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private arrayValue<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private numberValue(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
}
