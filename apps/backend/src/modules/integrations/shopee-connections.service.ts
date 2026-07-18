import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { ShopeeApiClient, ShopeeTokenResult } from './shopee-api.client';
import {
  ShopeeConnection,
  ShopeeConnectionDocument,
} from '../database/schemas/shopee-connection.schema';
import {
  ShopeeOauthState,
  ShopeeOauthStateDocument,
} from '../database/schemas/shopee-oauth-state.schema';

/**
 * CRUD da loja Shopee conectada por usuário + renovação automática do
 * access_token perto da expiração. `client` é injetado só pelo refresh —
 * o resto do fluxo de token vive no controller (troca o `code` uma vez).
 */
@Injectable()
export class ShopeeConnectionsService {
  constructor(
    @InjectModel(ShopeeConnection.name)
    private readonly connections: Model<ShopeeConnectionDocument>,
    @InjectModel(ShopeeOauthState.name) private readonly states: Model<ShopeeOauthStateDocument>,
    private readonly client: ShopeeApiClient,
  ) {}

  async createState(ownerId: string): Promise<string> {
    const state = randomBytes(24).toString('hex');
    await this.states.create({ state, ownerId, createdAt: new Date() });
    return state;
  }

  /** Resolve e apaga o state num só passo — cada state só pode ser usado uma vez. */
  async consumeState(state: string): Promise<string | null> {
    const doc = await this.states.findOneAndDelete({ state });
    return doc?.ownerId ?? null;
  }

  findByOwner(ownerId: string): Promise<ShopeeConnectionDocument | null> {
    return this.connections.findOne({ ownerId });
  }

  async saveTokens(ownerId: string, tokens: ShopeeTokenResult, shopName?: string) {
    const expiresAt = new Date(Date.now() + tokens.expireIn * 1000);
    return this.connections.findOneAndUpdate(
      { ownerId },
      {
        $set: {
          shopId: tokens.shopId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt,
          ...(shopName ? { shopName } : {}),
        },
      },
      { upsert: true, new: true },
    );
  }

  async disconnect(ownerId: string): Promise<void> {
    await this.connections.deleteOne({ ownerId });
  }

  /**
   * Garante um access_token válido, renovando com folga de 5min antes da
   * expiração real (evita corrida em publicações concorrentes perto do limite).
   */
  async getValidAccessToken(
    ownerId: string,
  ): Promise<{ accessToken: string; shopId: string } | null> {
    const conn = await this.findByOwner(ownerId);
    if (!conn) return null;

    const nearExpiry = conn.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
    if (!nearExpiry) return { accessToken: conn.accessToken, shopId: conn.shopId };

    const refreshed = await this.client.refreshAccessToken(conn.refreshToken, conn.shopId);
    await this.saveTokens(ownerId, refreshed);
    return { accessToken: refreshed.accessToken, shopId: refreshed.shopId };
  }
}
