import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CampaignStatus,
  MarketplaceChannel,
  PaidCampaignConfig,
  PaidCampaignTargeting,
} from '@tecnoplus/shared';
import { Campaign as CampaignEntity, CampaignDocument } from '../database/schemas/campaign.schema';
import { Product, ProductDocument } from '../database/schemas/product.schema';
import { FacebookMarketingApi } from '../social/facebook-marketing.api';

interface CreatePaidInput {
  name: string;
  productId: string;
  channel: MarketplaceChannel;
  objective: PaidCampaignConfig['objective'];
  dailyBudgetCents: number;
  currency: string;
  targeting: PaidCampaignTargeting;
  startDate?: string;
  endDate?: string;
}

function imageUrlFor(product: ProductDocument): string {
  const images = product.images as { hd?: string; square?: string; original?: string };
  return images.hd || images.square || images.original || '';
}

function captionFor(product: ProductDocument): string {
  const content = (product.content ?? {}) as {
    marketplaceDescription?: string;
    description?: string;
    title?: string;
  };
  return content.marketplaceDescription || content.description || content.title || '';
}

/**
 * Campanhas pagas via Facebook Marketing API — gasta dinheiro real, por isso
 * fica INERTE até `FACEBOOK_AD_ACCOUNT_ID` + um token com `ads_management`
 * estarem configurados no servidor (mesmo padrão "no-op até configurar" do
 * `ShopeeApiClient`), e toda campanha nasce/permanece pausada no Facebook até
 * uma ativação explícita (`setStatus(id, 'active')`) — nunca automática.
 */
@Injectable()
export class PaidCampaignsService {
  private readonly ownerId: string;
  private readonly adAccountId: string;
  private readonly pageId: string;
  private readonly token: string;
  private readonly apiVersion: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(CampaignEntity.name) private readonly campaigns: Model<CampaignDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
  ) {
    this.ownerId = this.config.get<string>('telegram.ownerId') ?? 'bras';
    this.adAccountId = this.config.get<string>('facebook.adAccountId') ?? '';
    this.pageId = this.config.get<string>('facebook.pageId') ?? '';
    this.token = this.config.get<string>('facebook.marketingApiToken') ?? '';
    this.apiVersion = this.config.get<string>('facebook.apiVersion') ?? 'v19.0';
  }

  get configured(): boolean {
    return Boolean(this.adAccountId && this.token && this.pageId);
  }

  private client(): FacebookMarketingApi {
    return new FacebookMarketingApi(this.adAccountId, this.pageId, this.token, this.apiVersion);
  }

  async createPaid(input: CreatePaidInput): Promise<CampaignDocument> {
    if (!this.configured) {
      throw new BadRequestException(
        'Campanhas pagas não configuradas no servidor (defina FACEBOOK_AD_ACCOUNT_ID e um token com permissão ads_management).',
      );
    }
    if (!input.name?.trim()) throw new BadRequestException('Informe um nome para a campanha.');
    if (!input.dailyBudgetCents || input.dailyBudgetCents <= 0) {
      throw new BadRequestException('Informe um orçamento diário válido.');
    }
    const product = await this.products.findById(input.productId);
    if (!product) throw new NotFoundException('Produto não encontrado.');
    const imageUrl = imageUrlFor(product);
    if (!imageUrl)
      throw new BadRequestException('Produto sem imagem pública — não é possível criar o anúncio.');

    const paid: PaidCampaignConfig = {
      objective: input.objective,
      dailyBudgetCents: input.dailyBudgetCents,
      currency: input.currency || 'BRL',
      targeting: input.targeting,
      productId: input.productId,
      channel: input.channel,
      external: {},
      startDate: input.startDate,
      endDate: input.endDate,
    };

    const doc = await this.campaigns.create({
      ownerId: this.ownerId,
      type: 'paid',
      name: input.name.trim(),
      status: CampaignStatus.DRAFT,
      paid,
    });

    const client = this.client();
    try {
      const campaignId = await client.createCampaign(input.name.trim(), input.objective);
      paid.external.campaignId = campaignId;

      const adSetId = await client.createAdSet({
        campaignId,
        name: `${input.name.trim()} — conjunto`,
        dailyBudgetCents: input.dailyBudgetCents,
        targeting: input.targeting,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      paid.external.adSetId = adSetId;

      const creativeId = await client.createAdCreative(imageUrl, captionFor(product));
      paid.external.creativeId = creativeId;

      const adId = await client.createAd({
        adSetId,
        creativeId,
        name: `${input.name.trim()} — anúncio`,
      });
      paid.external.adId = adId;

      doc.paid = paid as unknown as Record<string, unknown>;
      // Criada de verdade no Facebook, mas pausada — só o usuário ativa o gasto.
      doc.status = CampaignStatus.PAUSED;
      await doc.save();
    } catch (e) {
      paid.lastError = e instanceof Error ? e.message : String(e);
      doc.paid = paid as unknown as Record<string, unknown>;
      doc.status = CampaignStatus.DRAFT;
      await doc.save();
      throw new BadRequestException(`Falha ao criar campanha no Facebook: ${paid.lastError}`);
    }

    return doc;
  }

  async setStatus(id: string, status: 'active' | 'paused'): Promise<CampaignDocument> {
    const campaign = await this.campaigns.findOne({ _id: id, ownerId: this.ownerId, type: 'paid' });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    const paid = campaign.paid as unknown as PaidCampaignConfig | null;
    const campaignId = paid?.external?.campaignId;
    if (!campaignId) {
      throw new BadRequestException(
        'Campanha sem ID válido no Facebook — a criação pode ter falhado.',
      );
    }
    await this.client().setCampaignStatus(campaignId, status === 'active' ? 'ACTIVE' : 'PAUSED');
    campaign.status = status === 'active' ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED;
    await campaign.save();
    return campaign;
  }

  async archive(id: string): Promise<{ ok: true }> {
    const campaign = await this.campaigns.findOne({ _id: id, ownerId: this.ownerId, type: 'paid' });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    const paid = campaign.paid as unknown as PaidCampaignConfig | null;
    const campaignId = paid?.external?.campaignId;
    if (campaignId) {
      await this.client()
        .setCampaignStatus(campaignId, 'PAUSED')
        .catch(() => {});
    }
    campaign.status = CampaignStatus.ARCHIVED;
    await campaign.save();
    return { ok: true };
  }
}
