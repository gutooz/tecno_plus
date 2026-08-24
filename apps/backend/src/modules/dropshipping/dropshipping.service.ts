import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import type { AuthUser } from '../auth/jwt.strategy';
import { StorageService } from '../storage/storage.service';
import {
  AuditLog,
  AuditLogDocument,
  Address,
  AddressDocument,
  FinancialEntry,
  FinancialEntryDocument,
  IntegrationLog,
  IntegrationLogDocument,
  InventoryMovement,
  InventoryMovementDocument,
  MarketplaceOrder,
  MarketplaceOrderDocument,
  Notification,
  NotificationDocument,
  OrderDocumentFile,
  OrderDocumentFileDocument,
  Organization,
  OrganizationDocument,
  ProductListing,
  ProductListingDocument,
  ProductListingMapping,
  ProductListingMappingDocument,
  SellerProfile,
  SellerProfileDocument,
  SupplierOrder,
  SupplierOrderDocument,
  SupplierProduct,
  SupplierProductDocument,
  SupplierProfile,
  SupplierProfileDocument,
  SyncJob,
  SyncJobDocument,
} from '../database/schemas/dropshipping.schema';
import { User, UserDocument } from '../database/schemas/user.schema';
import { AsaasApiClient } from '../asaas/asaas.client';
import { MercadoPagoApiClient } from '../mercado-pago/mercado-pago.client';
import { ShopeeProvider } from './marketplaces/shopee.provider';

type AnyRecord = Record<string, unknown>;

interface PlatformFeeRule {
  upTo: number;
  fee: number;
}

const DEFAULT_PLATFORM_FEE_RULES: PlatformFeeRule[] = [
  { upTo: 50, fee: 5 },
  { upTo: 100, fee: 10 },
  { upTo: 200, fee: 20 },
];

function pageLimit(page?: number, limit?: number) {
  const safePage = Math.max(1, page ?? 1);
  const safeLimit = Math.min(100, Math.max(1, limit ?? 20));
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

function numberFrom(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function moneyAmount(value: unknown): number {
  return Math.round(numberFrom(value) * 100) / 100;
}

function dateOnly(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function localDateOnly(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayBounds(input?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input ?? ''));
  const start = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date();
  if (!match) start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { date: localDateOnly(start), start, end };
}

function objectFrom(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function hasAnyText(record: AnyRecord, keys: string[]): boolean {
  return keys.some((key) => hasText(record[key]));
}

function hasOriginAddress(record: AnyRecord): boolean {
  return (
    hasAnyText(record, ['cep', 'zip', 'postalCode']) &&
    hasAnyText(record, ['street', 'address', 'logradouro']) &&
    hasAnyText(record, ['city', 'cidade']) &&
    hasAnyText(record, ['state', 'uf'])
  );
}

function supplierStoreName(company: AnyRecord): string {
  return (
    firstText(company, ['storeName', 'fantasyName', 'companyName', 'legalName', 'name']) ||
    'Fornecedor'
  );
}

function supplierLogo(company: AnyRecord): string {
  return firstText(company, ['logoUrl', 'logo', 'brandLogo']);
}

const ORDER_DOCUMENT_TYPES = new Set([
  'invoice',
  'content_declaration',
  'shipping_label',
  'transport',
  'receipt',
  'other',
]);

function firstText(record: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function normalizeOrderDocument(input: AnyRecord, fallbackName: string) {
  const url = firstText(input, ['url', 'href', 'link', 'fileUrl', 'downloadUrl']);
  if (!url) return null;
  const rawType = firstText(input, ['type', 'kind', 'documentType']);
  const type = ORDER_DOCUMENT_TYPES.has(rawType) ? rawType : 'other';
  return {
    type,
    name: firstText(input, ['name', 'title', 'label']) || fallbackName,
    url,
    status: firstText(input, ['status']) || 'available',
  };
}

function orderDocumentsFromPayload(body: AnyRecord) {
  const docs: { type: string; name: string; url: string; status: string }[] = [];
  const rawDocs = [
    ...(Array.isArray(body.documents) ? (body.documents as AnyRecord[]) : []),
    ...(Array.isArray(body.orderDocuments) ? (body.orderDocuments as AnyRecord[]) : []),
  ];
  for (const doc of rawDocs) {
    const normalized = normalizeOrderDocument(doc, 'Documento da plataforma');
    if (normalized) docs.push(normalized);
  }

  const directFields = [
    { key: 'invoiceUrl', type: 'invoice', name: 'Nota fiscal da plataforma' },
    { key: 'fiscalNoteUrl', type: 'invoice', name: 'Nota fiscal da plataforma' },
    { key: 'nfeUrl', type: 'invoice', name: 'NF-e da plataforma' },
    { key: 'danfeUrl', type: 'invoice', name: 'DANFE da plataforma' },
    { key: 'platformInvoiceUrl', type: 'invoice', name: 'Nota da plataforma' },
    { key: 'shippingLabelUrl', type: 'shipping_label', name: 'Etiqueta da plataforma' },
    { key: 'declarationUrl', type: 'content_declaration', name: 'Declaração de conteúdo' },
  ];
  for (const field of directFields) {
    const url = firstText(body, [field.key]);
    if (url) docs.push({ type: field.type, name: field.name, url, status: 'available' });
  }

  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.url)) return false;
    seen.add(doc.url);
    return true;
  });
}

function marketplaceOrderDetails(order: AnyRecord | undefined) {
  const raw = objectFrom(order?.rawPayload);
  return {
    platformNote: firstText(raw, [
      'platformNote',
      'orderNote',
      'buyerNote',
      'sellerNote',
      'note',
      'remark',
      'message',
      'observations',
    ]),
    fiscalNumber: firstText(raw, [
      'invoiceNumber',
      'fiscalNoteNumber',
      'nfeNumber',
      'notaFiscal',
      'danfeNumber',
      'platformInvoiceNumber',
    ]),
  };
}

