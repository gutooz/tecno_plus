import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface WppTokenResponse {
  token?: string;
  full?: string;
}

type WppPayload = Record<string, unknown> | undefined;

@Injectable()
export class WppConnectClient {
  private readonly logger = new Logger(WppConnectClient.name);
  private cachedToken = '';

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.baseUrl && this.session && (this.token || this.secretKey));
  }

  publicConfig() {
    return {
      configured: this.configured,
      baseUrl: this.baseUrl,
      session: this.session,
      webhookUrl: this.webhookUrl,
      missing: [
        !this.baseUrl && 'WPPCONNECT_BASE_URL',
        !this.session && 'WPPCONNECT_SESSION',
        !this.token && !this.secretKey && 'WPPCONNECT_TOKEN ou WPPCONNECT_SECRET_KEY',
      ].filter(Boolean),
    };
  }

  async startSession() {
    return this.request('POST', '/start-session', {
      webhook: this.webhookUrl,
      waitQrCode: false,
    });
  }

  async qrCode() {
    return this.request('GET', '/qrcode-session');
  }

  async checkConnection() {
    return this.request('GET', '/check-connection-session');
  }

  async statusSession() {
    return this.request('GET', '/status-session');
  }

  async logoutSession() {
    try {
      return await this.request('POST', '/logout-session', undefined, false);
    } catch (error) {
      this.logger.warn(
        `WPPConnect logout-session falhou; tentando close-session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.request('POST', '/close-session', undefined, false);
    } finally {
      this.cachedToken = '';
    }
  }

  async checkNumberStatus(phone: string) {
    return this.request('GET', `/check-number-status/${encodeURIComponent(phone)}`);
  }

  async sendMessage(phone: string, message: string) {
    return this.request('POST', '/send-message', { phone, isGroup: false, message });
  }

  async sendLinkPreview(phone: string, url: string, caption: string) {
    return this.request('POST', '/send-link-preview', { phone, isGroup: false, url, caption });
  }

  private get baseUrl(): string {
    return (this.config.get<string>('whatsapp.baseUrl') ?? '').replace(/\/+$/, '');
  }

  private get session(): string {
    return this.config.get<string>('whatsapp.session') ?? '';
  }

  private get secretKey(): string {
    return this.config.get<string>('whatsapp.secretKey') ?? '';
  }

  private get token(): string {
    return this.config.get<string>('whatsapp.token') ?? '';
  }

  private get webhookUrl(): string {
    return this.config.get<string>('whatsapp.webhookUrl') ?? '';
  }

  private async bearerToken(): Promise<string> {
    if (this.token) return this.token;
    if (this.cachedToken) return this.cachedToken;
    if (!this.secretKey) throw new BadGatewayException('WPPConnect sem secret/token configurado.');

    const url = `${this.baseUrl}/api/${encodeURIComponent(this.session)}/${encodeURIComponent(
      this.secretKey,
    )}/generate-token`;
    const json = (await this.fetchJson(url, 'POST')) as WppTokenResponse;
    const generated = String(json.token || json.full || '');
    if (!generated) throw new BadGatewayException('WPPConnect não retornou token.');
    this.cachedToken = generated.replace(/^Bearer\s+/i, '').replace(/^wppconnect:/i, '');
    return this.cachedToken;
  }

  private async request(method: 'GET' | 'POST', path: string, body?: WppPayload, retry = true) {
    if (!this.configured) {
      throw new BadGatewayException(
        'WPPConnect não configurado. Defina WPPCONNECT_BASE_URL, WPPCONNECT_SESSION e token/secret.',
      );
    }

    const token = await this.bearerToken();
    const url = `${this.baseUrl}/api/${encodeURIComponent(this.session)}${path}`;
    try {
      return await this.fetchJson(url, method, token, body);
    } catch (error) {
      if (!retry) throw error;
      this.cachedToken = '';
      await new Promise((resolve) => setTimeout(resolve, 700));
      const nextToken = await this.bearerToken();
      return this.fetchJson(url, method, nextToken, body);
    }
  }

  private async fetchJson(
    url: string,
    method: 'GET' | 'POST',
    token?: string,
    body?: WppPayload,
  ): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (method === 'POST') headers['content-type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });

    const text = await res.text();
    let json: unknown = text;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const message = this.errorMessage(json, res.status);
      this.logger.warn(`WPPConnect ${method} ${url} falhou: ${message}`);
      throw new BadGatewayException(`WPPConnect: ${message}`);
    }

    return json;
  }

  private errorMessage(json: unknown, status: number): string {
    if (json && typeof json === 'object') {
      const data = json as Record<string, unknown>;
      return String(data.message || data.error || data.status || `HTTP ${status}`);
    }
    return `HTTP ${status}`;
  }
}
