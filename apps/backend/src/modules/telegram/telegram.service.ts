import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { User, UserDocument } from '../database/schemas/user.schema';
import { UploadsService } from '../uploads/uploads.service';
import { SocialApprovalService } from '../social/social.service';
import { DropshippingService } from '../dropshipping/dropshipping.service';
import { TelegramApi, TgCallbackQuery, TgMessage, TgUpdate } from './telegram-api';

interface PendingPhoto {
  fileId: string;
  mimeType: string;
}

interface AlbumReplyBuffer {
  chatId: number;
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

interface AlbumPhotoBuffer {
  chatId: number;
  photos: PendingPhoto[];
  timer: ReturnType<typeof setTimeout>;
}

type PhotoIngestOutcome = 'created' | 'duplicate' | 'failed';

type FlowStep =
  'awaiting_mode' | 'awaiting_photo' | 'awaiting_caption' | 'awaiting_price' | 'awaiting_weight';

/** Estado do cadastro individual guiado por chat (foto → legenda → preço → peso). */
interface FlowSession {
  step: FlowStep;
  photo?: PendingPhoto;
  caption?: string;
  price?: number;
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
  private readonly configuredOwnerId: string;
  private warnedInvalidOwner = false;
  /** Fotos de um mesmo álbum (media_group_id) chegam em mensagens separadas —
   * agrupa só pra mandar UMA confirmação, em vez de spamar uma por foto. */
  private readonly albumReplies = new Map<string, AlbumReplyBuffer>();
  /** Álbuns do Telegram no fluxo admin: várias fotos juntas = um produto com referências. */
  private readonly albumPhotos = new Map<string, AlbumPhotoBuffer>();
  /** chatId aguardando o PRÓXIMO texto como nova legenda do post social (fluxo "Editar"). */
  private readonly editingCaption = new Map<number, string>();
  /** chatId em cadastro individual guiado (saudação "oi" → lote/individual → foto/legenda/preço/peso). */
  private readonly flows = new Map<number, FlowSession>();
  private offset = 0;
  private running = false;
  private static readonly ALBUM_DEBOUNCE_MS = 1200;
  private static readonly GREETING_RE =
    /^(oi+|ol[aá]+|opa|e a[ií]|eae|bom dia|boa tarde|boa noite)[!.?\s]*$/i;