function marketplaceDashboardKey(marketplace: unknown): 'shopee' | 'mercadoLivre' | 'other' {
  const normalized = String(marketplace ?? '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (normalized === 'shopee') return 'shopee';
  if (['mercadolivre', 'mercadolibre', 'ml', 'meli'].includes(normalized)) return 'mercadoLivre';
  return 'other';
}

function marketplaceOrderSaleAmount(order: AnyRecord): number {
  const raw = objectFrom(order.rawPayload);
  const candidates = [
    raw.saleAmount,
    raw.totalAmount,
    raw.orderTotal,
    raw.total,
    raw.amount,
    raw.paidAmount,
  ];
  for (const candidate of candidates) {
    const amount = moneyAmount(candidate);
    if (amount > 0) return amount;
  }
  return 0;
}

function orderCreatedAt(order: AnyRecord): Date {
  const date = new Date(String(order.createdAt ?? ''));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dashboardItemName(item: AnyRecord): string {
  return (
    firstText(item, ['name', 'title', 'productName', 'itemName', 'variationName']) ||
    firstText(item, ['externalItemId', 'itemId']) ||
    'Produto sem nome'
  );
}

function dashboardItemImage(item: AnyRecord): string {
  return firstText(item, ['image', 'imageUrl', 'thumbnail', 'thumbnailUrl', 'pictureUrl']);
}

function dashboardItemQuantity(item: AnyRecord): number {
  return Math.max(1, numberFrom(item.quantity ?? item.qty ?? item.units, 1));
}

function dashboardItemAmount(item: AnyRecord): number {
  const total = moneyAmount(
    item.saleAmount ?? item.totalAmount ?? item.total ?? item.orderItemTotal ?? item.subtotal,
  );
  if (total > 0) return total;
  return moneyAmount(
    numberFrom(item.price ?? item.unitPrice ?? item.salePrice) * dashboardItemQuantity(item),
  );
}

@Injectable()
export class DropshippingService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Organization.name) private readonly organizations: Model<OrganizationDocument>,
    @InjectModel(SupplierProfile.name)
    private readonly supplierProfiles: Model<SupplierProfileDocument>,
    @InjectModel(SellerProfile.name) private readonly sellerProfiles: Model<SellerProfileDocument>,
    @InjectModel(Address.name) private readonly addresses: Model<AddressDocument>,
    @InjectModel(SupplierProduct.name)
    private readonly supplierProducts: Model<SupplierProductDocument>,
    @InjectModel(ProductListing.name) private readonly listings: Model<ProductListingDocument>,
    @InjectModel(ProductListingMapping.name)
    private readonly mappings: Model<ProductListingMappingDocument>,
    @InjectModel(MarketplaceOrder.name)
    private readonly marketplaceOrders: Model<MarketplaceOrderDocument>,
    @InjectModel(SupplierOrder.name) private readonly supplierOrders: Model<SupplierOrderDocument>,
    @InjectModel(OrderDocumentFile.name)
    private readonly orderDocuments: Model<OrderDocumentFileDocument>,
    @InjectModel(InventoryMovement.name)
    private readonly inventoryMovements: Model<InventoryMovementDocument>,
    @InjectModel(SyncJob.name) private readonly syncJobs: Model<SyncJobDocument>,
    @InjectModel(IntegrationLog.name)
    private readonly integrationLogs: Model<IntegrationLogDocument>,
    @InjectModel(Notification.name) private readonly notifications: Model<NotificationDocument>,
    @InjectModel(FinancialEntry.name)
    private readonly financialEntries: Model<FinancialEntryDocument>,
    @InjectModel(AuditLog.name) private readonly auditLogs: Model<AuditLogDocument>,
    private readonly shopee: ShopeeProvider,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly asaas: AsaasApiClient,
    private readonly mercadoPago: MercadoPagoApiClient,
  ) {}

  async me(user: AuthUser) {
    const [account, supplierProfile, sellerProfile] = await Promise.all([
      this.users.findById(user.id, { passwordHash: 0, refreshTokenHashes: 0 }).lean(),
      this.supplierProfiles.findOne({ userId: user.id }).lean(),
      this.sellerProfiles.findOne({ userId: user.id }).lean(),
    ]);
    return { user: account, supplierProfile, sellerProfile };
  }

  async onboardSupplier(user: AuthUser, body: AnyRecord) {
    const organization = await this.ensureOrganization(
      user,
      'supplier',
      String(body.storeName ?? 'Fornecedor'),
    );
    const checklist = {
      companyData: Boolean(body.storeName && body.document),
      logo: Boolean(body.logoUrl),
      originAddress: Boolean(body.cep || ((body.address as AnyRecord | undefined)?.cep ?? false)),
      firstProduct: false,
      adminApproved: false,
    };

    const profile = await this.supplierProfiles.findOneAndUpdate(
      { userId: user.id },
      {
        $set: {
          organizationId: String(organization._id),
          personal: {
            responsibleName: body.responsibleName ?? body.name ?? '',
            email: body.email ?? user.email,
            phone: body.phone ?? '',
          },
          company: body,
          policies: {
            exchangePolicy: body.exchangePolicy ?? '',
            returnPolicy: body.returnPolicy ?? '',
            contactMethods: body.contactMethods ?? [],
          },
          activationChecklist: checklist,
        },
      },
      { upsert: true, new: true },
    );
    await this.users.updateOne(
      { _id: user.id },
      { $set: { role: 'supplier', organizationId: String(organization._id) } },
    );
    await this.audit(user.id, 'supplier.onboard', 'supplier_profile', String(profile._id));
    return { profile, checklist };
  }

  async onboardSeller(user: AuthUser, body: AnyRecord) {
    const organization = await this.ensureOrganization(
      user,
      'seller',
      String(body.storeName ?? 'Vendedor'),
    );
    const checklist = {
      profile: Boolean(body.storeName && body.document),
      shopeeConnected: false,
      firstSupplier: false,
      firstProductImported: false,
      marginConfigured: false,
      firstListingPublished: false,
    };

    const profile = await this.sellerProfiles.findOneAndUpdate(
      { userId: user.id },
      {
        $set: {
          organizationId: String(organization._id),
          personal: {
            responsibleName: body.responsibleName ?? body.name ?? '',
            email: body.email ?? user.email,
            phone: body.phone ?? '',
          },
          storeProfile: body,
          activationChecklist: checklist,
        },
      },
      { upsert: true, new: true },
    );
    await this.users.updateOne(
      { _id: user.id },
      { $set: { role: 'seller', organizationId: String(organization._id) } },
    );
    await this.audit(user.id, 'seller.onboard', 'seller_profile', String(profile._id));
    return { profile, checklist };
  }

  async supplierDashboard(user: AuthUser) {
    this.requireRole(user, ['supplier', 'admin']);
    const [products, lowStock, orders, financial] = await Promise.all([
      this.supplierProducts.countDocuments({ supplierUserId: user.id, status: 'active' }),
      this.supplierProducts.countDocuments({
        supplierUserId: user.id,
        status: 'active',
        $expr: { $lte: ['$stock', '$minStock'] },
      }),
      this.supplierOrders.aggregate<{ _id: string; count: number }>([
        { $match: { supplierUserId: user.id } },
        { $group: { _id: '$preparationStatus', count: { $sum: 1 } } },
      ]),
      this.financialEntries.aggregate<{ _id: string; total: number }>([
        { $match: { supplierUserId: user.id } },
        { $group: { _id: '$status', total: { $sum: { $toDouble: '$amounts.supplierAmount' } } } },
      ]),
    ]);
    const orderCounts = orders.reduce<Record<string, number>>((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});
    return { products, lowStock, orders: orderCounts, financial };
  }

  async supplierSettings(user: AuthUser) {
    this.requireRole(user, ['supplier', 'admin']);
    const org = await this.ensureOrganization(user, 'supplier', 'Fornecedor');
    const profile = await this.supplierProfiles
      .findOneAndUpdate(
        { userId: user.id },
        {
          $setOnInsert: {
            userId: user.id,
            organizationId: String(org._id),
            personal: { email: user.email },
            company: {},
            policies: {},
            activationChecklist: {},
          },
        },
        { upsert: true, new: true },
      )
      .lean();

    const [originAddress, sellableProducts] = await Promise.all([
      this.addresses
        .findOne({ ownerUserId: user.id, organizationId: String(org._id), type: 'origin' })
        .lean(),
      this.supplierProducts.countDocuments({
        supplierUserId: user.id,
        status: 'active',
        allowSellers: true,
        stock: { $gt: 0 },
      }),
    ]);
    const activation = this.supplierActivation(profile, originAddress?.data, sellableProducts);
    await this.supplierProfiles.updateOne(
      { userId: user.id },
      { $set: { activationChecklist: activation.checklist } },
    );

    return {
      profile: {
        personal: profile.personal ?? {},
        company: profile.company ?? {},
        policies: profile.policies ?? {},
        approvalStatus: profile.approvalStatus,
      },
      originAddress: originAddress?.data ?? {},
      activation,
    };
  }

  async updateSupplierSettings(user: AuthUser, body: AnyRecord) {
    this.requireRole(user, ['supplier', 'admin']);
    const org = await this.ensureOrganization(user, 'supplier', 'Fornecedor');
    const current = await this.supplierProfiles.findOne({ userId: user.id }).lean();
    const personal = { ...objectFrom(current?.personal), ...objectFrom(body.personal) };
    const company = { ...objectFrom(current?.company), ...objectFrom(body.company) };
    const policies = { ...objectFrom(current?.policies), ...objectFrom(body.policies) };

    if (hasText(company.storeName)) {
      await this.organizations.updateOne(
        { _id: org._id },
        { $set: { name: String(company.storeName) } },
      );
    }

    await this.supplierProfiles.findOneAndUpdate(
      { userId: user.id },
      {
        $set: {
          organizationId: String(org._id),
          personal,
          company,
          policies,
        },
        $setOnInsert: { userId: user.id, activationChecklist: {} },
      },
      { upsert: true, new: true },
    );

    const originAddress = objectFrom(body.originAddress);
    if (Object.keys(originAddress).length) {
      await this.addresses.findOneAndUpdate(
        { ownerUserId: user.id, organizationId: String(org._id), type: 'origin' },
        {
          $set: {
            ownerUserId: user.id,
            organizationId: String(org._id),
            type: 'origin',
            data: originAddress,
          },
        },
        { upsert: true, new: true },
      );
    }

    await this.audit(user.id, 'supplier.settings.update', 'supplier_profile', user.id);
    return this.supplierSettings(user);
  }

  async uploadSupplierLogo(user: AuthUser, file: { buffer?: Buffer; mimeType: string }) {
    this.requireRole(user, ['supplier', 'admin']);
    if (!file?.buffer || !file.mimeType.startsWith('image/')) {
      throw new BadRequestException('Envie uma imagem valida para a logo.');
    }
    const org = await this.ensureOrganization(user, 'supplier', 'Fornecedor');
    const ext = (file.mimeType.split('/')[1] ?? 'jpg').split('+')[0];
    const path = `supplier-logos/${user.id}/logo.${ext}`;
    const logoUrl = await this.storage.upload(path, file.buffer, file.mimeType);

    await this.supplierProfiles.findOneAndUpdate(
      { userId: user.id },
      {
        $set: {
          organizationId: String(org._id),
          'company.logoUrl': logoUrl,
        },
        $setOnInsert: {
          userId: user.id,
          personal: { email: user.email },
          policies: {},
          activationChecklist: {},
        },
      },
      { upsert: true, new: true },
    );
    await this.audit(user.id, 'supplier.logo.upload', 'supplier_profile', user.id);
    return this.supplierSettings(user);
  }

  async lookupCep(user: AuthUser, cep: string) {
    this.requireRole(user, ['supplier', 'seller', 'admin']);
    const digits = String(cep ?? '').replace(/\D/g, '');
    if (digits.length !== 8) throw new BadRequestException('CEP deve ter 8 digitos.');

    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) throw new BadRequestException('Nao foi possivel consultar este CEP.');
    const data = (await res.json()) as {
      erro?: boolean;
      cep?: string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
      complemento?: string;
    };
    if (data.erro) throw new BadRequestException('CEP nao encontrado.');

    return {
      cep: data.cep ?? digits,
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
      complement: data.complemento ?? '',
    };
  }

  async listSupplierProducts(
    user: AuthUser,
    q: { search?: string; status?: string; page?: number; limit?: number },
  ) {
    this.requireRole(user, ['supplier', 'admin']);
    const { page, limit, skip } = pageLimit(q.page, q.limit);
    const filter: FilterQuery<SupplierProductDocument> = { supplierUserId: user.id };
    if (q.status) {
      const statuses = q.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    if (q.search) filter.$text = { $search: q.search };
    const [items, total] = await Promise.all([
      this.supplierProducts.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.supplierProducts.countDocuments(filter),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createSupplierProduct(user: AuthUser, body: AnyRecord) {
    this.requireRole(user, ['supplier', 'admin']);
    const org = await this.ensureOrganization(user, 'supplier', 'Fornecedor');
    const product = await this.supplierProducts.create({
      supplierUserId: user.id,
      organizationId: String(org._id),
      name: String(body.name ?? ''),
      supplierSku: String(body.supplierSku ?? body.sku ?? ''),
      shortDescription: body.shortDescription ?? '',
      description: body.description ?? '',
      category: body.category ?? '',
      brand: body.brand ?? '',
      images: Array.isArray(body.images) ? body.images : [],
      videoUrl: body.videoUrl ?? '',
      costPrice: numberFrom(body.costPrice),
      suggestedPrice: numberFrom(body.suggestedPrice),
      stock: Math.max(0, numberFrom(body.stock)),
      minStock: Math.max(0, numberFrom(body.minStock)),
      weight: body.weight != null ? numberFrom(body.weight) : undefined,
      dimensions: body.dimensions ?? undefined,
      gtin: body.gtin ?? '',
      shipping: body.shipping ?? {},
      fiscal: body.fiscal ?? {},
      variations: Array.isArray(body.variations) ? body.variations : [],
      allowSellers: body.allowSellers !== false,
      status: body.status ?? 'active',
    });
    await this.inventoryMovements.create({
      supplierProductId: String(product._id),
      supplierUserId: user.id,
      type: 'in',
      quantity: product.stock,
      balanceAfter: product.stock,
      reason: 'Cadastro inicial',
    });
    await this.supplierProfiles.updateOne(
      { userId: user.id },
      { $set: { 'activationChecklist.firstProduct': true } },
    );
    await this.audit(user.id, 'supplier_product.create', 'supplier_product', String(product._id));
    return product.toObject();
  }

  async updateSupplierProduct(user: AuthUser, id: string, body: AnyRecord) {
    this.requireRole(user, ['supplier', 'admin']);
    const current = await this.supplierProducts.findOne({ _id: id, supplierUserId: user.id });
    if (!current) throw new NotFoundException('Produto não encontrado');
    const previousStock = current.stock;
    Object.assign(current, body);
    current.stock = Math.max(0, numberFrom(current.stock));
    await current.save();

    if (previousStock !== current.stock) {
      await this.recordStockChange(
        user.id,
        id,
        current.stock - previousStock,
        current.stock,
        'Atualização manual',
      );
      await this.queueInventorySync(user.id, id);
    }
    await this.audit(user.id, 'supplier_product.update', 'supplier_product', id);
    return current.toObject();
  }

  async duplicateSupplierProduct(user: AuthUser, id: string) {
    const source = await this.supplierProducts.findOne({ _id: id, supplierUserId: user.id }).lean();
    if (!source) throw new NotFoundException('Produto não encontrado');
    const { _id, createdAt, updatedAt, ...rest } = source as AnyRecord;
    void _id;
    void createdAt;
    void updatedAt;
    const copy = await this.supplierProducts.create({
      ...rest,
      name: `${source.name} (cópia)`,
      supplierSku: `${source.supplierSku}-COPY-${Date.now().toString(36)}`,
      status: 'inactive',
    });
    return copy.toObject();
  }

  async removeSupplierProduct(user: AuthUser, id: string) {
    const hasOrders = await this.supplierOrders.exists({
      supplierUserId: user.id,
      'items.supplierProductId': id,
    });
    if (hasOrders) {
      await this.supplierProducts.updateOne(
        { _id: id, supplierUserId: user.id },
        { $set: { status: 'archived', allowSellers: false } },
      );
      return { archived: true, deleted: false };
    }
    const res = await this.supplierProducts.deleteOne({ _id: id, supplierUserId: user.id });
    if (!res.deletedCount) throw new NotFoundException('Produto não encontrado');
    return { deleted: true };
  }

  /** Sobe uma foto e cria um produto rascunho (`pending_review`) — nome/preço/
   * estoque ficam para o fornecedor preencher em "Meus produtos", mesma lógica
   * do Envio em Lote do catálogo principal. Usado pelo upload web. */
  async ingestSupplierPhoto(user: AuthUser, file: { buffer: Buffer; mimeType: string }) {
    this.requireRole(user, ['supplier', 'admin']);
    const org = await this.ensureOrganization(user, 'supplier', 'Fornecedor');
    return this.storeSupplierPendingPhoto(user.id, String(org._id), file);
  }

  /** Mesma ingestão, mas a partir de um chat do Telegram já vinculado — sem
   * checagem de papel (o vínculo do chat já autoriza). */
  async ingestSupplierPhotoFromTelegram(
    chatId: string,
    file: { buffer: Buffer; mimeType: string },
  ) {
    const profile = await this.supplierProfiles.findOne({ telegramChatId: chatId }).lean();
    if (!profile) return null;
    return this.storeSupplierPendingPhoto(profile.userId, profile.organizationId, file);
  }

  /** Chat vinculado a algum fornecedor? Usado pelo bot pra decidir a rota
   * antes de aplicar o gate de admin (allowlist fixa do `.env`). */
  async findSupplierByTelegramChat(chatId: string) {
    return this.supplierProfiles.findOne({ telegramChatId: chatId }, { userId: 1 }).lean();
  }

  private async storeSupplierPendingPhoto(
    supplierUserId: string,
    organizationId: string,
    file: { buffer: Buffer; mimeType: string },
  ) {
    const sku = `FOTO-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const product = await this.supplierProducts.create({
      supplierUserId,
      organizationId,
      name: 'Produto (foto pendente)',
      supplierSku: sku,
      images: [],
      status: 'pending_review',
      allowSellers: false,
    });
    const ext = (file.mimeType.split('/')[1] ?? 'jpg').split('+')[0];
    const path = `supplier-products/${supplierUserId}/${String(product._id)}/original.${ext}`;
    const url = await this.storage.upload(path, file.buffer, file.mimeType);
    product.images = [url];
    await product.save();
    return product.toObject();
  }

  /** Gera um código curto (15min) pra vincular um chat do Telegram a este
   * fornecedor — enviado como `/vincular <código>` pro bot. */
  async generateTelegramLinkCode(user: AuthUser) {
    this.requireRole(user, ['supplier', 'admin']);
    const org = await this.ensureOrganization(user, 'supplier', 'Fornecedor');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.supplierProfiles.findOneAndUpdate(
      { userId: user.id },
      {
        $set: { telegramLinkCode: code, telegramLinkCodeExpiresAt: expiresAt },
        $setOnInsert: { organizationId: String(org._id) },
      },
      { upsert: true },
    );
    return {
      code,
      expiresAt,
      botUsername: this.config.get<string>('telegram.botUsername') ?? '',
    };
  }

  async telegramStatus(user: AuthUser) {
    this.requireRole(user, ['supplier', 'admin']);
    const profile = await this.supplierProfiles
      .findOne({ userId: user.id }, { telegramChatId: 1, updatedAt: 1 })
      .lean();
    return { linked: Boolean(profile?.telegramChatId) };
  }

  async unlinkTelegram(user: AuthUser) {
    this.requireRole(user, ['supplier', 'admin']);
    await this.supplierProfiles.updateOne(
      { userId: user.id },
      { $unset: { telegramChatId: '', telegramLinkCode: '', telegramLinkCodeExpiresAt: '' } },
    );
    return { linked: false };
  }

  /** Consome o código enviado como `/vincular <código>` no chat do Telegram —
   * chamado pelo bot, sem AuthUser (a prova de posse é o próprio código). */
  async consumeTelegramLinkCode(
    chatId: string,
    code: string,
  ): Promise<{ ok: true; storeName: string } | { ok: false; reason: 'not_found' | 'expired' }> {
    const profile = await this.supplierProfiles.findOne({ telegramLinkCode: code });
    if (!profile) return { ok: false, reason: 'not_found' };
    if (
      !profile.telegramLinkCodeExpiresAt ||
      profile.telegramLinkCodeExpiresAt.getTime() < Date.now()
    ) {
      return { ok: false, reason: 'expired' };
    }
    profile.telegramChatId = chatId;
    profile.telegramLinkCode = undefined;
    profile.telegramLinkCodeExpiresAt = undefined;
    await profile.save();
    const company = profile.company as AnyRecord;
    const personal = profile.personal as AnyRecord;
    const storeName = String(company?.storeName ?? personal?.responsibleName ?? 'sua loja');
    return { ok: true, storeName };
  }

  async sellerDashboard(user: AuthUser) {
    this.requireRole(user, ['seller', 'admin']);
    const [catalogAvailable, listings, marketplaceOrders, financialEntries, notifications, unread] =
      await Promise.all([
        this.supplierProducts.countDocuments({
          status: 'active',
          allowSellers: true,
          stock: { $gt: 0 },
        }),
        this.listings.countDocuments({ sellerUserId: user.id }),
        this.marketplaceOrders
          .find(
            { sellerUserId: user.id },
            {
              marketplace: 1,
              rawPayload: 1,
              items: 1,
              externalOrderId: 1,
              status: 1,
              createdAt: 1,
            },
          )
          .sort({ createdAt: -1 })
          .lean(),
        this.financialEntries.find({ sellerUserId: user.id }, { amounts: 1, status: 1 }).lean(),
        this.notifications.find({ userId: user.id }).sort({ createdAt: -1 }).limit(4).lean(),
        this.notifications.countDocuments({ userId: user.id, read: false }),
      ]);

    const timeSeries = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        date: dateOnly(date),
        label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        amount: 0,
        orders: 0,
      };
    });
    const timeSeriesByDate = new Map(timeSeries.map((bucket) => [bucket.date, bucket]));
    const topProductsByName = new Map<
      string,
      { name: string; units: number; amount: number; imageUrl: string }
    >();
    const sales = {
      total: { orders: marketplaceOrders.length, amount: 0 },
      shopee: { orders: 0, amount: 0 },
      mercadoLivre: { orders: 0, amount: 0 },
      other: { orders: 0, amount: 0 },
    };
    let productsSold = 0;

    for (const order of marketplaceOrders) {
      const rawOrder = order as AnyRecord;
      const key = marketplaceDashboardKey(rawOrder.marketplace);
      const amount = marketplaceOrderSaleAmount(rawOrder);
      const bucket = timeSeriesByDate.get(dateOnly(orderCreatedAt(rawOrder)));
      sales[key].orders += 1;
      sales[key].amount = moneyAmount(sales[key].amount + amount);
      sales.total.amount = moneyAmount(sales.total.amount + amount);
      if (bucket) {
        bucket.orders += 1;
        bucket.amount = moneyAmount(bucket.amount + amount);
      }

      for (const item of Array.isArray(rawOrder.items) ? (rawOrder.items as AnyRecord[]) : []) {
        const name = dashboardItemName(item);
        const quantity = dashboardItemQuantity(item);
        const current = topProductsByName.get(name) ?? { name, units: 0, amount: 0, imageUrl: '' };
        current.units += quantity;
        current.amount = moneyAmount(current.amount + dashboardItemAmount(item));
        current.imageUrl ||= dashboardItemImage(item);
        productsSold += quantity;
        topProductsByName.set(name, current);
      }
    }

    const finance = financialEntries.reduce(
      (acc, entry) => {
        const amounts = this.sellerChargeAmounts(entry.amounts);
        acc.supplierCosts = moneyAmount(acc.supplierCosts + amounts.supplierAmount);
        acc.platformFees = moneyAmount(acc.platformFees + amounts.platformFee);
        if (entry.status === 'paid') {
          acc.paid = moneyAmount(acc.paid + amounts.sellerChargeAmount);
        } else {
          acc.pending = moneyAmount(acc.pending + amounts.sellerChargeAmount);
        }
        return acc;
      },
      {
        gross: sales.total.amount,
        costs: 0,
        net: 0,
        margin: 0,
        supplierCosts: 0,
        platformFees: 0,
        pending: 0,
        paid: 0,
      },
    );
    finance.costs = moneyAmount(finance.supplierCosts + finance.platformFees);
    finance.net = moneyAmount(finance.gross - finance.costs);
    finance.margin = finance.gross > 0 ? Math.round((finance.net / finance.gross) * 1000) / 10 : 0;

    const recentOrders = marketplaceOrders.slice(0, 5).map((order) => {
      const rawOrder = order as AnyRecord;
      const rawPayload = objectFrom(rawOrder.rawPayload);
      return {
        id: String(rawOrder._id ?? ''),
        externalOrderId: String(rawOrder.externalOrderId ?? ''),
        customer:
          firstText(rawPayload, ['customerName', 'buyerName', 'buyer', 'clientName', 'name']) ||
          'Cliente',
        marketplace: String(rawOrder.marketplace ?? ''),
        status: String(rawOrder.status ?? ''),
        amount: marketplaceOrderSaleAmount(rawOrder),
        createdAt: rawOrder.createdAt,
      };
    });

    return {
      catalogAvailable,
      listings,
      orders: marketplaceOrders.length,
      unread,
      productsSold,
      sales,
      ticketAverage:
        marketplaceOrders.length > 0
          ? moneyAmount(sales.total.amount / marketplaceOrders.length)
          : 0,
      timeSeries,
      topProducts: [...topProductsByName.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
      recentOrders,
      finance,
      notifications: notifications.map((notification) => {
        const rawNotification = notification as AnyRecord;
        return {
          id: String(rawNotification._id),
          title: notification.title,
          message: notification.message,
          tone: notification.tone,
          read: notification.read,
          createdAt: rawNotification.createdAt,
        };
      }),
    };
  }

  async catalog(
    user: AuthUser,
    q: { search?: string; category?: string; supplier?: string; page?: number; limit?: number },
  ): Promise<AnyRecord> {
    this.requireRole(user, ['seller', 'admin']);
    const { page, limit, skip } = pageLimit(q.page, q.limit);
    const approvedProfiles = await this.supplierProfiles
      .find({ approvalStatus: 'approved' }, { userId: 1, company: 1 })
      .lean();
    const supplierIdsWithData = approvedProfiles
      .filter((profile) => {
        const company = objectFrom(profile.company);
        return (
          hasAnyText(company, ['storeName', 'companyName', 'fantasyName', 'legalName', 'name']) &&
          hasAnyText(company, ['document', 'cnpj', 'cpf']) &&
          hasAnyText(company, ['logoUrl', 'logo', 'brandLogo'])
        );
      })
      .map((profile) => profile.userId);
    const originAddresses = await this.addresses
      .find(
        { ownerUserId: { $in: supplierIdsWithData }, type: 'origin' },
        { ownerUserId: 1, data: 1 },
      )
      .lean();
    const supplierIdsWithOrigin = new Set(
      originAddresses
        .filter((address) => hasOriginAddress(objectFrom(address.data)))
        .map((address) => address.ownerUserId),
    );
    const eligibleSupplierIds = approvedProfiles
      .filter((profile) => {
        const company = objectFrom(profile.company);
        return (
          supplierIdsWithData.includes(profile.userId) &&
          (supplierIdsWithOrigin.has(profile.userId) || hasOriginAddress(company))
        );
      })
      .map((profile) => profile.userId);

    const supplierStats = eligibleSupplierIds.length
      ? await this.supplierProducts.aggregate<{
          _id: string;
          productCount: number;
          stock: number;
          minPrice: number;
          maxPrice: number;
          categories: string[];
          images: string[][];
          salesCount: number;
        }>([
          {
            $match: {
              status: 'active',
              allowSellers: true,
              stock: { $gt: 0 },
              supplierUserId: { $in: eligibleSupplierIds },
            },
          },
          {
            $group: {
              _id: '$supplierUserId',
              productCount: { $sum: 1 },
              stock: { $sum: '$stock' },
              minPrice: { $min: '$costPrice' },
              maxPrice: { $max: '$costPrice' },
              categories: { $addToSet: '$category' },
              images: { $push: '$images' },
              salesCount: { $sum: '$salesCount' },
            },
          },
          { $sort: { productCount: -1, salesCount: -1 } },
        ])
      : [];
    const statsBySupplier = new Map(supplierStats.map((stats) => [String(stats._id), stats]));
    const suppliers = approvedProfiles
      .filter((profile) => eligibleSupplierIds.includes(profile.userId))
      .map((profile) => {
        const company = objectFrom(profile.company);
        const stats = statsBySupplier.get(profile.userId);
        const images =
          stats?.images
            ?.flat()
            .filter(
              (image): image is string => typeof image === 'string' && image.trim().length > 0,
            )
            .slice(0, 4) ?? [];
        return {
          id: profile.userId,
          name: supplierStoreName(company),
          logoUrl: supplierLogo(company),
          productCount: stats?.productCount ?? 0,
          stock: stats?.stock ?? 0,
          categories:
            stats?.categories
              ?.filter((category): category is string => Boolean(category))
              .slice(0, 4) ?? [],
          minPrice: stats?.minPrice ?? 0,
          maxPrice: stats?.maxPrice ?? 0,
          salesCount: stats?.salesCount ?? 0,
          images,
        };
      })
      .filter((supplier) => supplier.productCount > 0)
      .sort((a, b) => b.productCount - a.productCount || b.salesCount - a.salesCount);
    const suppliersById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

    if (q.supplier && !eligibleSupplierIds.includes(q.supplier)) {
      return { items: [], suppliers, total: 0, page, limit, pages: 0 };
    }
    if (!q.supplier && !eligibleSupplierIds.length) {
      return { items: [], suppliers, total: 0, page, limit, pages: 0 };
    }

    const filter: FilterQuery<SupplierProductDocument> = {
      status: 'active',
      allowSellers: true,
      stock: { $gt: 0 },
      supplierUserId: q.supplier ?? { $in: eligibleSupplierIds },
    };
    if (q.category) filter.category = q.category;
    if (q.search) filter.$text = { $search: q.search };
    const [items, total, platformFeeRules] = await Promise.all([
      this.supplierProducts
        .find(filter)
        .sort({ salesCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.supplierProducts.countDocuments(filter),
      this.platformFeeRules(),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        platformFee: this.feeFromRules(item.costPrice, platformFeeRules),
        shoppingPrice: moneyAmount(
          item.costPrice + this.feeFromRules(item.costPrice, platformFeeRules),
        ),
        supplier: suppliersById.get(String(item.supplierUserId)) ?? null,
      })),
      suppliers,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async prepareListing(user: AuthUser, body: AnyRecord) {
    this.requireRole(user, ['seller', 'admin']);
    const product = await this.supplierProducts.findOne({
      _id: String(body.supplierProductId),
      status: 'active',
      allowSellers: true,
    });
    if (!product) throw new NotFoundException('Produto indisponível no catálogo');

    const org = await this.ensureOrganization(user, 'seller', 'Vendedor');
    const platformFee = await this.platformFeeForAmount(product.costPrice);
    const pricing = this.calculatePricing(product.costPrice, {
      ...(body.pricing as AnyRecord | undefined),
      platformFee,
    });
    const listing = await this.listings.create({
      sellerUserId: user.id,
      sellerOrganizationId: String(org._id),
      supplierProductId: String(product._id),
      supplierUserId: product.supplierUserId,
      marketplace: String(body.marketplace ?? 'shopee'),
      listingData: {
        title: body.title ?? product.name,
        description: body.description ?? product.description,
        categoryId: body.categoryId ?? '',
        images: body.images ?? product.images,
        sellerSku: body.sellerSku ?? '',
        stockToPublish: Math.min(
          product.stock,
          Math.max(0, numberFrom(body.stockToPublish, product.stock)),
        ),
        warning: 'Taxas estimadas podem variar e não devem ser tratadas como valor garantido.',
      },
      variants: Array.isArray(body.variants) ? body.variants : product.variations,
      pricing,
      status: 'draft',
    });
    await this.sellerProfiles.updateOne(
      { userId: user.id },
      {
        $set: {
          'activationChecklist.firstProductImported': true,
          'activationChecklist.marginConfigured': true,
        },
      },
    );
    await this.audit(user.id, 'listing.prepare', 'marketplace_listing', String(listing._id));
    return listing.toObject();
  }

  async listSellerListings(user: AuthUser, q: { marketplace?: string } = {}): Promise<AnyRecord[]> {
    this.requireRole(user, ['seller', 'admin']);
    const filter: FilterQuery<ProductListingDocument> = { sellerUserId: user.id };
    if (q.marketplace) filter.marketplace = String(q.marketplace);
    const listings = await this.listings.find(filter).sort({ createdAt: -1 }).lean();
    const productIds = [...new Set(listings.map((listing) => String(listing.supplierProductId)))];
    const supplierIds = [...new Set(listings.map((listing) => String(listing.supplierUserId)))];
    const [products, supplierProfiles] = await Promise.all([
      this.supplierProducts.find({ _id: { $in: productIds } }).lean(),
      this.supplierProfiles
        .find({ userId: { $in: supplierIds } }, { userId: 1, company: 1 })
        .lean(),
    ]);
    const productById = new Map(products.map((product) => [String(product._id), product]));
    const supplierById = new Map(supplierProfiles.map((profile) => [profile.userId, profile]));

    return listings.map((listing) => {
      const product = productById.get(String(listing.supplierProductId));
      const supplier = supplierById.get(String(listing.supplierUserId));
      const company = objectFrom(supplier?.company);
      return {
        ...listing,
        supplier: supplier
          ? {
              id: supplier.userId,
              name: supplierStoreName(company),
              logoUrl: supplierLogo(company),
            }
          : null,
        product: product
          ? {
              id: String(product._id),
              name: product.name,
              supplierSku: product.supplierSku,
              description: product.description,
              shortDescription: product.shortDescription,
              category: product.category,
              brand: product.brand,
              images: product.images,
              stock: product.stock,
              costPrice: product.costPrice,
              suggestedPrice: product.suggestedPrice,
              variations: product.variations,
              weight: product.weight,
              dimensions: product.dimensions,
            }
          : null,
      };
    });
  }

  async updateSellerListing(user: AuthUser, id: string, body: AnyRecord): Promise<AnyRecord> {
    this.requireRole(user, ['seller', 'admin']);
    const listing = await this.listings.findOne({ _id: id, sellerUserId: user.id });
    if (!listing) throw new NotFoundException('Anuncio nao encontrado');
    if (listing.status === 'publishing') {
      throw new BadRequestException('Aguarde a publicacao terminar antes de editar.');
    }

    const currentData = objectFrom(listing.listingData);
    const currentPricing = objectFrom(listing.pricing);
    const nextData: AnyRecord = { ...currentData };
    const nextPricing: AnyRecord = { ...currentPricing };

    for (const key of ['title', 'description', 'categoryId', 'sellerSku']) {
      if (body[key] !== undefined) nextData[key] = String(body[key]);
    }
    if (body.stockToPublish !== undefined) {
      nextData.stockToPublish = Math.max(0, Math.floor(numberFrom(body.stockToPublish)));
    }
    if (Array.isArray(body.images)) {
      nextData.images = body.images.filter(
        (image): image is string => typeof image === 'string' && image.trim().length > 0,
      );
    }

    const costPrice = moneyAmount(nextPricing.costPrice);
    if (body.profitPercent !== undefined && costPrice > 0) {
      const profitPercent = numberFrom(body.profitPercent);
      const finalPrice = moneyAmount(costPrice * (1 + profitPercent / 100));
      nextPricing.profitPercent = profitPercent;
      nextPricing.finalPrice = finalPrice;
      nextPricing.profit = moneyAmount(finalPrice - costPrice);
    }
    if (body.finalPrice !== undefined) {
      const finalPrice = Math.max(0, moneyAmount(body.finalPrice));
      nextPricing.finalPrice = finalPrice;
      nextPricing.profit = moneyAmount(finalPrice - costPrice);
      nextPricing.profitPercent =
        costPrice > 0 ? Math.round(((finalPrice - costPrice) / costPrice) * 1000) / 10 : 0;
    }

    listing.listingData = nextData;
    listing.pricing = nextPricing;
    listing.lastError = '';
    if (['rejected', 'sync_error'].includes(listing.status)) listing.status = 'draft';
    await listing.save();
    await this.audit(user.id, 'listing.update', 'marketplace_listing', id);
    return this.listSellerListings(user, { marketplace: listing.marketplace }).then(
      (items) =>
        items.find((item) => String(item._id) === id) ??
        (listing.toObject() as unknown as AnyRecord),
    );
  }

  async removeSellerListing(user: AuthUser, id: string): Promise<{ ok: true }> {
    this.requireRole(user, ['seller', 'admin']);
    const listing = await this.listings.findOne({ _id: id, sellerUserId: user.id });
    if (!listing) throw new NotFoundException('Anuncio nao encontrado');
    if (listing.status === 'publishing') {
      throw new BadRequestException('Aguarde a publicacao terminar antes de excluir.');
    }
    await Promise.all([
      this.listings.deleteOne({ _id: id, sellerUserId: user.id }),
      this.mappings.deleteMany({ listingId: id, sellerUserId: user.id }),
    ]);
    await this.audit(user.id, 'listing.delete', 'marketplace_listing', id);
    return { ok: true };
  }

  async requestPublication(user: AuthUser, id: string) {
    this.requireRole(user, ['seller', 'admin']);
    const listing = await this.listings.findOne({ _id: id, sellerUserId: user.id });
    if (!listing) throw new NotFoundException('Anuncio nao encontrado');
    if (listing.marketplace !== 'shopee') {
      throw new BadRequestException('Publicacao direta disponivel primeiro para Shopee.');
    }
    const supplierProduct = await this.supplierProducts.findById(listing.supplierProductId).lean();
    if (!supplierProduct) throw new NotFoundException('Produto fornecedor nao encontrado');

    const data = listing.listingData as AnyRecord;
    const pricing = listing.pricing as AnyRecord;
    const draft = {
      listingId: id,
      sellerUserId: user.id,
      supplierProductId: listing.supplierProductId,
      title: String(data.title ?? ''),
      description: String(data.description ?? ''),
      categoryId: String(data.categoryId ?? ''),
      images: Array.isArray(data.images) ? (data.images as string[]) : [],
      price: numberFrom(pricing.finalPrice),
      stock: numberFrom(data.stockToPublish),
      sellerSku: String(data.sellerSku ?? supplierProduct.supplierSku ?? ''),
      weight: supplierProduct.weight,
      dimensions: supplierProduct.dimensions,
      variants: listing.variants,
    };
    const errors = await this.shopee.validatePublication(draft);
    if (errors.length) throw new BadRequestException(errors);

    listing.status = 'publishing';
    listing.lastError = '';
    await listing.save();

    try {
      const result = await this.shopee.publishProduct(draft);
      listing.status = result.warnings?.length ? 'published_with_warning' : 'published';
      listing.externalItemId = result.externalItemId;
      listing.connectedStoreId = result.externalStoreId ?? '';
      listing.lastError = '';
      await listing.save();

      await this.mappings.findOneAndUpdate(
        { idempotencyKey: `listing:${id}:shopee:${result.externalItemId}` },
        {
          $setOnInsert: {
            idempotencyKey: `listing:${id}:shopee:${result.externalItemId}`,
            listingId: id,
            supplierProductId: listing.supplierProductId,
            supplierUserId: listing.supplierUserId,
            sellerUserId: user.id,
            marketplace: 'shopee',
            externalItemId: result.externalItemId,
            externalVariationId: '',
            internalVariationSku: String(data.sellerSku ?? supplierProduct.supplierSku ?? ''),
          },
        },
        { upsert: true, new: true },
      );
      await this.sellerProfiles.updateOne(
        { userId: user.id },
        { $set: { 'activationChecklist.firstListingPublished': true } },
      );
      await this.integrationLogs.create({
        marketplace: 'shopee',
        ownerUserId: user.id,
        action: 'listing.publish',
        level: 'info',
        message: 'Anuncio publicado na Shopee.',
        context: { listingId: id, itemId: result.externalItemId },
      });
      await this.audit(user.id, 'listing.published', 'marketplace_listing', id);
      return { queued: false, status: listing.status, externalItemId: result.externalItemId };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao publicar na Shopee';
      listing.status = 'rejected';
      listing.lastError = message;
      await listing.save();
      await this.integrationLogs.create({
        marketplace: 'shopee',
        ownerUserId: user.id,
        action: 'listing.publish_failed',
        level: 'error',
        message,
        context: { listingId: id },
      });
      throw new BadRequestException(message);
    }
  }

  async importMarketplaceOrder(user: AuthUser, body: AnyRecord) {
    this.requireRole(user, ['seller', 'admin']);
    const marketplace = String(body.marketplace ?? 'shopee');
    const externalOrderId = String(body.externalOrderId ?? body.orderSn ?? '');
    if (!externalOrderId) throw new BadRequestException('Pedido externo obrigatório');
    const idempotencyKey = `${marketplace}:${externalOrderId}`;

    const existing = await this.marketplaceOrders.findOne({ idempotencyKey }).lean();
    if (existing) return { duplicate: true, marketplaceOrder: existing };

    const items = Array.isArray(body.items) ? (body.items as AnyRecord[]) : [];
    const supplierItems: AnyRecord[] = [];
    const missing: string[] = [];
    for (const item of items) {
      const externalItemId = String(item.externalItemId ?? item.itemId ?? '');
      const externalVariationId = String(item.externalVariationId ?? item.modelId ?? '');
      const mapping = await this.mappings
        .findOne({ marketplace, externalItemId, externalVariationId })
        .lean();
      if (!mapping) {
        missing.push(
          externalVariationId ? `${externalItemId}/${externalVariationId}` : externalItemId,
        );
        continue;
      }
      const product = await this.supplierProducts.findById(mapping.supplierProductId).lean();
      if (!product) {
        missing.push(externalItemId);
        continue;
      }
      supplierItems.push({
        ...item,
        supplierProductId: mapping.supplierProductId,
        supplierUserId: mapping.supplierUserId,
        supplierSku: product.supplierSku,
        costPrice: product.costPrice,
        quantity: Math.max(1, numberFrom(item.quantity, 1)),
      });
    }

    const marketplaceOrder = await this.marketplaceOrders.create({
      idempotencyKey,
      marketplace,
      sellerUserId: user.id,
      externalOrderId,
      externalStoreId: body.externalStoreId ?? '',
      items,
      rawPayload: body,
      status: missing.length ? 'exception' : 'mapped',
      exceptionReason: missing.length ? `Itens sem vínculo: ${missing.join(', ')}` : '',
    });

    const platformDocuments = orderDocumentsFromPayload(body);
    if (platformDocuments.length) {
      await this.orderDocuments.insertMany(
        platformDocuments.map((doc) => ({
          orderId: String(marketplaceOrder._id),
          ownerUserId: user.id,
          ...doc,
        })),
      );
    }

    if (missing.length) {
      await this.notifyAdmins(
        'Pedido sem vínculo',
        `Pedido ${externalOrderId} precisa de correção manual.`,
      );
      return { marketplaceOrder: marketplaceOrder.toObject(), exception: true, missing };
    }

    const bySupplier = new Map<string, AnyRecord[]>();
    for (const item of supplierItems) {
      const key = String(item.supplierUserId);
      bySupplier.set(key, [...(bySupplier.get(key) ?? []), item]);
    }

    const supplierOrders = [];
    for (const [supplierUserId, groupedItems] of bySupplier.entries()) {
      const supplierOrder = await this.supplierOrders.create({
        idempotencyKey: `${idempotencyKey}:${supplierUserId}`,
        supplierUserId,
        sellerUserId: user.id,
        marketplaceOrderId: String(marketplaceOrder._id),
        externalOrderId,
        preparationStatus: 'new',
        paymentStatus: body.paymentStatus ?? 'pending',
        shippingStatus: body.shippingStatus ?? 'pending',
        items: groupedItems,
        totals: {
          saleAmount: numberFrom(body.saleAmount),
          supplierAmount: groupedItems.reduce(
            (sum, item) => sum + numberFrom(item.costPrice) * numberFrom(item.quantity, 1),
            0,
          ),
        },
        deadlines: body.deadlines ?? {},
      });
      supplierOrders.push(supplierOrder.toObject());
      if (platformDocuments.length) {
        await this.orderDocuments.insertMany(
          platformDocuments.map((doc) => ({
            orderId: String(supplierOrder._id),
            ownerUserId: supplierUserId,
            ...doc,
          })),
        );
      }
      await this.notifications.create({
        userId: supplierUserId,
        title: 'Novo pedido',
        message: `Pedido ${externalOrderId} entrou no painel do fornecedor.`,
        tone: 'success',
        data: { supplierOrderId: String(supplierOrder._id) },
      });
      await this.financialEntries.create({
        supplierOrderId: String(supplierOrder._id),
        supplierUserId,
        sellerUserId: user.id,
        amounts: this.sellerChargeAmounts({
          ...objectFrom(supplierOrder.totals),
          platformFee: await this.platformFeeForItems(groupedItems),
        }),
        status: 'pending',
        gateway: 'asaas',
        metadata: {
          marketplace,
          externalOrderId,
          marketplaceOrderId: String(marketplaceOrder._id),
        },
      });
      for (const item of groupedItems) {
        await this.reserveStock(
          supplierUserId,
          String(item.supplierProductId),
          numberFrom(item.quantity, 1),
          externalOrderId,
        );
      }
    }

    await this.audit(
      user.id,
      'marketplace_order.import',
      'marketplace_order',
      String(marketplaceOrder._id),
    );
    return { marketplaceOrder: marketplaceOrder.toObject(), supplierOrders };
  }

  async supplierOrdersList(user: AuthUser): Promise<AnyRecord[]> {
    this.requireRole(user, ['supplier', 'admin']);
    const orders = await this.supplierOrders
      .find({ supplierUserId: user.id })
      .sort({ createdAt: -1 })
      .lean();
    const marketplaceOrderIds = orders.map((order) => order.marketplaceOrderId).filter(Boolean);
    const supplierOrderIds = orders.map((order) => String(order._id));
    const sellerIds = [...new Set(orders.map((order) => order.sellerUserId).filter(Boolean))];

    const [marketplaceOrders, sellers, documents] = await Promise.all([
      this.marketplaceOrders.find({ _id: { $in: marketplaceOrderIds } }).lean(),
      this.users
        .find({ _id: { $in: sellerIds } }, { passwordHash: 0, refreshTokenHashes: 0 })
        .lean(),
      this.orderDocuments
        .find({ orderId: { $in: [...supplierOrderIds, ...marketplaceOrderIds] } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const marketplaceById = new Map(
      marketplaceOrders.map((order) => [String(order._id), order as AnyRecord]),
    );
    const sellerById = new Map(sellers.map((seller) => [String(seller._id), seller]));
    const documentsByOrderId = documents.reduce<Record<string, typeof documents>>((acc, doc) => {
      acc[doc.orderId] = [...(acc[doc.orderId] ?? []), doc];
      return acc;
    }, {});

    return orders.map((order) => {
      const marketplaceOrder = marketplaceById.get(order.marketplaceOrderId);
      const seller = sellerById.get(order.sellerUserId);
      const details = marketplaceOrderDetails(marketplaceOrder);
      return {
        ...order,
        seller: seller
          ? {
              id: String(seller._id),
              name: seller.name,
              email: seller.email,
            }
          : null,
        marketplace: marketplaceOrder
          ? {
              id: String(marketplaceOrder._id),
              name: String(marketplaceOrder.marketplace ?? ''),
              externalStoreId: String(marketplaceOrder.externalStoreId ?? ''),
              status: String(marketplaceOrder.status ?? ''),
              platformNote: details.platformNote,
              fiscalNumber: details.fiscalNumber,
            }
          : null,
        documents: [
          ...(documentsByOrderId[String(order._id)] ?? []),
          ...(documentsByOrderId[order.marketplaceOrderId] ?? []),
        ]
          .filter((doc, index, all) => all.findIndex((item) => item.url === doc.url) === index)
          .map((doc) => ({
            id: String(doc._id),
            type: doc.type,
            name: doc.name,
            url: doc.url,
            status: doc.status,
          })),
      };
    });
  }

  async sellerOrdersList(user: AuthUser, q: { date?: string } = {}): Promise<AnyRecord> {
    this.requireRole(user, ['seller', 'admin']);
    const { date, start, end } = dayBounds(q.date);
    const supplierOrders = await this.supplierOrders
      .find({
        sellerUserId: user.id,
        createdAt: { $gte: start, $lt: end },
      } as FilterQuery<SupplierOrderDocument>)
      .sort({ createdAt: -1 })
      .lean();

    const supplierOrderIds = supplierOrders.map((order) => String(order._id));
    const marketplaceOrderIds = [
      ...new Set(supplierOrders.map((order) => String(order.marketplaceOrderId)).filter(Boolean)),
    ];
    const supplierIds = [
      ...new Set(supplierOrders.map((order) => String(order.supplierUserId)).filter(Boolean)),
    ];
    const [marketplaceOrders, financialEntries, suppliers, supplierProfiles] = await Promise.all([
      this.marketplaceOrders.find({ _id: { $in: marketplaceOrderIds } }).lean(),
      this.financialEntries.find({ supplierOrderId: { $in: supplierOrderIds } }).lean(),
      this.users
        .find({ _id: { $in: supplierIds } }, { passwordHash: 0, refreshTokenHashes: 0 })
        .lean(),
      this.supplierProfiles
        .find({ userId: { $in: supplierIds } }, { userId: 1, company: 1 })
        .lean(),
    ]);

    const marketplaceById = new Map(
      marketplaceOrders.map((order) => [String(order._id), order as AnyRecord]),
    );
    const financialBySupplierOrderId = new Map(
      financialEntries.map((entry) => [String(entry.supplierOrderId), entry]),
    );
    const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));
    const profileBySupplierId = new Map(
      supplierProfiles.map((profile) => [String(profile.userId), profile]),
    );

    const items = supplierOrders.map((order) => {
      const rawOrder = order as AnyRecord;
      const marketplace = marketplaceById.get(String(order.marketplaceOrderId));
      const financial = financialBySupplierOrderId.get(String(rawOrder._id));
      const amounts = this.sellerChargeAmounts(financial?.amounts ?? order.totals);
      const supplier = supplierById.get(String(order.supplierUserId));
      const profile = profileBySupplierId.get(String(order.supplierUserId));
      const company = objectFrom(profile?.company);
      return {
        id: String(rawOrder._id),
        supplierOrderId: String(rawOrder._id),
        marketplaceOrderId: String(order.marketplaceOrderId),
        externalOrderId: order.externalOrderId,
        marketplace: marketplace
          ? {
              name: String(marketplace.marketplace ?? ''),
              status: String(marketplace.status ?? ''),
              exceptionReason: String(marketplace.exceptionReason ?? ''),
            }
          : null,
        supplier: {
          id: String(order.supplierUserId),
          name: supplierStoreName(company) || supplier?.name || supplier?.email || 'Fornecedor',
          email: supplier?.email ?? '',
          logoUrl: supplierLogo(company),
        },
        items: order.items,
        itemCount: Array.isArray(order.items)
          ? order.items.reduce((sum, item) => sum + dashboardItemQuantity(item as AnyRecord), 0)
          : 0,
        totals: {
          saleAmount: moneyAmount(objectFrom(order.totals).saleAmount),
          supplierAmount: amounts.supplierAmount,
          platformFee: amounts.platformFee,
          sellerChargeAmount: amounts.sellerChargeAmount,
        },
        preparationStatus: order.preparationStatus,
        shippingStatus: order.shippingStatus,
        supplierPaymentStatus: financial?.status ?? 'pending',
        supplierPaid: financial?.status === 'paid',
        financialEntryId: financial ? String(financial._id) : '',
        paidAt: financial?.paidAt ?? null,
        createdAt: rawOrder.createdAt,
      };
    });

    const supplierGroups = [
      ...items
        .reduce((groups: Map<string, any>, item) => {
          const key = String(item.supplier.id);
          const current = groups.get(key) ?? {
            supplier: item.supplier,
            orders: [],
            totals: { orders: 0, items: 0, supplierAmount: 0, paid: 0, unpaid: 0 },
          };
          current.orders.push(item);
          current.totals.orders += 1;
          current.totals.items += item.itemCount;
          current.totals.supplierAmount = moneyAmount(
            current.totals.supplierAmount + item.totals.supplierAmount,
          );
          if (item.supplierPaid) current.totals.paid += 1;
          else current.totals.unpaid += 1;
          groups.set(key, current);
          return groups;
        }, new Map<string, any>())
        .values(),
    ].sort(
      (a, b) =>
        b.totals.orders - a.totals.orders || b.totals.supplierAmount - a.totals.supplierAmount,
    );

    const totals = items.reduce(
      (acc, item) => {
        acc.orders += 1;
        acc.items += item.itemCount;
        acc.supplierAmount = moneyAmount(acc.supplierAmount + item.totals.supplierAmount);
        if (item.supplierPaid) acc.paid += 1;
        else acc.unpaid += 1;
        return acc;
      },
      { orders: 0, items: 0, supplierAmount: 0, paid: 0, unpaid: 0 },
    );

    return { date, items, supplierGroups, totals };
  }

  async sellerFinance(user: AuthUser): Promise<AnyRecord> {
    this.requireRole(user, ['seller', 'admin']);
    const entries = await this.financialEntries
      .find({ sellerUserId: user.id })
      .sort({ createdAt: -1 })
      .lean();
    return this.formatSellerFinanceEntries(entries);
  }

  async createSellerFinancePix(user: AuthUser, entryId: string): Promise<AnyRecord> {
    this.requireRole(user, ['seller', 'admin']);
    const entry = await this.financialEntries.findOne({ _id: entryId, sellerUserId: user.id });
    if (!entry) throw new NotFoundException('Lançamento financeiro não encontrado');
    if (entry.status === 'paid') {
      return this.formatSellerFinanceEntries([entry.toObject() as unknown as AnyRecord]);
    }

    const amounts = this.sellerChargeAmounts(entry.amounts);
    entry.amounts = amounts;
    entry.gateway = 'asaas';

    const pix = objectFrom(entry.pix);
    if (entry.gatewayPaymentId && hasText(pix.payload)) {
      await entry.save();
      return this.formatSellerFinanceEntries([entry.toObject() as unknown as AnyRecord]);
    }

    const externalReference = `financial:${String(entry._id)}`;
    if (!this.config.get<string>('asaas.apiKey')) {
      entry.gatewayPaymentId = `mock_${String(entry._id)}`;
      entry.gatewayCustomerId = 'mock_customer';
      entry.pix = {
        encodedImage: '',
        payload: `PIX-SIMULADO-${String(entry._id)}-${amounts.sellerChargeAmount}`,
        expirationDate: dateOnly(new Date(Date.now() + 24 * 60 * 60 * 1000)),
        invoiceUrl: '',
        mode: 'mock',
      };
      entry.status = 'awaiting_confirmation';
      entry.metadata = { ...objectFrom(entry.metadata), externalReference };
      await entry.save();
      return this.formatSellerFinanceEntries([entry.toObject() as unknown as AnyRecord]);
    }

    const seller = await this.users
      .findById(user.id, { passwordHash: 0, refreshTokenHashes: 0 })
      .lean();
    const sellerProfile = await this.sellerProfiles.findOne({ userId: user.id }).lean();
    const customerId = await this.ensureAsaasCustomer(user, seller, sellerProfile);
    const payment = await this.asaas.createPayment({
      customer: customerId,
      billingType: 'PIX',
      value: amounts.sellerChargeAmount,
      dueDate: dateOnly(),
      description: `Pagamento do pedido ${String(objectFrom(entry.metadata).externalOrderId ?? entry.supplierOrderId)} - fornecedor + taxa zycron`,
      externalReference,
    });
    const pixQrCode = await this.asaas.getPaymentPixQrCode(payment.id);

    entry.gatewayPaymentId = payment.id;
    entry.gatewayCustomerId = customerId;
    entry.proofUrl = payment.invoiceUrl ?? payment.bankSlipUrl ?? '';
    entry.pix = {
      ...pixQrCode,
      invoiceUrl: payment.invoiceUrl ?? payment.bankSlipUrl ?? '',
    };
    entry.status = 'awaiting_confirmation';
    entry.metadata = {
      ...objectFrom(entry.metadata),
      externalReference,
      asaasStatus: payment.status ?? '',
    };
    await entry.save();
    return this.formatSellerFinanceEntries([entry.toObject() as unknown as AnyRecord]);
  }

  async asaasWebhook(body: AnyRecord) {
    const payment = objectFrom(body.payment);
    const paymentId = firstText(payment, ['id']);
    const externalReference = firstText(payment, ['externalReference']);
    const status = this.statusFromAsaas(
      firstText(payment, ['status']) || firstText(body, ['event']),
    );
    const filter = paymentId
      ? { gatewayPaymentId: paymentId }
      : externalReference
        ? { 'metadata.externalReference': externalReference }
        : null;
    if (!filter) return { ok: true, ignored: true };

    const set: AnyRecord = {
      status,
      metadata: {
        event: body.event,
        asaasStatus: payment.status,
        externalReference,
      },
    };
    if (status === 'paid') set.paidAt = new Date();
    const update: AnyRecord = {
      $set: {
        ...set,
      },
    };
    await this.financialEntries.updateOne(filter, update);
    return { ok: true };
  }

  async mercadoPagoWebhook(body: AnyRecord, query: AnyRecord = {}) {
    const bodyData = objectFrom(body.data);
    const paymentId =
      firstText(query, ['data.id', 'id']) ||
      firstText(bodyData, ['id']) ||
      (firstText(body, ['type', 'topic']) === 'payment' ? firstText(body, ['id']) : '');
    if (!paymentId) return { ok: true, ignored: true };

    const payment = await this.mercadoPago.getPayment(paymentId);
    const externalReference = String(payment.external_reference ?? '');
    const status = this.statusFromMercadoPago(String(payment.status ?? ''));
    const filter = payment.id
      ? { gatewayPaymentId: String(payment.id) }
      : externalReference
        ? { 'metadata.externalReference': externalReference }
        : null;
    if (!filter) return { ok: true, ignored: true };

    const set: AnyRecord = {
      status,
      gateway: 'mercado_pago',
      metadata: {
        ...objectFrom(body),
        mercadoPagoStatus: payment.status,
        mercadoPagoStatusDetail: payment.status_detail,
        externalReference,
      },
    };
    if (status === 'paid') set.paidAt = new Date();
    await this.financialEntries.updateOne(filter, { $set: set });
    return { ok: true };
  }

  async adminDashboard(user: AuthUser) {
    this.requireRole(user, ['admin']);
    const [suppliersPending, sellersPending, exceptions, disconnected, syncPending] =
      await Promise.all([
        this.supplierProfiles.countDocuments({ approvalStatus: 'pending' }),
        this.sellerProfiles.countDocuments({ approvalStatus: 'pending' }),
        this.marketplaceOrders.countDocuments({ status: 'exception' }),
        this.users.countDocuments({ role: { $in: ['supplier', 'seller'] }, organizationId: '' }),
        this.syncJobs.countDocuments({ status: 'queued' }),
      ]);
    return { suppliersPending, sellersPending, exceptions, disconnected, syncPending };
  }

  async adminPlatformFeeRules(user: AuthUser): Promise<AnyRecord> {
    this.requireRole(user, ['admin']);
    return { rules: await this.platformFeeRules() };
  }

  async updateAdminPlatformFeeRules(user: AuthUser, body: AnyRecord): Promise<AnyRecord> {
    this.requireRole(user, ['admin']);
    const rules = this.normalizePlatformFeeRules(body.rules);
    await this.organizations.findOneAndUpdate(
      { ownerUserId: 'platform', type: 'admin' },
      {
        $setOnInsert: {
          ownerUserId: 'platform',
          type: 'admin',
          name: 'zycron',
          status: 'approved',
        },
        $set: { 'settings.platformFeeRules': rules },
      },
      { upsert: true, new: true },
    );
    await this.audit(user.id, 'platform_fee_rules.update', 'organization', 'platform');
    return { rules };
  }

  private async ensureOrganization(
    user: AuthUser,
    type: 'supplier' | 'seller' | 'admin',
    name: string,
  ) {
    return this.organizations.findOneAndUpdate(
      { ownerUserId: user.id, type },
      {
        $setOnInsert: {
          ownerUserId: user.id,
          type,
          name,
          status: type === 'admin' ? 'approved' : 'pending',
        },
      },
      { upsert: true, new: true },
    );
  }

  private requireRole(user: AuthUser, allowed: string[]) {
    if (!allowed.includes(user.role))
      throw new ForbiddenException('Perfil sem permissão para esta área.');
  }

  private supplierActivation(
    profile: Pick<SupplierProfile, 'company' | 'approvalStatus'> | null,
    originAddress: unknown,
    sellableProducts: number,
  ) {
    const company = objectFrom(profile?.company);
    const origin = objectFrom(originAddress);
    const companyData =
      hasAnyText(company, ['storeName', 'companyName', 'fantasyName', 'legalName', 'name']) &&
      hasAnyText(company, ['document', 'cnpj', 'cpf']);
    const checklist = {
      companyData,
      logo: hasAnyText(company, ['logoUrl', 'logo', 'brandLogo']),
      originAddress: hasOriginAddress(origin) || hasOriginAddress(company),
      firstProduct: sellableProducts > 0,
      adminApproved: profile?.approvalStatus === 'approved',
    };
    const items = [
      {
        key: 'companyData',
        label: 'Dados da empresa preenchidos',
        action: 'Informe nome da loja e CNPJ/CPF.',
        done: checklist.companyData,
      },
      {
        key: 'logo',
        label: 'Logo cadastrada',
        action: 'Adicione a URL da logo da marca.',
        done: checklist.logo,
      },
      {
        key: 'originAddress',
        label: 'Endereço de origem cadastrado',
        action: 'Preencha CEP, rua, cidade e UF.',
        done: checklist.originAddress,
      },
      {
        key: 'firstProduct',
        label: 'Produto ativo com estoque',
        action: 'Cadastre um produto ativo, liberado para vendedores e com estoque.',
        done: checklist.firstProduct,
      },
      {
        key: 'adminApproved',
        label: 'Conta aprovada pelo administrador',
        action: 'Aguarde aprovação do administrador.',
        done: checklist.adminApproved,
      },
    ];
    const completed = items.filter((item) => item.done).length;
    return {
      checklist,
      items,
      completed,
      total: items.length,
      isCatalogVisible: completed === items.length,
      sellableProducts,
    };
  }

  private normalizePlatformFeeRules(value: unknown): PlatformFeeRule[] {
    const rawRules = Array.isArray(value) ? value : [];
    const rules = rawRules
      .map((rule) => objectFrom(rule))
      .map((rule) => ({
        upTo: moneyAmount(rule.upTo),
        fee: moneyAmount(rule.fee),
      }))
      .filter((rule) => rule.upTo > 0 && rule.fee >= 0)
      .sort((a, b) => a.upTo - b.upTo);
    return rules.length ? rules : DEFAULT_PLATFORM_FEE_RULES;
  }

  private async platformFeeRules(): Promise<PlatformFeeRule[]> {
    const organization = await this.organizations
      .findOne({ ownerUserId: 'platform', type: 'admin' }, { settings: 1 })
      .lean();
    return this.normalizePlatformFeeRules(objectFrom(organization?.settings).platformFeeRules);
  }

  private feeFromRules(amount: number, rules: PlatformFeeRule[]): number {
    const safeAmount = moneyAmount(amount);
    const match = rules.find((rule) => safeAmount <= rule.upTo) ?? rules[rules.length - 1];
    return moneyAmount(match?.fee ?? 0);
  }

  private async platformFeeForAmount(amount: number): Promise<number> {
    return this.feeFromRules(amount, await this.platformFeeRules());
  }

  private async platformFeeForItems(items: AnyRecord[]): Promise<number> {
    const rules = await this.platformFeeRules();
    return moneyAmount(
      items.reduce((sum, item) => {
        const quantity = Math.max(1, numberFrom(item.quantity ?? item.qty, 1));
        const costPrice = moneyAmount(item.costPrice);
        return sum + this.feeFromRules(costPrice, rules) * quantity;
      }, 0),
    );
  }

  private sellerChargeAmounts(amounts: unknown) {
    const current = objectFrom(amounts);
    const supplierAmount = moneyAmount(current.supplierAmount);
    const saleAmount = moneyAmount(current.saleAmount);
    const platformFee = moneyAmount(
      current.platformFee ?? this.feeFromRules(supplierAmount, DEFAULT_PLATFORM_FEE_RULES),
    );
    return {
      ...current,
      saleAmount,
      supplierAmount,
      platformFee,
      sellerChargeAmount: moneyAmount(current.sellerChargeAmount ?? supplierAmount + platformFee),
    };
  }

  private async formatSellerFinanceEntries(entries: AnyRecord[]): Promise<AnyRecord> {
    const supplierOrderIds = entries.map((entry) => String(entry.supplierOrderId)).filter(Boolean);
    const supplierUserIds = [
      ...new Set(entries.map((entry) => String(entry.supplierUserId)).filter(Boolean)),
    ];
    const [orders, suppliers] = await Promise.all([
      this.supplierOrders.find({ _id: { $in: supplierOrderIds } }).lean(),
      this.users
        .find({ _id: { $in: supplierUserIds } }, { passwordHash: 0, refreshTokenHashes: 0 })
        .lean(),
    ]);
    const orderById = new Map(orders.map((order) => [String(order._id), order]));
    const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));
    const items = entries.map((entry) => {
      const amounts = this.sellerChargeAmounts(entry.amounts);
      const order = orderById.get(String(entry.supplierOrderId));
      const supplier = supplierById.get(String(entry.supplierUserId));
      return {
        id: String(entry._id),
        supplierOrderId: String(entry.supplierOrderId),
        externalOrderId: order?.externalOrderId ?? objectFrom(entry.metadata).externalOrderId ?? '',
        status: entry.status,
        amounts,
        supplier: supplier
          ? { id: String(supplier._id), name: supplier.name, email: supplier.email }
          : null,
        gateway: entry.gateway,
        gatewayPaymentId: entry.gatewayPaymentId,
        proofUrl: entry.proofUrl,
        pix: entry.pix ?? {},
        metadata: entry.metadata ?? {},
        createdAt: entry.createdAt,
        paidAt: entry.paidAt,
      };
    });
    const totals = items.reduce(
      (acc, item) => {
        acc.pending += item.status === 'paid' ? 0 : numberFrom(item.amounts.sellerChargeAmount);
        acc.paid += item.status === 'paid' ? numberFrom(item.amounts.sellerChargeAmount) : 0;
        acc.platformFees += numberFrom(item.amounts.platformFee);
        acc.supplierCosts += numberFrom(item.amounts.supplierAmount);
        return acc;
      },
      { pending: 0, paid: 0, platformFees: 0, supplierCosts: 0 },
    );
    return { items, totals };
  }

  private async ensureAsaasCustomer(
    user: AuthUser,
    account: AnyRecord | null,
    sellerProfile: AnyRecord | null,
  ): Promise<string> {
    const storeProfile = objectFrom(sellerProfile?.storeProfile);
    const existing = firstText(storeProfile, ['asaasCustomerId']);
    if (existing) return existing;
    const cpfCnpj = firstText(storeProfile, ['document', 'cpfCnpj', 'cnpj', 'cpf']).replace(
      /\D/g,
      '',
    );
    if (!cpfCnpj) {
      throw new BadRequestException('Informe CNPJ/CPF do vendedor antes de gerar cobrança Asaas.');
    }
    const customer = await this.asaas.createCustomer({
      name:
        firstText(storeProfile, ['storeName', 'name']) ||
        String(account?.name ?? account?.email ?? 'Vendedor'),
      cpfCnpj,
      email: String(account?.email ?? user.email),
      mobilePhone: firstText(storeProfile, ['phone', 'mobilePhone']),
      externalReference: user.id,
      notificationDisabled: false,
    });
    await this.sellerProfiles.updateOne(
      { userId: user.id },
      { $set: { 'storeProfile.asaasCustomerId': customer.id } },
    );
    return customer.id;
  }

  private statusFromAsaas(status: string): string {
    if (
      [
        'PAYMENT_RECEIVED',
        'PAYMENT_CONFIRMED',
        'RECEIVED',
        'CONFIRMED',
        'RECEIVED_IN_CASH',
      ].includes(status)
    ) {
      return 'paid';
    }
    if (
      ['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CANCELLED', 'DELETED', 'REFUNDED'].includes(
        status,
      )
    ) {
      return 'canceled';
    }
    if (['OVERDUE'].includes(status)) return 'awaiting_confirmation';
    return 'awaiting_confirmation';
  }

  private statusFromMercadoPago(status: string): string {
    if (status === 'approved') return 'paid';
    if (['cancelled', 'canceled', 'rejected'].includes(status)) return 'canceled';
    if (status === 'refunded') return 'refunded';
    if (status === 'charged_back' || status === 'in_mediation') return 'dispute';
    return 'awaiting_confirmation';
  }

  private calculatePricing(costPrice: number, pricing?: AnyRecord) {
    const platformFee = moneyAmount(pricing?.platformFee);
    const mode = String(pricing?.mode ?? (platformFee > 0 ? 'platform_fee' : 'percent'));
    const marketplaceFees = numberFrom(pricing?.marketplaceFees);
    const otherCosts = numberFrom(pricing?.otherCosts);
    const percent = numberFrom(pricing?.profitPercent, 30);
    const fixedProfit = numberFrom(pricing?.fixedProfit);
    const manualPrice = numberFrom(pricing?.manualPrice);
    const profit =
      mode === 'platform_fee'
        ? 0
        : mode === 'fixed'
          ? fixedProfit
          : mode === 'manual'
            ? manualPrice - costPrice - platformFee - marketplaceFees - otherCosts
            : costPrice * (percent / 100);
    const finalPrice =
      mode === 'manual'
        ? manualPrice
        : costPrice + platformFee + profit + marketplaceFees + otherCosts;
    return {
      mode,
      costPrice,
      platformFee,
      profit,
      profitPercent: costPrice ? (profit / costPrice) * 100 : 0,
      marketplaceFees,
      otherCosts,
      finalPrice,
      disclaimer: 'Taxas estimadas podem variar e não devem ser tratadas como valor garantido.',
    };
  }

  private async queueInventorySync(ownerUserId: string, supplierProductId: string) {
    const listings = await this.listings
      .find({ supplierProductId, status: { $in: ['published', 'pending_publication'] } })
      .lean();
    await Promise.all(
      listings.map((listing) =>
        this.syncJobs.findOneAndUpdate(
          { idempotencyKey: `inventory:${supplierProductId}:${String(listing._id)}` },
          {
            $setOnInsert: {
              idempotencyKey: `inventory:${supplierProductId}:${String(listing._id)}`,
              marketplace: listing.marketplace,
              type: 'inventory',
              ownerUserId,
              payload: { supplierProductId, listingId: String(listing._id) },
            },
          },
          { upsert: true },
        ),
      ),
    );
  }

  private async recordStockChange(
    userId: string,
    productId: string,
    quantity: number,
    balanceAfter: number,
    reason: string,
  ) {
    await this.inventoryMovements.create({
      supplierProductId: productId,
      supplierUserId: userId,
      type: quantity < 0 ? 'out' : 'in',
      quantity,
      balanceAfter,
      reason,
    });
  }

  private async reserveStock(
    supplierUserId: string,
    productId: string,
    quantity: number,
    reference: string,
  ) {
    const product = await this.supplierProducts.findOne({ _id: productId, supplierUserId });
    if (!product) return;
    product.stock = Math.max(0, product.stock - quantity);
    product.salesCount += quantity;
    await product.save();
    await this.inventoryMovements.create({
      supplierProductId: productId,
      supplierUserId,
      type: 'reserve',
      quantity: -Math.abs(quantity),
      balanceAfter: product.stock,
      reference,
      reason: 'Pedido marketplace',
    });
    await this.queueInventorySync(supplierUserId, productId);
  }

  private async notifyAdmins(title: string, message: string) {
    const admins = await this.users.find({ role: 'admin' }, { _id: 1 }).lean();
    await Promise.all(
      admins.map((admin) =>
        this.notifications.create({
          userId: String(admin._id),
          title,
          message,
          tone: 'warning',
        }),
      ),
    );
  }

  private async audit(actorUserId: string, action: string, entity: string, entityId: string) {
    await this.auditLogs.create({ actorUserId, action, entity, entityId });
    await this.integrationLogs.create({
      marketplace: 'internal',
      ownerUserId: actorUserId,
      action,
      level: 'info',
      message: `${action} executado`,
      context: { entity, entityId },
    });
  }
}
