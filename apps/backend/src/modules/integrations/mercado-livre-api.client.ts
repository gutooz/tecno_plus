import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';

export interface MercadoLivreTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // segundos (~21600 = 6h)
  mlUserId: string;
  scope: string;
}

type MlApiResponse = Record<string, unknown> & { error?: string; message?: string };

/**
 * Cliente da API oficial do Mercado Livre — OAuth 2.0 (Authorization Code +
 * PKCE) e chamadas de negócio autenticadas por Bearer token.
 * Docs: https://developers.mercadolivre.com.br
 *
 * Diferente da Shopee (assinatura HMAC própria), o Mercado Livre segue OAuth2
 * "de livro": `/oauth/token` em form-urlencoded, e o resto da API com
 * `Authorization: Bearer <access_token>` simples.
 */
@Injectable()
export class MercadoLivreApiClient {
  private readonly logger = new Logger(MercadoLivreApiClient.name);

  constructor(private readonly config: ConfigService) {}

  private get clientId(): string {
    return this.config.get<string>('mercadoLivre.clientId') ?? '';
  }
  private get clientSecret(): string {
    return this.config.get<string>('mercadoLivre.clientSecret') ?? '';
  }
  private get authHost(): string {
    return this.config.get<string>('mercadoLivre.authHost') ?? 'https://auth.mercadolivre.com.br';
  }
  private get apiHost(): string {
    return this.config.get<string>('mercadoLivre.apiHost') ?? 'https://api.mercadolibre.com';
  }
  get redirectUrl(): string {
    return this.config.get<string>('mercadoLivre.redirectUrl') ?? '';
  }

  /** Sem client_id/client_secret/redirect não há como iniciar o OAuth — a UI usa isso pra ocultar o botão de conectar. */
  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUrl);
  }

  publicConfig() {
    return {
      configured: this.configured,
      authHost: this.authHost,
      apiHost: this.apiHost,
      redirectUrl: this.redirectUrl,
      missing: [
        !this.clientId && 'MERCADO_LIVRE_CLIENT_ID',
        !this.clientSecret && 'MERCADO_LIVRE_CLIENT_SECRET',
        !this.redirectUrl && 'MERCADO_LIVRE_REDIRECT_URI',
      ].filter(Boolean),
    };
  }

  /** Par PKCE (S256) — o verifier fica salvo junto do `state` até o callback trocar o `code`. */
  generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /** URL de autorização — o navegador do vendedor é redirecionado pra cá (login ML + aceite). */
  buildAuthorizationUrl(state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUrl,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${this.authHost}/authorization?${params.toString()}`;
  }

  /** Troca o `code` do redirect por access_token/refresh_token (1ª autorização). */
  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<MercadoLivreTokenResult> {
    const json = await this.sendTokenRequest({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUrl,
      code_verifier: codeVerifier,
    });
    return this.toTokenResult(json);
  }

  /** Renova o access_token (~6h) usando o refresh_token. O ML invalida o refresh_token antigo ao emitir um novo. */
  async refreshAccessToken(refreshToken: string): Promise<MercadoLivreTokenResult> {
    const json = await this.sendTokenRequest({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });
    return this.toTokenResult(json);
  }

  private toTokenResult(json: MlApiResponse): MercadoLivreTokenResult {
    return {
      accessToken: String(json.access_token),
      refreshToken: String(json.refresh_token),
      expiresIn: Number(json.expires_in ?? 21600),
      mlUserId: String(json.user_id ?? ''),
      scope: String(json.scope ?? ''),
    };
  }

  /** Dados básicos da conta conectada — usado ao conectar (pega o nickname) e no botão "Testar conexão". */
  async getUserInfo(accessToken: string): Promise<{ id?: number; nickname?: string }> {
    return this.request('/users/me', accessToken, { method: 'GET' });
  }

  /**
   * Categoria: existência + status (`enabled`) antes de publicar. A API
   * exige `category_id` no `POST /items` — nunca inventamos um valor, quem
   * cadastra o produto informa (ver `mercadoLivreCategoryId` no vision).
   */
  async getCategory(
    categoryId: string,
    accessToken: string,
  ): Promise<{
    id: string;
    name: string;
    settings?: { listing_allowed?: boolean; status?: string };
  }> {
    return this.request(`/categories/${categoryId}`, accessToken, { method: 'GET' });
  }

  async createItem<T extends MlApiResponse = MlApiResponse>(
    body: object,
    accessToken: string,
  ): Promise<T> {
    return this.request('/items', accessToken, { method: 'POST', body }) as Promise<T>;
  }

  async updateItem<T extends MlApiResponse = MlApiResponse>(
    itemId: string,
    body: object,
    accessToken: string,
  ): Promise<T> {
    return this.request(`/items/${itemId}`, accessToken, { method: 'PUT', body }) as Promise<T>;
  }

  /**
   * Descrição do anúncio: endpoint próprio, separado do `POST /items`. Cria
   * na primeira publicação (POST) e atualiza nas seguintes (PUT) — chamar o
   * verbo errado retorna erro do ML.
   */
  async setItemDescription(
    itemId: string,
    plainText: string,
    accessToken: string,
    method: 'POST' | 'PUT' = 'POST',
  ): Promise<void> {
    await this.request(`/items/${itemId}/description`, accessToken, {
      method,
      body: { plain_text: plainText },
    });
  }

  /** Chamada autenticada genérica p/ endpoints de negócio (usuário, categoria, item). */
  private async request<T extends MlApiResponse = MlApiResponse>(
    path: string,
    accessToken: string,
    options: { method: 'GET' | 'POST' | 'PUT'; body?: object } = { method: 'GET' },
  ): Promise<T> {
    const res = await fetch(`${this.apiHost}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const json = (await res.json()) as T;
    this.assertOk(path, res.ok, res.status, json);
    return json;
  }

  /** `/oauth/token` só aceita `application/x-www-form-urlencoded` (não JSON). */
  private async sendTokenRequest(body: Record<string, string>): Promise<MlApiResponse> {
    const res = await fetch(`${this.apiHost}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
    });
    const json = (await res.json()) as MlApiResponse;
    this.assertOk('/oauth/token', res.ok, res.status, json);
    return json;
  }

  private assertOk(pathOrUrl: string, ok: boolean, status: number, json: MlApiResponse) {
    if (ok && !json.error) return;
    const message = json.message || json.error || `HTTP ${status}`;
    this.logger.warn(`Mercado Livre API falhou (${pathOrUrl}): ${message}`);
    throw new Error(`Mercado Livre API: ${message}`);
  }
}
