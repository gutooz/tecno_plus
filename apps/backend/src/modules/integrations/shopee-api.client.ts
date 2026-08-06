import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface ShopeeTokenResult {
  accessToken: string;
  refreshToken: string;
  expireIn: number; // segundos
  shopId: string;
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
    return `${this.host}${path}?${params.toString()}`;
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
}