  constructor(
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
    private readonly social: SocialApprovalService,
    private readonly dropshipping: DropshippingService,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {
    const token = this.config.get<string>('telegram.botToken') ?? '';
    this.api = token ? new TelegramApi(token) : null;
    this.allowed = new Set(this.config.get<string[]>('telegram.allowedChatIds') ?? []);
    this.configuredOwnerId = this.config.get<string>('telegram.ownerId')?.trim() ?? '';
  }

  async start(): Promise<boolean> {
    if (!this.api) {
      this.logger.error('TELEGRAM_BOT_TOKEN ausente — bot não iniciado.');
      return false;
    }
    this.running = true;
    this.logger.log(
      `Bot Telegram ativo (long-polling). IDs autorizados: ${[...this.allowed].join(', ') || '(nenhum!)'}`,
    );
    void this.loop();
    return true;
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
    if (!this.api) return;

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg) return;

    const chatId = msg.chat.id;
    const chatIdStr = String(chatId);
    const rawText = (msg.text ?? '').trim();

    // "/vincular <código>" liga este chat a um fornecedor — funciona mesmo
    // fora da allowlist fixa do admin, é assim que um chat novo se autoriza.
    const linkMatch = rawText.match(/^\/?vincular(?:@\w+)?\s+(\S+)$/i);
    if (linkMatch) {
      await this.handleSupplierLink(chatId, linkMatch[1]);
      return;
    }

    if (!this.allowed.has(chatIdStr)) {
      const supplier = await this.dropshipping.findSupplierByTelegramChat(chatIdStr);
      if (supplier) {
        await this.handleSupplierChat(chatId, msg);
        return;
      }
      await this.api.sendMessage(chatId, `⛔ Chat não autorizado. Seu ID: <code>${chatId}</code>`);
      return;
    }

    const photo = this.extractPhoto(msg);
    if (photo) {
      const flow = this.flows.get(chatId);
      if (flow?.step === 'awaiting_photo') {
        flow.photo = photo;
        flow.step = 'awaiting_caption';
        await this.api.sendMessage(chatId, '✍️ Qual a <b>legenda</b> (nome) do produto?');
        return;
      }
      if (msg.media_group_id) {
        this.bumpAlbumPhoto(chatId, msg.media_group_id, photo);
        return;
      }

      const outcome = await this.ingestPhoto(chatId, photo);
      if (outcome === 'created') {
        this.bumpAlbumReply(chatId, msg.media_group_id, {
          single:
            '📸 Foto recebida! Já estou criando o produto com IA, tratando as imagens e sugerindo preço. Depois revise em <b>Produtos</b>.',
          plural: (n) =>
            `📸 ${n} fotos recebidas! Já estou criando os produtos com IA, tratando as imagens e sugerindo preço. Depois revise em <b>Produtos</b>.`,
        });
      }
      return;
    }

    const text = rawText;

    const editingProductId = this.editingCaption.get(chatId);
    if (editingProductId && text) {
      this.editingCaption.delete(chatId);
      await this.social.setCaption(editingProductId, text);
      await this.api.sendMessage(
        chatId,
        '✅ Legenda atualizada — confira o post acima e aprove ou rejeite.',
      );
      return;
    }

    if (text === '/cancelar') {
      this.flows.delete(chatId);
      await this.api.sendMessage(chatId, '❌ Cadastro cancelado.');
      return;
    }

    const flow = this.flows.get(chatId);
    if (flow && text && (await this.handleFlowText(chatId, flow, text))) {
      return;
    }

    if (TelegramService.GREETING_RE.test(text)) {
      this.flows.set(chatId, { step: 'awaiting_mode' });
      await this.api.sendMessage(chatId, 'Oi! Quer enviar em <b>lote</b> ou <b>individual</b>?', {
        inline_keyboard: [
          [
            { text: '🗂 Em lote', callback_data: 'flowmode:lote' },
            { text: '🖼 Individual', callback_data: 'flowmode:individual' },
          ],
        ],
      });
      return;
    }

    if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/ajuda')) {
      await this.sendHelp(chatId);
    }
  }

  /** Trata o texto quando o chat está no meio do fluxo guiado. Devolve `true` se consumiu a mensagem. */
  private async handleFlowText(chatId: number, flow: FlowSession, text: string): Promise<boolean> {
    if (!this.api) return false;

    if (flow.step === 'awaiting_mode') {
      await this.api.sendMessage(
        chatId,
        'Toque em um dos botões acima: <b>Em lote</b> ou <b>Individual</b>.',
      );
      return true;
    }

    if (flow.step === 'awaiting_caption') {
      flow.caption = text;
      flow.step = 'awaiting_price';
      await this.api.sendMessage(chatId, '💰 Qual o <b>preço</b> (R$)?');
      return true;
    }

    if (flow.step === 'awaiting_price') {
      const price = this.parseNumber(text);
      if (price == null) {
        await this.api.sendMessage(chatId, '⚠️ Preço inválido. Digite só o número, ex: 49.90');
        return true;
      }
      flow.price = price;
      flow.step = 'awaiting_weight';
      await this.api.sendMessage(chatId, '⚖️ Qual o <b>peso</b> (kg)?');
      return true;
    }

    if (flow.step === 'awaiting_weight') {
      const weight = this.parseNumber(text);
      if (weight == null) {
        await this.api.sendMessage(chatId, '⚠️ Peso inválido. Digite só o número, ex: 0.35');
        return true;
      }
      this.flows.delete(chatId);
      await this.finishIndividual(chatId, flow, weight);
      return true;
    }

    return false;
  }

