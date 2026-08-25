import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GeneratedContent,
  MarketplaceChannel,
  PricingResult,
  Product as ProductDomain,
  ProductStatus,
  SocialApproval,
} from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { PublisherAgent } from '../../agents/publisher.agent';
import { TelegramApi, TgInlineKeyboard } from '../telegram/telegram-api';

const brl = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',');
// Limite real da Bot API do Telegram para legenda de foto (message caption is too long acima disso).
const MAX_CAPTION_LENGTH = 1024;
const SOCIAL_PUBLISH_CHANNELS = [MarketplaceChannel.FACEBOOK] as const;

function keyboardFor(productId: string): TgInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: '✅ Aprovar', callback_data: `social_approve:${productId}` },
        { text: '✏️ Editar', callback_data: `social_edit:${productId}` },
        { text: '❌ Rejeitar', callback_data: `social_reject:${productId}` },
      ],
    ],
  };
}

/**
 * Orquestra o rascunho → aprovação → publicação de posts sociais no Facebook
 * de um produto do catálogo, com aprovação humana via Telegram. O `SocialScheduler`
 * chama `sendForApproval` 1x/dia; os botões do Telegram (roteados pelo
 * `TelegramService`) chamam `approve`/`reject`/`setCaption`.
 */
@Injectable()
export class SocialApprovalService {
  private readonly logger = new Logger(SocialApprovalService.name);
  private readonly api: TelegramApi | null;
  private readonly ownerId: string;
  private readonly chatId: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly publisher: PublisherAgent,
  ) {
    const token = this.config.get<string>('telegram.botToken') ?? '';
    this.api = token ? new TelegramApi(token) : null;
    this.ownerId = this.config.get<string>('telegram.ownerId') ?? 'bras';
    this.chatId = (this.config.get<string[]>('telegram.allowedChatIds') ?? [])[0] ?? '';
  }

  /** Próximo produto pronto que ainda não teve rascunho social enviado. */
  async pickNextCandidate(): Promise<ProductDocument | null> {
    const [next] = await this.pickUpcomingCandidates(1);
    return next ?? null;
  }

  /**
   * Peek somente-leitura nos próximos N produtos que a automação pegaria (mesmo
   * filtro do `pickNextCandidate`, sem limitar a 1 e sem nenhum efeito colateral).
   * Usado pela prévia semanal na tela de Integrações — não reserva nem altera nada.
   */
  async pickUpcomingCandidates(limit: number): Promise<ProductDocument[]> {
    return this.products
      .find({
        ownerId: this.ownerId,
        status: { $in: [ProductStatus.READY, ProductStatus.PUBLISHED] },
        socialApproval: null,
      })
      .sort({ createdAt: 1 })
      .limit(limit);
  }

  /** Histórico de posts (pendentes/aprovados/rejeitados/publicados) — usado na tela web de gestão. */
  async listHistory(status?: string): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = {
      ownerId: this.ownerId,
      socialApproval: { $ne: null },
    };
    if (status) filter['socialApproval.status'] = status;
    return this.products.find(filter).sort({ updatedAt: -1 }).limit(100);
  }

  /**
   * Cria um post manualmente pela tela web (fora do pick diário automático).
   * `mode: 'approval'` reaproveita o mesmo fluxo do Telegram (padrão/seguro);
   * `mode: 'immediate'` publica direto, sem esperar aprovação.
   */
  async createManualPost(productId: string, mode: 'approval' | 'immediate'): Promise<void> {
    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundException('Produto não encontrado.');
    if (product.socialApproval) {
      throw new BadRequestException(
        'Este produto já tem um post social em andamento ou concluído.',
      );
    }

    if (mode === 'approval') {
      await this.sendForApproval(product);
      return;
    }

    const domain = this.toDomain(product);
    const errors: string[] = [];
    for (const channel of SOCIAL_PUBLISH_CHANNELS) {
      try {
        await this.publisher.publish(domain, channel);
      } catch (e) {
        errors.push(`${channel}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (errors.length === SOCIAL_PUBLISH_CHANNELS.length) {
      throw new BadRequestException(`Falha ao publicar: ${errors.join(' | ')}`);
    }

    const socialApproval: SocialApproval = {
      status: 'posted',
      caption: this.buildCaption(product),
      telegramChatId: '',
      telegramMessageId: 0,
      scheduledAt: new Date().toISOString(),
      postedAt: new Date().toISOString(),
    };
    await this.products.updateOne({ _id: productId }, { $set: { socialApproval } });
  }

  buildCaption(product: ProductDocument): string {
    const content = (product.content ?? {}) as Partial<GeneratedContent>;
    const pricing = (product.pricing ?? {}) as Partial<PricingResult>;
    const header = `🛍️ ${content.title || (product.vision as { name?: string })?.name || 'Novidade'}`;
    const description = content.description || content.summary || '';
    const priceBlock = pricing.suggestedPrice ? `\n\n💰 ${brl(pricing.suggestedPrice)}` : '';
    const hashtagsBlock = (content.seo?.tags ?? [])
      .slice(0, 8)
      .map((t) => `#${t.replace(/\s+/g, '')}`)
      .join(' ');

    // A legenda tem limite real de 1024 chars na Bot API — header/preço/hashtags
    // são fixos, a DESCRIÇÃO é o que se corta pra caber (com "…" no fim).
    const fixedLength =
      header.length + priceBlock.length + (hashtagsBlock ? hashtagsBlock.length + 2 : 0) + 2;
    const maxDescription = Math.max(0, MAX_CAPTION_LENGTH - fixedLength);
    const truncatedDescription =
      description.length > maxDescription
        ? `${description.slice(0, Math.max(0, maxDescription - 1)).trimEnd()}…`
        : description;

    return [header, truncatedDescription, priceBlock, hashtagsBlock ? `\n\n${hashtagsBlock}` : '']
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_CAPTION_LENGTH);
  }

  private imageUrlFor(product: ProductDocument): string {
    const images = product.images as { hd?: string; square?: string; original?: string };
    return images.hd || images.square || images.original || '';
  }

  /** Manda o rascunho pro Telegram do dono, com botões Aprovar/Editar/Rejeitar. */
  async sendForApproval(product: ProductDocument): Promise<void> {
    if (!this.api || !this.chatId) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID ausentes — não há como mandar aprovação.',
      );
      return;
    }
    const imageUrl = this.imageUrlFor(product);
    if (!imageUrl) {
      this.logger.warn(
        `Produto ${product.internalSku} sem imagem — pulando divulgação social hoje.`,
      );
      return;
    }
    const productId = String(product._id);
    const caption = this.buildCaption(product);
    const messageId = await this.api.sendPhoto(
      this.chatId,
      imageUrl,
      caption,
      keyboardFor(productId),
    );

    const socialApproval: SocialApproval = {
      status: 'pending',
      caption,
      telegramChatId: this.chatId,
      telegramMessageId: messageId,
      scheduledAt: new Date().toISOString(),
    };
    await this.products.updateOne({ _id: productId }, { $set: { socialApproval } });
    this.logger.log(
      `Rascunho social de ${product.internalSku} enviado pro Telegram (msg ${messageId}).`,
    );
  }

  /** Publica no Facebook e fecha o ciclo de aprovação. */
  async approve(productId: string): Promise<void> {
    const product = await this.products.findById(productId);
    if (
      !product?.socialApproval ||
      (product.socialApproval as unknown as SocialApproval).status !== 'pending'
    )
      return;
    const domain = this.toDomain(product);

    const errors: string[] = [];
    for (const channel of SOCIAL_PUBLISH_CHANNELS) {
      try {
        await this.publisher.publish(domain, channel);
      } catch (e) {
        errors.push(`${channel}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (errors.length === SOCIAL_PUBLISH_CHANNELS.length) {
      this.logger.error(
        `Publicação social de ${product.internalSku} falhou: ${errors.join(' | ')}`,
      );
      await this.notify(product, `❌ Falha ao publicar: ${errors.join(' | ')}`);
      return; // mantém "pending" pra permitir tentar de novo
    }

    await this.products.updateOne(
      { _id: productId },
      {
        $set: {
          'socialApproval.status': 'posted',
          'socialApproval.postedAt': new Date().toISOString(),
        },
      },
    );
    const suffix = errors.length ? `\n⚠️ ${errors.join(' | ')}` : '';
    await this.closeMessage(product, `✅ Publicado no Facebook.${suffix}`);
  }

  async reject(productId: string): Promise<void> {
    const product = await this.products.findById(productId);
    if (
      !product?.socialApproval ||
      (product.socialApproval as unknown as SocialApproval).status !== 'pending'
    )
      return;
    await this.products.updateOne(
      { _id: productId },
      { $set: { 'socialApproval.status': 'rejected' } },
    );
    await this.closeMessage(product, '❌ Rejeitado — outro produto será sugerido amanhã.');
  }

  /** Fluxo de edição: troca a legenda e mantém os botões pra aprovar/rejeitar em seguida. */
  async setCaption(productId: string, newCaption: string): Promise<void> {
    const product = await this.products.findById(productId);
    const approval = product?.socialApproval as unknown as SocialApproval | undefined;
    if (!this.api || !product || !approval || approval.status !== 'pending') return;
    const caption = newCaption.slice(0, MAX_CAPTION_LENGTH);
    await this.api.editMessageCaption(
      approval.telegramChatId,
      approval.telegramMessageId,
      caption,
      keyboardFor(productId),
    );
    await this.products.updateOne(
      { _id: productId },
      { $set: { 'socialApproval.caption': caption } },
    );
  }

  private async closeMessage(product: ProductDocument, note: string): Promise<void> {
    const approval = product.socialApproval as unknown as SocialApproval;
    if (!this.api) return;
    const maxCaption = Math.max(0, MAX_CAPTION_LENGTH - note.length - 2);
    const caption = `${approval.caption.slice(0, maxCaption)}\n\n${note}`;
    await this.api.editMessageCaption(approval.telegramChatId, approval.telegramMessageId, caption);
  }

  private async notify(product: ProductDocument, text: string): Promise<void> {
    const approval = product.socialApproval as unknown as SocialApproval;
    if (!this.api) return;
    await this.api.sendMessage(approval.telegramChatId, text);
  }

  private toDomain(doc: ProductDocument): ProductDomain {
    return { id: String(doc._id), ...doc.toObject() } as unknown as ProductDomain;
  }
}
