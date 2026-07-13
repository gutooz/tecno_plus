import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from '../uploads/uploads.service';
import { parseCaption } from './caption';
import { TelegramApi, TgMessage, TgUpdate } from './telegram-api';

interface PendingPhoto {
  fileId: string;
  mimeType: string;
  at: number;
}

/**
 * Bot de cadastro via Telegram. Fluxo: o operador manda a FOTO com uma legenda
 * "título + preço" (ou manda a foto e, logo abaixo, o texto). O bot deduplica,
 * salva a imagem, cria o produto e dispara o pipeline (Gemini trata a imagem,
 * Claude gera o título final). Roda por long-polling — sem URL pública.
 *
 * NÃO inicia sozinho: o entrypoint `telegram.ts` chama `start()`. Assim o
 * mesmo AppModule serve à API e ao worker sem ninguém duplicar o polling.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly api: TelegramApi | null;
  private readonly allowed: Set<string>;
  private readonly ownerId: string;
  private readonly pending = new Map<number, PendingPhoto>();
  private offset = 0;
  private running = false;
  private static readonly PENDING_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {
    const token = this.config.get<string>('telegram.botToken') ?? '';
    this.api = token ? new TelegramApi(token) : null;
    this.allowed = new Set(this.config.get<string[]>('telegram.allowedChatIds') ?? []);
    this.ownerId = this.config.get<string>('telegram.ownerId') ?? 'bras';
  }

  async start(): Promise<void> {
    if (!this.api) {
      this.logger.error('TELEGRAM_BOT_TOKEN ausente — bot não iniciado.');
      return;
    }
    this.running = true;
    this.logger.log(
      `Bot Telegram ativo (long-polling). IDs autorizados: ${[...this.allowed].join(', ') || '(nenhum!)'}`,
    );
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running && this.api) {
      try {
        const updates = await this.api.getUpdates(this.offset, 30);
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) => this.logger.error(`handle: ${String(e)}`));
        }
      } catch (err) {
        this.logger.warn(`getUpdates falhou: ${String(err)} — retry em 3s`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  private async handle(update: TgUpdate): Promise<void> {
    const msg = update.message;
    if (!msg || !this.api) return;

    const chatId = msg.chat.id;
    if (!this.allowed.has(String(chatId))) {
      await this.api.sendMessage(chatId, `⛔ Chat não autorizado. Seu ID: <code>${chatId}</code>`);
      return;
    }

    const photo = this.extractPhoto(msg);
    if (photo) {
      const caption = (msg.caption ?? '').trim();
      if (caption) {
        await this.register(chatId, photo.fileId, photo.mimeType, caption);
      } else {
        this.pending.set(chatId, { ...photo, at: Date.now() });
        await this.api.sendMessage(
          chatId,
          '📸 Foto recebida! Agora envie o <b>título</b> e o <b>preço pago</b>.\nEx.: <i>Copo térmico 502ml 16</i>',
        );
      }
      return;
    }

    const text = (msg.text ?? '').trim();
    if (!text) return;

    if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/ajuda')) {
      await this.sendHelp(chatId);
      return;
    }

    const pend = this.pending.get(chatId);
    if (pend && Date.now() - pend.at < TelegramService.PENDING_TTL_MS) {
      this.pending.delete(chatId);
      await this.register(chatId, pend.fileId, pend.mimeType, text);
    } else {
      this.pending.delete(chatId);
      await this.api.sendMessage(
        chatId,
        '📷 Envie a <b>foto</b> primeiro; depois o título e o preço (ou já na legenda).',
      );
    }
  }

  private extractPhoto(msg: TgMessage): { fileId: string; mimeType: string } | null {
    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1];
      return { fileId: largest.file_id, mimeType: 'image/jpeg' };
    }
    if (msg.document?.mime_type?.startsWith('image/')) {
      return { fileId: msg.document.file_id, mimeType: msg.document.mime_type };
    }
    return null;
  }

  private async register(
    chatId: number,
    fileId: string,
    mimeType: string,
    caption: string,
  ): Promise<void> {
    if (!this.api) return;
    const { title, price } = parseCaption(caption);

    if (!title || title === 'Produto') {
      await this.api.sendMessage(chatId, '⚠️ Não entendi o título. Reenvie: <i>Título Preço</i>.');
      return;
    }

    let buffer: Buffer;
    try {
      const path = await this.api.getFilePath(fileId);
      buffer = await this.api.download(path);
    } catch (e) {
      await this.api.sendMessage(chatId, `❌ Falha ao baixar a foto: ${String(e)}`);
      return;
    }

    try {
      const result = await this.uploads.ingestWithData({
        ownerId: this.ownerId,
        buffer,
        mimeType,
        name: title,
        purchasePrice: price,
        source: 'telegram',
      });

      if (result.duplicate) {
        await this.api.sendMessage(
          chatId,
          `⚠️ <b>Já cadastrado</b> — "${escapeHtml(result.existing.name)}" (${result.existing.internalSku}). Produto repetido ignorado.`,
        );
        return;
      }

      const priceTxt = price > 0 ? `R$ ${price.toFixed(2).replace('.', ',')}` : 'sem preço';
      await this.api.sendMessage(
        chatId,
        `✅ <b>Cadastrado!</b>\n📦 ${escapeHtml(title)}\n💰 Compra: ${priceTxt}\n🔖 ${result.internalSku}\n⏳ Processando imagem e gerando o anúncio…`,
      );
    } catch (e) {
      this.logger.error(`ingest telegram: ${String(e)}`);
      await this.api.sendMessage(chatId, `❌ Erro ao cadastrar: ${String(e)}`);
    }
  }

  private async sendHelp(chatId: number): Promise<void> {
    if (!this.api) return;
    await this.api.sendMessage(
      chatId,
      [
        '🤖 <b>Tecno Plus — cadastro por foto</b>',
        '',
        '1) Envie a <b>foto</b> do produto.',
        '2) Na <b>legenda</b> (ou logo abaixo) escreva o <b>título</b> e o <b>preço pago</b>.',
        '',
        'Exemplos:',
        '• <i>Copo térmico 502ml 16</i>',
        '• <i>Kit de facas 3 peças R$ 25,90</i>',
        '• <i>Garrafa Stitch 500ml - 10</i>',
        '',
        'Produtos repetidos (mesmo título ou mesma foto) são bloqueados automaticamente.',
      ].join('\n'),
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
