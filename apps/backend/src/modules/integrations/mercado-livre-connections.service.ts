import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MercadoLivreApiClient, MercadoLivreTokenResult } from './mercado-livre-api.client';
import {
  MercadoLivreConnection,
  MercadoLivreConnectionDocument,
} from '../database/schemas/ml-connection.schema';
import {
  MercadoLivreOauthState,
  MercadoLivreOauthStateDocument,
} from '../database/schemas/ml-oauth-state.schema';
import { decryptToken, encryptToken } from './token-crypto.util';

/**
 * CRUD da conta Mercado Livre conectada por usuário + renovação automática do
 * access_token perto da expiração (mesmo padrão de `ShopeeConnectionsService`).
 * `client` é injetado só pelo refresh — o resto do fluxo de token vive no
 * controller (troca o `code` uma vez). access_token/refresh_token são
 * criptografados em repouso — ver `token-crypto.util.ts`.
 */
@Injectable()
export class MercadoLivreConnectionsService {
  constructor(
    @InjectModel(MercadoLivreConnection.name)
    private readonly connections: Model<MercadoLivreConnectionDocument>,
    @InjectModel(MercadoLivreOauthState.name)
    private readonly states: Model<MercadoLivreOauthStateDocument>,
    private readonly client: MercadoLivreApiClient,
    private readonly config: ConfigService,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>('security.tokenEncryptionKey') ?? '';
  }

  /** Gera `state` (CSRF) + par PKCE e salva os dois juntos — o callback só recebe `state`+`code`. */
  async createState(
    ownerId: string,
    returnTo = '/integrations',
  ): Promise<{ state: string; codeChallenge: string }> {
    const state = randomBytes(24).toString('hex');
    const { codeVerifier, codeChallenge } = this.client.generatePkcePair();
    await this.states.create({ state, ownerId, codeVerifier, returnTo, createdAt: new Date() });
    return { state, codeChallenge };
  }

  /** Resolve e apaga o state num só passo — cada state só pode ser usado uma vez. */
  async consumeState(
    state: string,
  ): Promise<{ ownerId: string; codeVerifier: string; returnTo: string } | null> {
    const doc = await this.states.findOneAndDelete({ state });
    return doc
      ? { ownerId: doc.ownerId, codeVerifier: doc.codeVerifier, returnTo: doc.returnTo }
      : null;
  }

  findByOwner(ownerId: string): Promise<MercadoLivreConnectionDocument | null> {
    return this.connections.findOne({ ownerId });
  }

  async saveTokens(ownerId: string, tokens: MercadoLivreTokenResult, nickname?: string) {
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    return this.connections.findOneAndUpdate(
      { ownerId },
      {
        $set: {
          mlUserId: tokens.mlUserId,
          accessToken: encryptToken(tokens.accessToken, this.encryptionKey),
          refreshToken: encryptToken(tokens.refreshToken, this.encryptionKey),
          expiresAt,
          scope: tokens.scope,
          ...(nickname ? { nickname } : {}),
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
  ): Promise<{ accessToken: string; mlUserId: string } | null> {
    const conn = await this.findByOwner(ownerId);
    if (!conn) return null;

    const nearExpiry = conn.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
    if (!nearExpiry) {
      return {
        accessToken: decryptToken(conn.accessToken, this.encryptionKey),
        mlUserId: conn.mlUserId,
      };
    }

    const refreshToken = decryptToken(conn.refreshToken, this.encryptionKey);
    const refreshed = await this.client.refreshAccessToken(refreshToken);
    await this.saveTokens(ownerId, refreshed);
    return { accessToken: refreshed.accessToken, mlUserId: refreshed.mlUserId };
  }
}
