import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { ShopeeApiClient, ShopeeStoreProductPatch } from './shopee-api.client';
import { ShopeeConnectionsService } from './shopee-connections.service';
import { MercadoLivreApiClient } from './mercado-livre-api.client';
import { MercadoLivreConnectionsService } from './mercado-livre-connections.service';
import { IntegrationLog, IntegrationLogDocument } from '../database/schemas/dropshipping.schema';

/**
 * Tela/API de "Integrações": status de cada canal de publicação + fluxo OAuth
 * da Shopee e do Mercado Livre (integrações via API real hoje — os demais
 * canais seguem como pontos de extensão, ver ROADMAP).
 */
@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly shopeeClient: ShopeeApiClient,
    private readonly connections: ShopeeConnectionsService,
    private readonly mlClient: MercadoLivreApiClient,
    private readonly mlConnections: MercadoLivreConnectionsService,
    private readonly config: ConfigService,
    @InjectModel(IntegrationLog.name)
    private readonly integrationLogs: Model<IntegrationLogDocument>,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AuthUser) {
    const shopee = await this.connections.findByOwner(user.id);
    const mercadoLivre = await this.mlConnections.findByOwner(user.id);
    return {
      shopee: shopee
        ? {
            connected: true,
            shopId: shopee.shopId,
            shopName: shopee.shopName,
            expiresAt: shopee.expiresAt,
            status: shopee.status,
            region: shopee.region,
            lastSyncAt: shopee.lastSyncAt,
            recentErrors: shopee.recentErrors,
            config: this.shopeeClient.publicConfig(),
          }
        : { connected: false, ...this.shopeeClient.publicConfig() },
      mercadoLivre: mercadoLivre
        ? {
            connected: true,
            mlUserId: mercadoLivre.mlUserId,
            nickname: mercadoLivre.nickname,
            expiresAt: mercadoLivre.expiresAt,
            config: this.mlClient.publicConfig(),
          }
        : { connected: false, ...this.mlClient.publicConfig() },
    };
  }

  @Get('shopee/connect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async connectShopee(@CurrentUser() user: AuthUser, @Query('returnTo') returnTo?: string) {
    if (!this.shopeeClient.configured) {
      throw new BadRequestException(
        'Integração Shopee não configurada no servidor (defina SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY/SHOPEE_REDIRECT_URL).',
      );
    }
    const state = await this.connections.createState(user.id, this.shopeeReturnTo(returnTo));
    return { url: this.shopeeClient.buildAuthorizationUrl(state) };
  }

  /**
   * Shopee redireciona o NAVEGADOR do lojista pra cá após o login+aceite —
   * por isso esta rota não tem JwtAuthGuard (não há Authorization header
   * nesse redirect); a identidade do usuário vem do `state` assinado em
   * `connectShopee`, consumido uma única vez.
   */
  @Get('shopee/callback')
  async shopeeCallback(
    @Query('code') code: string,
    @Query('shop_id') shopId: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = (this.config.get<string[]>('security.corsOrigin') ?? [])[0] ?? '/';
    let returnTo = '/integrations';
    try {
      const consumed = state ? await this.connections.consumeState(state) : null;
      returnTo = this.shopeeReturnTo(consumed?.returnTo);
      if (!consumed?.ownerId || !code || !shopId)
        throw new Error('Parâmetros de callback inválidos ou state expirado.');

      const tokens = await this.shopeeClient.exchangeCodeForToken(code, shopId);
      await this.connections.saveTokens(consumed.ownerId, tokens);

      // Busca o nome da loja pra UI — não bloqueia a conexão se falhar.
      try {
        const info = await this.shopeeClient.getShopInfo(tokens.accessToken, tokens.shopId);
        if (info.shop_name)
          await this.connections.saveTokens(consumed.ownerId, tokens, info.shop_name);
      } catch (e) {
        this.logger.warn(
          `Conectado, mas falhou ao buscar shop_name: ${e instanceof Error ? e.message : e}`,
        );
      }

      res.redirect(this.frontendRedirect(frontendUrl, returnTo, { shopee: 'connected' }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao conectar Shopee';
      res.redirect(this.frontendRedirect(frontendUrl, returnTo, { shopee: 'error', message }));
    }
  }

  @Post('shopee/disconnect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async disconnectShopee(@CurrentUser() user: AuthUser) {
    await this.connections.disconnect(user.id);
    return { ok: true };
  }

  /** Prova viva de que a integração funciona: consulta dados reais da loja conectada. */
  @Get('shopee/test')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async testShopee(@CurrentUser() user: AuthUser) {
    const auth = await this.connections.getValidAccessToken(user.id);
    if (!auth) throw new BadRequestException('Nenhuma loja Shopee conectada.');
    const shop = await this.shopeeClient.getShopInfo(auth.accessToken, auth.shopId);
    return { ok: true, shop };
  }

  /** Pedidos reais recentes da loja conectada — demonstra leitura funcional via API. */
  @Get('shopee/orders')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async shopeeOrders(@CurrentUser() user: AuthUser) {
    const auth = await this.connections.getValidAccessToken(user.id);
    if (!auth) throw new BadRequestException('Nenhuma loja Shopee conectada.');
    const orders = await this.shopeeClient.getRecentOrders(auth.accessToken, auth.shopId);
    await this.connections.recordSync(auth.shopId);
    return { orders };
  }

  @Get('shopee/products')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async shopeeProducts(
    @CurrentUser() user: AuthUser,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('status') statusParam?: string,
    @Query('search') search?: string,
  ) {
    const auth = await this.connections.getValidAccessToken(user.id);
    if (!auth) throw new BadRequestException('Nenhuma loja Shopee conectada.');
    const page = Math.max(Number(pageParam) || 1, 1);
    const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);
    const status = this.shopeeProductStatus(statusParam);
    const result = await this.shopeeClient.getStoreProducts(auth.accessToken, auth.shopId, {
      offset: (page - 1) * limit,
      pageSize: limit,
      status,
    });
    const normalizedSearch = search?.trim().toLowerCase();
    const items = normalizedSearch
      ? result.items.filter((item) =>
          [item.itemName, item.sku, item.itemId, item.categoryName]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
        )
      : result.items;
    await this.connections.recordSync(auth.shopId);
    return {
      items,
      total: normalizedSearch ? items.length : result.total,
      page,
      limit,
      pages: Math.max(Math.ceil((normalizedSearch ? items.length : result.total) / limit), 1),
      hasNextPage: normalizedSearch ? false : result.hasNextPage,
      status,
    };
  }

  @Get('shopee/products/:itemId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async shopeeProduct(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    const auth = await this.connections.getValidAccessToken(user.id);
    if (!auth) throw new BadRequestException('Nenhuma loja Shopee conectada.');
    const [item] = await this.shopeeClient.getStoreProductBaseInfo(auth.accessToken, auth.shopId, [
      Number(itemId),
    ]);
    if (!item?.itemId) throw new BadRequestException('Produto Shopee nao encontrado.');
    await this.connections.recordSync(auth.shopId);
    return { item };
  }

  @Patch('shopee/products/:itemId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async updateShopeeProduct(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() body: ShopeeStoreProductPatch,
  ) {
    const auth = await this.connections.getValidAccessToken(user.id);
    if (!auth) throw new BadRequestException('Nenhuma loja Shopee conectada.');
    const patch = this.cleanShopeeProductPatch(body);
    if (!Object.keys(patch).length) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }
    await this.shopeeClient.updateStoreProduct(auth.accessToken, auth.shopId, itemId, patch);
    const [item] = await this.shopeeClient.getStoreProductBaseInfo(auth.accessToken, auth.shopId, [
      Number(itemId),
    ]);
    await this.connections.recordSync(auth.shopId);
    return { ok: true, item };
  }

  @Post('shopee/products/:itemId/listing')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async setShopeeProductListing(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body('listed') listed?: boolean,
  ) {
    const auth = await this.connections.getValidAccessToken(user.id);
    if (!auth) throw new BadRequestException('Nenhuma loja Shopee conectada.');
    await this.shopeeClient.setStoreProductListed(
      auth.accessToken,
      auth.shopId,
      itemId,
      Boolean(listed),
    );
    await this.connections.recordSync(auth.shopId);
    return { ok: true };
  }

  @Delete('shopee/products/:itemId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async deleteShopeeProduct(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    const auth = await this.connections.getValidAccessToken(user.id);
    if (!auth) throw new BadRequestException('Nenhuma loja Shopee conectada.');
    await this.shopeeClient.deleteStoreProduct(auth.accessToken, auth.shopId, itemId);
    await this.connections.recordSync(auth.shopId);
    return { ok: true };
  }

  @Get('shopee/config')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  shopeeConfig() {
    return this.shopeeClient.publicConfig();
  }

  @Post('shopee/webhook')
  async shopeeWebhook(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const shopId = String(body.shop_id ?? body.shopId ?? body.shopid ?? '');
    const action = String(body.code ?? body.action ?? body.type ?? 'webhook');
    await this.integrationLogs.create({
      marketplace: 'shopee',
      ownerUserId: shopId || 'unknown',
      action,
      level: 'info',
      message: 'Evento recebido da Shopee Open Platform.',
      context: {
        shopId,
        headers: this.safeHeaders(headers),
        payloadKeys: Object.keys(body),
      },
    });
    if (shopId) await this.connections.recordSync(shopId);
    return { ok: true };
  }

  @Post('shopee/deauthorization')
  async shopeeDeauthorization(@Body() body: Record<string, unknown>) {
    const shopId = String(body.shop_id ?? body.shopId ?? body.shopid ?? '');
    if (shopId) await this.connections.markShopRevoked(shopId);
    await this.integrationLogs.create({
      marketplace: 'shopee',
      ownerUserId: shopId || 'unknown',
      action: 'deauthorization',
      level: 'warning',
      message: 'Loja Shopee desautorizou o aplicativo.',
      context: { shopId, payloadKeys: Object.keys(body) },
    });
    return { ok: true };
  }

  @Get('mercado-livre/connect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async connectMercadoLivre(@CurrentUser() user: AuthUser, @Query('returnTo') returnTo?: string) {
    if (!this.mlClient.configured) {
      throw new BadRequestException(
        'Integração Mercado Livre não configurada no servidor (defina MERCADO_LIVRE_CLIENT_ID/MERCADO_LIVRE_CLIENT_SECRET/MERCADO_LIVRE_REDIRECT_URI).',
      );
    }
    const { state, codeChallenge } = await this.mlConnections.createState(
      user.id,
      this.marketplaceReturnTo(returnTo),
    );
    return { url: this.mlClient.buildAuthorizationUrl(state, codeChallenge) };
  }

  /**
   * O Mercado Livre redireciona o NAVEGADOR do vendedor pra cá após o
   * login+aceite — por isso esta rota não tem JwtAuthGuard (não há
   * Authorization header nesse redirect); a identidade do usuário vem do
   * `state` gerado em `connectMercadoLivre`, consumido uma única vez (e que
   * também carrega o `code_verifier` do PKCE).
   */
  @Get('mercado-livre/callback')
  async mercadoLivreCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = (this.config.get<string[]>('security.corsOrigin') ?? [])[0] ?? '/';
    let returnTo = '/integrations';
    try {
      const consumed = state ? await this.mlConnections.consumeState(state) : null;
      returnTo = this.marketplaceReturnTo(consumed?.returnTo);
      if (!consumed || !code)
        throw new Error('Parâmetros de callback inválidos ou state expirado.');

      const tokens = await this.mlClient.exchangeCodeForToken(code, consumed.codeVerifier);
      await this.mlConnections.saveTokens(consumed.ownerId, tokens);

      // Busca o nickname da conta pra UI — não bloqueia a conexão se falhar.
      try {
        const info = await this.mlClient.getUserInfo(tokens.accessToken);
        if (info.nickname)
          await this.mlConnections.saveTokens(consumed.ownerId, tokens, info.nickname);
      } catch (e) {
        this.logger.warn(
          `Conectado, mas falhou ao buscar nickname: ${e instanceof Error ? e.message : e}`,
        );
      }

      res.redirect(this.frontendRedirect(frontendUrl, returnTo, { ml: 'connected' }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao conectar Mercado Livre';
      res.redirect(this.frontendRedirect(frontendUrl, returnTo, { ml: 'error', message }));
    }
  }

  @Post('mercado-livre/disconnect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async disconnectMercadoLivre(@CurrentUser() user: AuthUser) {
    await this.mlConnections.disconnect(user.id);
    return { ok: true };
  }

  /** Prova viva de que a integração funciona: consulta dados reais da conta conectada. */
  @Get('mercado-livre/test')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async testMercadoLivre(@CurrentUser() user: AuthUser) {
    const auth = await this.mlConnections.getValidAccessToken(user.id);
    if (!auth) throw new BadRequestException('Nenhuma conta Mercado Livre conectada.');
    const account = await this.mlClient.getUserInfo(auth.accessToken);
    return { ok: true, account };
  }

  private safeHeaders(headers: Record<string, string | string[] | undefined>) {
    const allowed = ['content-type', 'user-agent', 'x-request-id'];
    return Object.fromEntries(
      Object.entries(headers)
        .filter(([key]) => allowed.includes(key.toLowerCase()))
        .map(([key, value]) => [key, value]),
    );
  }

  private shopeeReturnTo(returnTo?: string | null) {
    if (returnTo?.startsWith('/admin/shopee')) return '/admin/shopee';
    if (returnTo?.startsWith('/seller/store')) return '/seller/store';
    if (returnTo?.startsWith('/seller')) return '/seller';
    return '/integrations';
  }

  private marketplaceReturnTo(returnTo?: string | null) {
    if (returnTo?.startsWith('/admin/mercado-livre')) return '/admin/mercado-livre';
    return '/integrations';
  }

  private shopeeProductStatus(status?: string | null) {
    const allowed = ['NORMAL', 'BANNED', 'UNLIST', 'REVIEWING', 'SELLER_DELETE', 'SHOPEE_DELETE'];
    const normalized = String(status || 'NORMAL').toUpperCase();
    return allowed.includes(normalized) ? normalized : 'NORMAL';
  }

  private cleanShopeeProductPatch(body: ShopeeStoreProductPatch): ShopeeStoreProductPatch {
    const patch: ShopeeStoreProductPatch = {};
    if (typeof body.itemName === 'string' && body.itemName.trim()) {
      patch.itemName = body.itemName.trim();
    }
    if (typeof body.description === 'string' && body.description.trim()) {
      patch.description = body.description.trim();
    }
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0) throw new BadRequestException('Preco invalido.');
      patch.price = price;
    }
    if (body.stock !== undefined) {
      const stock = Number(body.stock);
      if (!Number.isFinite(stock) || stock < 0) throw new BadRequestException('Estoque invalido.');
      patch.stock = Math.floor(stock);
    }
    if (body.weight !== undefined) {
      const weight = Number(body.weight);
      if (!Number.isFinite(weight) || weight <= 0) throw new BadRequestException('Peso invalido.');
      patch.weight = weight;
    }
    return patch;
  }

  private frontendRedirect(frontendUrl: string, path: string, params: Record<string, string>) {
    const base = frontendUrl.replace(/\/+$/, '');
    return `${base}${path}?${new URLSearchParams(params).toString()}`;
  }
}