  private parseNumber(text: string): number | null {
    const cleaned = text
      .trim()
      .replace(/[^\d.,]/g, '')
      .replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Fecha o cadastro individual: baixa a foto e chama o ingest com legenda+preço+peso já prontos. */
  private async finishIndividual(chatId: number, flow: FlowSession, weight: number): Promise<void> {
    if (!this.api || !flow.photo || !flow.caption || flow.price == null) return;
    try {
      await this.api.sendMessage(chatId, '⏳ Baixando foto e cadastrando produto…');
      const path = await this.api.getFilePath(flow.photo.fileId);
      const buffer = await this.api.download(path);
      const ownerId = await this.resolveOwnerId();
      const result = await this.uploads.ingestWithData({
        ownerId,
        buffer,
        mimeType: flow.photo.mimeType,
        name: flow.caption,
        purchasePrice: flow.price,
        weight,
        source: 'telegram',
      });

      if (result.duplicate) {
        await this.api.sendMessage(
          chatId,
          `⚠️ Já existe um produto parecido: <b>${result.existing.name}</b> (${result.existing.internalSku}). Não cadastrei de novo.`,
        );
        return;
      }

      await this.api.sendMessage(
        chatId,
        `✅ Produto <b>${flow.caption}</b> cadastrado (${result.internalSku})! A IA já está tratando a foto e gerando a descrição — vai aparecer em <b>Produtos</b> em instantes.`,
      );
    } catch (e) {
      this.logger.error(`cadastro individual: ${String(e)}`);
      await this.api.sendMessage(chatId, `❌ Falha ao cadastrar: ${String(e)}`);
    }
  }

  /** Roteia os botões Aprovar/Editar/Rejeitar do rascunho de divulgação social. */
  private async handleCallback(query: TgCallbackQuery): Promise<void> {
    if (!this.api) return;
    const chatId = query.message?.chat.id;
    const data = query.data ?? '';
    if (chatId === undefined || !this.allowed.has(String(chatId))) {
      await this.api.answerCallbackQuery(query.id, '⛔ Não autorizado.');
      return;
    }

    if (data === 'flowmode:lote' || data === 'flowmode:individual') {
      await this.api.answerCallbackQuery(query.id);
      await this.handleModeChoice(chatId, data === 'flowmode:individual');
      return;
    }

    const [action, productId] = data.split(':');
    if (!productId || !['social_approve', 'social_edit', 'social_reject'].includes(action)) {
      await this.api.answerCallbackQuery(query.id);
      return;
    }

    try {
      if (action === 'social_approve') {
        await this.api.answerCallbackQuery(query.id, 'Publicando…');
        await this.social.approve(productId);
      } else if (action === 'social_reject') {
        await this.api.answerCallbackQuery(query.id, 'Rejeitado.');
        await this.social.reject(productId);
      } else {
        this.editingCaption.set(chatId, productId);
        await this.api.answerCallbackQuery(query.id);
        await this.api.sendMessage(
          chatId,
          '✏️ Envie o novo texto do post (será a próxima mensagem).',
        );
      }
    } catch (e) {
      this.logger.error(`callback social (${action}): ${String(e)}`);
      await this.api.sendMessage(chatId, `❌ Erro: ${String(e)}`);
    }
  }

  /** Resposta aos botões "Em lote" / "Individual" da saudação. */
  private async handleModeChoice(chatId: number, individual: boolean): Promise<void> {
    if (!this.api) return;
    if (!individual) {
      this.flows.delete(chatId);
      await this.api.sendMessage(
        chatId,
        '🗂 Modo <b>lote</b>. Envie a(s) foto(s) do(s) produto(s) — pode mandar várias de uma vez. Eu já crio os produtos com IA, trato as imagens e deixo tudo para revisão em <b>Produtos</b>.',
      );
      return;
    }
    this.flows.set(chatId, { step: 'awaiting_photo' });
    await this.api.sendMessage(chatId, '🖼 Modo <b>individual</b>. Envie a foto do produto.');
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

  /** Baixa a foto e cria o produto já no pipeline de IA. */
  private async ingestPhoto(chatId: number, photo: PendingPhoto): Promise<PhotoIngestOutcome> {
    if (!this.api) return 'failed';
    try {
      const path = await this.api.getFilePath(photo.fileId);
      const buffer = await this.api.download(path);
      const ext = photo.mimeType.split('/')[1] ?? 'jpg';
      const ownerId = await this.resolveOwnerId();
      const result = await this.uploads.ingestAutoProcessed(
        ownerId,
        { buffer, originalName: `telegram-${Date.now()}.${ext}`, mimeType: photo.mimeType },
        'telegram',
      );
      if (result.duplicate) {
        await this.api.sendMessage(
          chatId,
          `⚠️ Essa imagem já existe no catálogo: <b>${result.existing.name}</b> (${result.existing.internalSku}). Não cadastrei de novo.`,
        );
        return 'duplicate';
      }
      return 'created';
    } catch (e) {
      this.logger.error(`ingest telegram: ${String(e)}`);
      await this.api.sendMessage(chatId, `❌ Falha ao processar uma foto: ${String(e)}`);
      return 'failed';
    }
  }

  /** Agrupa fotos de um álbum: primeira = produto; demais = etiqueta/preço/referência. */
  private bumpAlbumPhoto(chatId: number, groupId: string, photo: PendingPhoto): void {
    const buf: AlbumPhotoBuffer = this.albumPhotos.get(groupId) ?? {
      chatId,
      photos: [],
      timer: setTimeout(() => {}, 0),
    };
    clearTimeout(buf.timer);
    buf.photos.push(photo);
    buf.timer = setTimeout(() => {
      const current = this.albumPhotos.get(groupId);
      this.albumPhotos.delete(groupId);
      if (current) void this.ingestPhotoAlbum(current.chatId, current.photos);
    }, TelegramService.ALBUM_DEBOUNCE_MS);
    this.albumPhotos.set(groupId, buf);
  }

  private async ingestPhotoAlbum(
    chatId: number,
    photos: PendingPhoto[],
  ): Promise<PhotoIngestOutcome> {
    if (!this.api || !photos.length) return 'failed';
    if (photos.length === 1) return this.ingestPhoto(chatId, photos[0]);

    try {
      const files = await Promise.all(
        photos.map(async (photo, index) => {
          const path = await this.api!.getFilePath(photo.fileId);
          const buffer = await this.api!.download(path);
          const ext = photo.mimeType.split('/')[1] ?? 'jpg';
          return {
            buffer,
            originalName: `telegram-album-${Date.now()}-${index + 1}.${ext}`,
            mimeType: photo.mimeType,
          };
        }),
      );

      const [main, ...references] = files;
      const ownerId = await this.resolveOwnerId();
      const result = await this.uploads.ingestAutoProcessedWithReferences(
        ownerId,
        main,
        references,
        'telegram',
      );

      if (result.duplicate) {
        await this.api.sendMessage(
          chatId,
          `⚠️ Esse produto/imagem já existe no catálogo: <b>${result.existing.name}</b> (${result.existing.internalSku}). Não cadastrei de novo.`,
        );
        return 'duplicate';
      }

      await this.api.sendMessage(
        chatId,
        `📸 ${photos.length} fotos recebidas para o mesmo produto. Usei a primeira como foto principal e as outras como referência de preço/etiqueta. Já estou criando com IA; revise em <b>Produtos</b>.`,
      );
      return 'created';
    } catch (e) {
      this.logger.error(`ingest telegram album: ${String(e)}`);
      await this.api.sendMessage(chatId, `❌ Falha ao processar o álbum: ${String(e)}`);
      return 'failed';
    }
  }

  /** Junta as confirmações de um álbum (media_group_id) numa mensagem só. */
  private bumpAlbumReply(
    chatId: number,
    groupId: string | undefined,
    messages: { single: string; plural: (count: number) => string },
  ): void {
    if (!this.api) return;
    if (!groupId) {
      void this.api.sendMessage(chatId, messages.single);
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
      void this.api?.sendMessage(chatId, messages.plural(buf.count));
    }, TelegramService.ALBUM_DEBOUNCE_MS);
    this.albumReplies.set(groupId, buf);
  }

  private async resolveOwnerId(): Promise<string> {
    const configured = this.configuredOwnerId;

    if (configured && isValidObjectId(configured)) {
      const configuredUser = await this.users.exists({ _id: configured });
      if (configuredUser) return configured;

      this.warnInvalidConfiguredOwner(configured);
    } else if (configured) {
      this.warnInvalidConfiguredOwner(configured);
    }

    const admin = await this.users
      .findOne({ role: 'admin' })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean<{ _id: unknown }>()
      .exec();

    if (admin?._id) return String(admin._id);

    return configured || 'bras';
  }

  private warnInvalidConfiguredOwner(ownerId: string): void {
    if (this.warnedInvalidOwner) return;
    this.warnedInvalidOwner = true;
    this.logger.warn(
      `TELEGRAM_OWNER_ID=${ownerId} não corresponde a um usuário ativo; usando o primeiro admin disponível.`,
    );
  }

  /** Consome o código gerado em "Meus produtos" (área do fornecedor) e vincula
   * este chat a ele — a partir daí, fotos mandadas aqui viram produtos
   * pendentes só desse fornecedor. */
  private async handleSupplierLink(chatId: number, code: string): Promise<void> {
    if (!this.api) return;
    const result = await this.dropshipping.consumeTelegramLinkCode(String(chatId), code.trim());
    if (!result.ok) {
      const reason =
        result.reason === 'expired'
          ? 'Código expirado — gere um novo em Meus produtos, no site.'
          : 'Código inválido.';
      await this.api.sendMessage(chatId, `⚠️ ${reason}`);
      return;
    }
    await this.api.sendMessage(
      chatId,
      `✅ Chat vinculado à loja <b>${result.storeName}</b>! Agora é só mandar as fotos dos produtos aqui — elas ficam pendentes pra você preencher nome, preço, estoque e peso em <b>Meus produtos</b>, no site.`,
    );
  }

  /** Fluxo de um chat de fornecedor já vinculado: só recebe foto(s) e
   * confirma — sem o pipeline de IA, sem legenda/preço guiados (isso é feito
   * no site). */
  private async handleSupplierChat(chatId: number, msg: TgMessage): Promise<void> {
    if (!this.api) return;
    const photo = this.extractPhoto(msg);
    if (photo) {
      try {
        const path = await this.api.getFilePath(photo.fileId);
        const buffer = await this.api.download(path);
        const created = await this.dropshipping.ingestSupplierPhotoFromTelegram(String(chatId), {
          buffer,
          mimeType: photo.mimeType,
        });
        if (!created) {
          await this.api.sendMessage(chatId, '⚠️ Chat não vinculado a nenhum fornecedor.');
          return;
        }
        this.bumpAlbumReply(chatId, msg.media_group_id, {
          single: '📸 Foto recebida! Vá em <b>Meus produtos</b>, no site, pra preencher os dados.',
          plural: (n) =>
            `📸 ${n} fotos recebidas! Vá em <b>Meus produtos</b>, no site, pra preencher os dados de cada uma.`,
        });
      } catch (e) {
        this.logger.error(`ingest telegram fornecedor: ${String(e)}`);
        await this.api.sendMessage(chatId, `❌ Falha ao processar a foto: ${String(e)}`);
      }
      return;
    }

    const text = (msg.text ?? '').trim();
    if (
      text.startsWith('/start') ||
      text.startsWith('/help') ||
      text.startsWith('/ajuda') ||
      TelegramService.GREETING_RE.test(text)
    ) {
      await this.api.sendMessage(
        chatId,
        '📦 Mande a(s) foto(s) do(s) produto(s) — pode ser várias de uma vez. Depois vá em <b>Meus produtos</b>, no site, pra preencher nome, preço, estoque e peso.',
      );
    }
  }

  private async sendHelp(chatId: number): Promise<void> {
    if (!this.api) return;
    await this.api.sendMessage(
      chatId,
      [
        '🤖 <b>zycron — cadastro por foto</b>',
        '',
        'Mande um <b>oi</b> pra escolher o modo de cadastro:',
        '',
        '🗂 <b>Em lote</b> — envie a(s) foto(s) (pode ser várias de uma vez). Eu crio os produtos com IA, trato as imagens, busco/sugiro preço e deixo para revisar em Produtos.',
        '🖼 <b>Individual</b> — o bot pergunta a foto, a legenda, o preço e o peso, e já cadastra o produto. A IA trata a foto e gera a descrição automaticamente.',
      ].join('\n'),
    );
  }
}
