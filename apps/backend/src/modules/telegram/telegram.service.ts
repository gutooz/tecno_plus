import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from '../uploads/uploads.service';
import { TelegramApi, TgMessage, TgUpdate } from './telegram-api';

interface PendingPhoto {
  fileId: string;
  mimeType: string;
}

interface AlbumReplyBuffer {
  chatId: number;
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Bot de cadastro via Telegram. Fluxo: o operador manda a(s) FOTO(s) — o bot
 * só sobe a imagem (sem título/preço) e confirma. Título, preço e o disparo
 * do pipeline acontecem depois, no site, na tela "Envio em Lote" (mesma fila
 * de quem sobe fotos pela web). Roda por long-polling — sem URL pública.
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
  /** Fotos de um mesmo álbum (media_group_id) chegam em mensagens separadas —
   * agrupa só pra mandar UMA confirmação, em vez de spamar uma por foto. */
  private readonly albumReplies = new Map<string, AlbumReplyBuffer>();
  private offset = 0;
  private running = false;
  private static readonly ALBUM_DEBOUNCE_MS = 1200;

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
      await this.ingestPhoto(chatId, photo);
      this.bumpAlbumReply(chatId, msg.media_group_id);
      return;
    }

    const text = (msg.text ?? '').trim();
    if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/ajuda')) {
      await this.sendHelp(chatId);
    }
  }

  private extractPhoto(msg: TgMessage): PendingPhoto | null {
    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1];
      return { fileId: largest.file_id, mimeType: 'image/jpeg' };
    }
    if (msg.document?.mime_type?.startsWith('image/')) {
      return { fileId: msg.document.file_id, mimeType: msg.document.mime_type };
    }
    return null;
  }

  /** Baixa a foto e sobe como produto rascunho (status "uploaded") — igual ao
   * upload pela web. Título/preço ficam para o Envio em Lote no site. */
  private async ingestPhoto(chatId: number, photo: PendingPhoto): Promise<void> {
    if (!this.api) return;
    try {
      const path = await this.api.getFilePath(photo.fileId);
      const buffer = await this.api.download(path);
      const ext = photo.mimeType.split('/')[1] ?? 'jpg';
      await this.uploads.ingest(
        this.ownerId,
        { buffer, originalName: `telegram-${Date.now()}.${ext}`, mimeType: photo.mimeType },
        false,
        'telegram',
      );
    } catch (e) {
      this.logger.error(`ingest telegram: ${String(e)}`);
      await this.api.sendMessage(chatId, `❌ Falha ao processar uma foto: ${String(e)}`);
    }
  }

  /** Junta as confirmações de um álbum (media_group_id) numa mensagem só. */
  private bumpAlbumReply(chatId: number, groupId?: string): void {
    if (!this.api) return;
    if (!groupId) {
      void this.api.sendMessage(
        chatId,
        '📸 Foto recebida! Vá no site, em <b>Envio em Lote</b>, pra colocar título e preço.',
      );
      return;
    }
    const buf: AlbumReplyBuffer = this.albumReplies.get(groupId) ?? {
      chatId,
      count: 0,
      timer: setTimeout(() => {}, 0),
    };
    clearTimeout(buf.timer);
    buf.count++;
    buf.timer = setTimeout(() => {
      this.albumReplies.delete(groupId);
      void this.api?.sendMessage(
        chatId,
        `📸 ${buf.count} fotos recebidas! Vá no site, em <b>Envio em Lote</b>, pra colocar título e preço de cada uma.`,
      );
    }, TelegramService.ALBUM_DEBOUNCE_MS);
    this.albumReplies.set(groupId, buf);
  }

  private async sendHelp(chatId: number): Promise<void> {
    if (!this.api) return;
    await this.api.sendMessage(
      chatId,
      [
        '🤖 <b>Tecno Plus — cadastro por foto</b>',
        '',
        '1) Envie a(s) <b>foto(s)</b> do(s) produto(s) — pode mandar várias de uma vez.',
        '2) Vá no site, na tela <b>Envio em Lote</b>, e coloque título e preço de cada uma.',
        '3) Ao salvar lá, a IA trata a imagem e gera a descrição automaticamente.',
      ].join('\n'),
    );
  }
}
