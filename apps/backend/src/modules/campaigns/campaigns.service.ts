import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CampaignStatus, MarketplaceChannel, OrganicCampaignItem } from '@tecnoplus/shared';
import { Campaign as CampaignEntity, CampaignDocument } from '../database/schemas/campaign.schema';
import { Product, ProductDocument } from '../database/schemas/product.schema';

interface CreateOrganicInput {
  name: string;
  productIds: string[];
  channels: MarketplaceChannel[];
  startDate: string;
  intervalDays: number;
}

/**
 * Campanhas orgânicas: um lote de posts pré-selecionados e agendados, sem
 * custo. Cada item, quando chega a data, reaproveita o mesmo
 * `SocialApprovalService.sendForApproval` do fluxo diário automático — quem
 * dispara isso é `processDueOrganicItems`, chamado pelo `SocialScheduler` a
 * cada tick (recebe a função de envio por parâmetro para não depender do
 * `SocialModule`, evitando import circular entre os dois módulos).
 */
@Injectable()
export class CampaignsService {
  private readonly ownerId: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(CampaignEntity.name) private readonly campaigns: Model<CampaignDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
  ) {
    this.ownerId = this.config.get<string>('telegram.ownerId') ?? 'bras';
  }

  async list(type?: 'organic' | 'paid') {
    const filter: Record<string, unknown> = { ownerId: this.ownerId };
    if (type) filter.type = type;
    return this.campaigns.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createOrganic(input: CreateOrganicInput): Promise<CampaignDocument> {
    if (!input.name?.trim()) throw new BadRequestException('Informe um nome para a campanha.');
    if (!input.productIds?.length) throw new BadRequestException('Selecione ao menos um produto.');
    if (!input.channels?.length) throw new BadRequestException('Selecione ao menos um canal.');

    const intervalDays = Math.max(1, Number(input.intervalDays) || 1);
    const start = new Date(input.startDate || new Date().toISOString());
    const items: OrganicCampaignItem[] = input.productIds.map((productId, i) => {
      const date = new Date(start);
      date.setDate(date.getDate() + i * intervalDays);
      return { productId, scheduledFor: date.toISOString(), status: 'queued' };
    });

    return this.campaigns.create({
      ownerId: this.ownerId,
      type: 'organic',
      name: input.name.trim(),
      status: CampaignStatus.DRAFT,
      organic: { channels: input.channels, intervalDays, startDate: input.startDate, items },
    });
  }

  async setStatus(id: string, status: 'active' | 'paused'): Promise<CampaignDocument> {
    const campaign = await this.campaigns.findOne({
      _id: id,
      ownerId: this.ownerId,
      type: 'organic',
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    campaign.status = status === 'active' ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED;
    await campaign.save();
    return campaign;
  }

  async remove(id: string): Promise<{ ok: true }> {
    const res = await this.campaigns.deleteOne({ _id: id, ownerId: this.ownerId, type: 'organic' });
    if (!res.deletedCount) throw new NotFoundException('Campanha não encontrada.');
    return { ok: true };
  }

  /**
   * Roda a cada tick do `SocialScheduler`: dispara os itens de campanhas
   * orgânicas ATIVAS cuja data já chegou. Nunca lança — quem chama decide
   * como isolar falhas (ver `SocialScheduler.tick`).
   */
  async processDueOrganicItems(
    sendForApproval: (product: ProductDocument) => Promise<void>,
  ): Promise<void> {
    const now = new Date();
    const active = await this.campaigns.find({
      ownerId: this.ownerId,
      type: 'organic',
      status: CampaignStatus.ACTIVE,
    });

    for (const campaign of active) {
      const organic = campaign.organic as { items: OrganicCampaignItem[] } | null;
      if (!organic?.items?.length) continue;

      let changed = false;
      for (const item of organic.items) {
        if (item.status !== 'queued' || new Date(item.scheduledFor) > now) continue;

        const product = await this.products.findById(item.productId);
        if (!product || product.socialApproval) {
          item.status = 'skipped';
          changed = true;
          continue;
        }
        await sendForApproval(product);
        item.status = 'sent_for_approval';
        changed = true;
      }

      if (changed) {
        campaign.organic = organic;
        campaign.markModified('organic');
        await campaign.save();
      }
    }
  }
}
