import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { ProductStatus } from '@tecnoplus/shared';
import type { AuthUser } from '../auth/jwt.strategy';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import {
  MercadoLivreConnection,
  MercadoLivreConnectionDocument,
} from '../database/schemas/ml-connection.schema';
import {
  ShopeeConnection,
  ShopeeConnectionDocument,
} from '../database/schemas/shopee-connection.schema';
import { IntegrationLog, IntegrationLogDocument } from '../database/schemas/dropshipping.schema';
import { WppConnectClient } from './wppconnect.client';

interface BlastBody {
  phones?: string[] | string;
  productIds?: string[];
  intro?: string;
  includePrice?: boolean;
}

interface ProductMessageItem {
  id: string;
  title: string;
  price?: number;
  link: string;
}

function productIdValues(id: string): unknown[] {
  return Types.ObjectId.isValid(id) ? [new Types.ObjectId(id), id] : [id];
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly wpp: WppConnectClient,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(ShopeeConnection.name)
    private readonly shopeeConnections: Model<ShopeeConnectionDocument>,
    @InjectModel(MercadoLivreConnection.name)
    private readonly mlConnections: Model<MercadoLivreConnectionDocument>,
    @InjectModel(IntegrationLog.name)
    private readonly integrationLogs: Model<IntegrationLogDocument>,
  ) {}

  async status(user: AuthUser) {
    this.requireAdmin(user);
    const config = this.wpp.publicConfig();
    if (!config.configured) return { config, connected: false, status: null, connection: null };

    const [connection, status] = await Promise.allSettled([
      this.wpp.checkConnection(),
      this.wpp.statusSession(),
    ]);

    return {
      config,
      connected: this.looksConnected(connection.status === 'fulfilled' ? connection.value : null),
      connection: connection.status === 'fulfilled' ? connection.value : null,
      status: status.status === 'fulfilled' ? status.value : null,
      error:
        connection.status === 'rejected'
          ? connection.reason instanceof Error
            ? connection.reason.message
            : String(connection.reason)
          : null,
    };
  }

  async start(user: AuthUser) {
    this.requireAdmin(user);
    const started = await this.wpp.startSession();
    const qr = await this.safeQrCode();
    return { started, qrCode: this.extractQrCode(started) || this.extractQrCode(qr), rawQr: qr };
  }

  async qrCode(user: AuthUser) {
    this.requireAdmin(user);
    const qr = await this.wpp.qrCode();
    return { qrCode: this.extractQrCode(qr), raw: qr };
  }

  async logout(user: AuthUser) {
    this.requireAdmin(user);
    return this.wpp.logoutSession();
  }

  async listProducts(user: AuthUser, q: { search?: string; page?: number; limit?: number }) {
    this.requireAdmin(user);
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(50, Math.max(1, q.limit ?? 12));
    const filter: FilterQuery<ProductDocument> = {
      status: { $ne: ProductStatus.UPLOADED },
    };
    if (q.search?.trim()) filter.$text = { $search: q.search.trim() };

    const [docs, total, shopee, ml] = await Promise.all([
      this.products
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.products.countDocuments(filter),
      this.shopeeConnections.find({ status: 'connected' }).lean(),
      this.mlConnections.find({}).lean(),
    ]);

    return {
      items: docs.map((doc) => this.toProductOption(doc, shopee, ml)),
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  async preview(user: AuthUser, body: BlastBody) {
    this.requireAdmin(user);
    const phones = this.parsePhones(body.phones);
    const products = await this.productsForMessage(body.productIds);
    const items = await this.messageItems(products);
    return {
      phones,
      products: items,
      message: this.composeMessage(items, body.intro, body.includePrice !== false),
    };
  }

  async sendProducts(user: AuthUser, body: BlastBody) {
    this.requireAdmin(user);
    const phones = this.parsePhones(body.phones);
    const products = await this.productsForMessage(body.productIds);
    const items = await this.messageItems(products);
    const message = this.composeMessage(items, body.intro, body.includePrice !== false);

    const results: Array<{ phone: string; ok: boolean; error?: string }> = [];
    for (const phone of phones) {
      try {
        await this.wpp.sendMessage(phone, message);
        results.push({ phone, ok: true });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Falha ao enviar WhatsApp para ${phone}: ${text}`);
        results.push({ phone, ok: false, error: text });
      }
    }

    await this.integrationLogs.create({
      marketplace: 'whatsapp',
      ownerUserId: user.id,
      action: 'product-blast',
      level: results.some((r) => !r.ok) ? 'warning' : 'info',
      message: 'Disparo de produtos via WPPConnect.',
      context: {
        phones: phones.length,
        products: items.map((item) => item.id),
        sent: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
    });

    return {
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      message,
    };
  }

  async webhook(body: Record<string, unknown>, secret?: string) {
    const expected = this.config.get<string>('whatsapp.webhookSecret') ?? '';
    if (expected && secret !== expected) throw new UnauthorizedException('Webhook não autorizado.');

    await this.integrationLogs.create({
      marketplace: 'whatsapp',
      ownerUserId: 'platform',
      action: String(body.event || body.type || body.status || 'webhook'),
      level: 'info',
      message: 'Evento recebido do WPPConnect.',
      context: { payloadKeys: Object.keys(body) },
    });
    return { ok: true };
  }

  private requireAdmin(user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Apenas administradores.');
  }

  private parsePhones(input: BlastBody['phones']): string[] {
    const max = this.config.get<number>('whatsapp.maxPhonesPerBlast') ?? 50;
    const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\s,;]+/);
    const phones = [
      ...new Set(
        raw
          .map((phone) => this.normalizePhone(phone))
          .filter((phone): phone is string => Boolean(phone)),
      ),
    ];
    if (!phones.length) throw new BadRequestException('Informe ao menos um telefone.');
    if (phones.length > max) throw new BadRequestException(`Limite de ${max} telefones por envio.`);
    return phones;
  }

  private normalizePhone(input: unknown): string | null {
    const digits = String(input ?? '').replace(/\D/g, '');
    if (!digits) return null;
    const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
    if (withCountry.length < 12 || withCountry.length > 13) {
      throw new BadRequestException(`Telefone inválido: ${String(input)}`);
    }
    return withCountry;
  }

  private async productsForMessage(ids?: string[]) {
    const max = this.config.get<number>('whatsapp.maxProductsPerBlast') ?? 10;
    const uniqueIds = [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) throw new BadRequestException('Selecione ao menos um produto.');
    if (uniqueIds.length > max)
      throw new BadRequestException(`Limite de ${max} produtos por envio.`);

    const docs = await this.products
      .find({ _id: { $in: uniqueIds.flatMap(productIdValues) } } as never)
      .lean();
    if (docs.length !== uniqueIds.length) {
      throw new BadRequestException('Um ou mais produtos selecionados não foram encontrados.');
    }
    return docs;
  }

  private async messageItems(
    products: Array<Record<string, unknown>>,
  ): Promise<ProductMessageItem[]> {
    const [shopee, ml] = await Promise.all([
      this.shopeeConnections.find({ status: 'connected' }).lean(),
      this.mlConnections.find({}).lean(),
    ]);
    return products.map((product) => this.toMessageItem(product, shopee, ml));
  }

  private composeMessage(items: ProductMessageItem[], intro?: string, includePrice = true): string {
    const header = intro?.trim() || 'Olá! Separei estes produtos para você:';
    const lines = items.map((item, index) => {
      const price =
        includePrice && item.price != null
          ? ` - ${new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(item.price)}`
          : '';
      return `${index + 1}. ${item.title}${price}\n${item.link}`;
    });
    return [header, '', ...lines, '', 'Me chama aqui que eu te ajudo com o pedido.'].join('\n');
  }

  private toProductOption(
    product: Record<string, unknown>,
    shopee: Array<Record<string, unknown>>,
    ml: Array<Record<string, unknown>>,
  ) {
    const item = this.toMessageItem(product, shopee, ml);
    const images = (product.images ?? {}) as Record<string, unknown>;
    return {
      ...item,
      sku: String(product.internalSku ?? ''),
      thumbnail: String(images.thumbnail || images.webp || images.square || images.original || ''),
      status: String(product.status ?? ''),
    };
  }

  private toMessageItem(
    product: Record<string, unknown>,
    shopee: Array<Record<string, unknown>>,
    ml: Array<Record<string, unknown>>,
  ): ProductMessageItem {
    const vision = (product.vision ?? {}) as Record<string, unknown>;
    const content = (product.content ?? {}) as Record<string, unknown>;
    const pricing = (product.pricing ?? {}) as Record<string, unknown>;
    const id = String(product._id);
    return {
      id,
      title: String(content.title || vision.name || product.internalSku || 'Produto'),
      price: this.numberValue(pricing.suggestedPrice ?? pricing.salePrice),
      link: this.productLink(product, shopee, ml),
    };
  }

  private productLink(
    product: Record<string, unknown>,
    shopee: Array<Record<string, unknown>>,
    ml: Array<Record<string, unknown>>,
  ): string {
    const externalIds = (product.externalIds ?? {}) as Record<string, unknown>;
    const ownerId = String(product.ownerId ?? '');
    const shopeeItemId = String(externalIds.shopee || '');
    const shopeeShopId = String(
      shopee.find((connection) => String(connection.ownerId) === ownerId)?.shopId ||
        shopee[0]?.shopId ||
        '',
    );
    if (shopeeItemId && shopeeShopId) {
      return `https://shopee.com.br/product/${shopeeShopId}/${shopeeItemId}`;
    }

    const mlItemId = String(externalIds.mercado_livre || externalIds.mercadoLivre || '');
    const mlUserId = String(
      ml.find((connection) => String(connection.ownerId) === ownerId)?.mlUserId ||
        ml[0]?.mlUserId ||
        '',
    );
    if (mlItemId) return `https://produto.mercadolivre.com.br/${mlItemId}`;
    if (mlUserId) void mlUserId;

    const base = (this.config.get<string>('whatsapp.productLinkBaseUrl') ?? '').replace(/\/+$/, '');
    return `${base}/products/${String(product._id)}`;
  }

  private looksConnected(value: unknown): boolean {
    const flags = this.connectionFlags(value);
    if (flags.some((flag) => flag.connected === false)) return false;
    if (flags.some((flag) => flag.connected === true)) return true;

    const text = JSON.stringify(value ?? '').toLowerCase();
    if (
      /\b(disconnected|disconnect|not[_\s-]*connected|not[_\s-]*logged|unlogged|unpaired|closed|browserclose|autoclose|failed|timeout|qrcode|qr)\b/.test(
        text,
      )
    ) {
      return false;
    }
    return /\b(connected|inchat|authenticated|islogged|open)\b/.test(text);
  }

  private connectionFlags(value: unknown): Array<{ connected: boolean }> {
    if (!value || typeof value !== 'object') return [];
    const flags: Array<{ connected: boolean }> = [];
    const visit = (item: unknown) => {
      if (!item || typeof item !== 'object') return;
      for (const [rawKey, rawValue] of Object.entries(item as Record<string, unknown>)) {
        const key = rawKey.toLowerCase();
        if (
          typeof rawValue === 'boolean' &&
          ['connected', 'isconnected', 'islogged', 'logged', 'online'].includes(key)
        ) {
          flags.push({ connected: rawValue });
        }
        if (rawValue && typeof rawValue === 'object') visit(rawValue);
      }
    };
    visit(value);
    return flags;
  }

  private async safeQrCode(): Promise<unknown> {
    try {
      return await this.wpp.qrCode();
    } catch {
      return null;
    }
  }

  private extractQrCode(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const candidates = [
      data.qrcode,
      data.qrCode,
      data.base64Qr,
      data.base64,
      (data.response as Record<string, unknown> | undefined)?.qrcode,
      (data.response as Record<string, unknown> | undefined)?.base64,
    ];
    const qr = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
    return typeof qr === 'string' ? qr : null;
  }

  private numberValue(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
}
