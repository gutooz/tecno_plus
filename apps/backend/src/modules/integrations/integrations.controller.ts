import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { ShopeeApiClient } from './shopee-api.client';
import { ShopeeConnectionsService } from './shopee-connections.service';

/**
 * Tela/API de "Integrações": status de cada canal de publicação + fluxo OAuth
 * da Shopee (única integração via API real hoje — os demais canais seguem
 * como pontos de extensão, ver ROADMAP).
 */
@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly shopeeClient: ShopeeApiClient,
    private readonly connections: ShopeeConnectionsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AuthUser) {
    const shopee = await this.connections.findByOwner(user.id);
    return {
      shopee: shopee
        ? {
            connected: true,
            shopId: shopee.shopId,
            shopName: shopee.shopName,
            expiresAt: shopee.expiresAt,
          }
        : { connected: false, configured: this.shopeeClient.configured },
    };
  }

  @Get('shopee/connect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async connectShopee(@CurrentUser() user: AuthUser) {
    if (!this.shopeeClient.configured) {
      throw new BadRequestException(
        'Integração Shopee não configurada no servidor (defina SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY/SHOPEE_REDIRECT_URL).',
      );
    }
    const state = await this.connections.createState(user.id);
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
    try {
      const ownerId = state ? await this.connections.consumeState(state) : null;
      if (!ownerId || !code || !shopId)
        throw new Error('Parâmetros de callback inválidos ou state expirado.');

      const tokens = await this.shopeeClient.exchangeCodeForToken(code, shopId);
      await this.connections.saveTokens(ownerId, tokens);

      // Busca o nome da loja pra UI — não bloqueia a conexão se falhar.
      try {
        const info = await this.shopeeClient.getShopInfo(tokens.accessToken, tokens.shopId);
        if (info.shop_name) await this.connections.saveTokens(ownerId, tokens, info.shop_name);
      } catch (e) {
        this.logger.warn(
          `Conectado, mas falhou ao buscar shop_name: ${e instanceof Error ? e.message : e}`,
        );
      }

      res.redirect(`${frontendUrl}/integrations?shopee=connected`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao conectar Shopee';
      res.redirect(
        `${frontendUrl}/integrations?shopee=error&message=${encodeURIComponent(message)}`,
      );
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
    return { orders };
  }
}
