import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import type { AuthUser } from '../auth/jwt.strategy';
import {
  AuditLog,
  AuditLogDocument,
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
import { ShopeeProvider } from './marketplaces/shopee.provider';

type AnyRecord = Record<string, unknown>;

function pageLimit(page?: number, limit?: number) {
  const safePage = Math.max(1, page ?? 1);
  const safeLimit = Math.min(100, Math.max(1, limit ?? 20));
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

function numberFrom(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

@Injectable()
export class DropshippingService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Organization.name) private readonly organizations: Model<OrganizationDocument>,
    @InjectModel(SupplierProfile.name)
    private readonly supplierProfiles: Model<SupplierProfileDocument>,
    @InjectModel(SellerProfile.name) private readonly sellerProfiles: Model<SellerProfileDocument>,
    @InjectModel(SupplierProduct.name)
    private readonly supplierProducts: Model<SupplierProductDocument>,
    @InjectModel(ProductListing.name) private readonly listings: Model<ProductListingDocument>,
    @InjectModel(ProductListingMapping.name)
    private readonly mappings: Model<ProductListingMappingDocument>,
    @InjectModel(MarketplaceOrder.name)
    private readonly marketplaceOrders: Model<MarketplaceOrderDocument>,
    @InjectModel(SupplierOrder.name) private readonly supplierOrders: Model<SupplierOrderDocument>,
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
      policies: Boolean(body.exchangePolicy && body.returnPolicy),
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

  async listSupplierProducts(
    user: AuthUser,
    q: { search?: string; page?: number; limit?: number },
  ) {
    this.requireRole(user, ['supplier', 'admin']);
    const { page, limit, skip } = pageLimit(q.page, q.limit);
    const filter: FilterQuery<SupplierProductDocument> = { supplierUserId: user.id };
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

  async sellerDashboard(user: AuthUser) {
    this.requireRole(user, ['seller', 'admin']);
    const [catalogAvailable, listings, orders, unread] = await Promise.all([
      this.supplierProducts.countDocuments({
        status: 'active',
        allowSellers: true,
        stock: { $gt: 0 },
      }),
      this.listings.countDocuments({ sellerUserId: user.id }),
      this.marketplaceOrders.countDocuments({ sellerUserId: user.id }),
      this.notifications.countDocuments({ userId: user.id, read: false }),
    ]);
    return { catalogAvailable, listings, orders, unread };
  }

  async catalog(
    user: AuthUser,
    q: { search?: string; category?: string; supplier?: string; page?: number; limit?: number },
  ) {
    this.requireRole(user, ['seller', 'admin']);
    const { page, limit, skip } = pageLimit(q.page, q.limit);
    const filter: FilterQuery<SupplierProductDocument> = {
      status: 'active',
      allowSellers: true,
      stock: { $gt: 0 },
    };
    if (q.category) filter.category = q.category;
    if (q.supplier) filter.supplierUserId = q.supplier;
    if (q.search) filter.$text = { $search: q.search };
    const [items, total] = await Promise.all([
      this.supplierProducts
        .find(filter)
        .sort({ salesCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.supplierProducts.countDocuments(filter),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
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
    const pricing = this.calculatePricing(product.costPrice, body.pricing as AnyRecord | undefined);
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

  async listSellerListings(user: AuthUser) {
    this.requireRole(user, ['seller', 'admin']);
    return this.listings.find({ sellerUserId: user.id }).sort({ createdAt: -1 }).lean();
  }

  async requestPublication(user: AuthUser, id: string) {
    this.requireRole(user, ['seller', 'admin']);
    const listing = await this.listings.findOne({ _id: id, sellerUserId: user.id });
    if (!listing) throw new NotFoundException('Anúncio não encontrado');
    const data = listing.listingData as AnyRecord;
    const pricing = listing.pricing as AnyRecord;
    const errors = await this.shopee.validatePublication({
      listingId: id,
      title: String(data.title ?? ''),
      description: String(data.description ?? ''),
      categoryId: String(data.categoryId ?? ''),
      images: Array.isArray(data.images) ? (data.images as string[]) : [],
      price: numberFrom(pricing.finalPrice),
      stock: numberFrom(data.stockToPublish),
      variants: listing.variants,
    });
    if (errors.length) throw new BadRequestException(errors);

    listing.status = 'pending_publication';
    await listing.save();
    await this.syncJobs.findOneAndUpdate(
      { idempotencyKey: `publication:${id}` },
      {
        $setOnInsert: {
          idempotencyKey: `publication:${id}`,
          marketplace: listing.marketplace,
          type: 'publication',
          ownerUserId: user.id,
          payload: { listingId: id },
        },
      },
      { upsert: true, new: true },
    );
    await this.audit(user.id, 'listing.publication_requested', 'marketplace_listing', id);
    return { queued: true, status: listing.status };
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
        amounts: supplierOrder.totals,
        status: 'pending',
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

  async supplierOrdersList(user: AuthUser) {
    this.requireRole(user, ['supplier', 'admin']);
    return this.supplierOrders.find({ supplierUserId: user.id }).sort({ createdAt: -1 }).lean();
  }

  async sellerOrdersList(user: AuthUser) {
    this.requireRole(user, ['seller', 'admin']);
    return this.marketplaceOrders.find({ sellerUserId: user.id }).sort({ createdAt: -1 }).lean();
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

  private calculatePricing(costPrice: number, pricing?: AnyRecord) {
    const mode = String(pricing?.mode ?? 'percent');
    const marketplaceFees = numberFrom(pricing?.marketplaceFees);
    const otherCosts = numberFrom(pricing?.otherCosts);
    const percent = numberFrom(pricing?.profitPercent, 30);
    const fixedProfit = numberFrom(pricing?.fixedProfit);
    const manualPrice = numberFrom(pricing?.manualPrice);
    const profit =
      mode === 'fixed'
        ? fixedProfit
        : mode === 'manual'
          ? manualPrice - costPrice - marketplaceFees - otherCosts
          : costPrice * (percent / 100);
    const finalPrice =
      mode === 'manual' ? manualPrice : costPrice + profit + marketplaceFees + otherCosts;
    return {
      mode,
      costPrice,
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
