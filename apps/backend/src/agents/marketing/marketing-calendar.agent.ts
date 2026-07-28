import { Injectable } from '@nestjs/common';
import {
  MarketingCampaignPlan,
  MarketingChannel,
  MarketingContentType,
  MarketingTheme,
  TrendScore,
} from '@tecnoplus/shared';

export interface CalendarProductInput {
  productId: string;
  trend: TrendScore;
  plan: MarketingCampaignPlan;
}

export interface CalendarSlot {
  productId: string;
  scheduledFor: string; // ISO
  channel: MarketingChannel;
  type: MarketingContentType;
  theme: MarketingTheme;
  campaignType: string;
  trendScore: number;
}

/** 3 posts/dia, espalhados pelo dia (manhã/tarde/noite). */
const DAILY_HOURS = [10, 15, 20];
const TYPE_CYCLE: MarketingContentType[] = [
  MarketingContentType.FEED,
  MarketingContentType.STORY,
  MarketingContentType.CAROUSEL,
  MarketingContentType.REEL,
];
const CHANNEL_CYCLE: MarketingChannel[] = [MarketingChannel.INSTAGRAM, MarketingChannel.FACEBOOK];

/** Temas "de conteúdo" (não-comerciais) — promotional/new_arrival/seasonal vêm do plano, não daqui. */
const THEME_ROTATION: MarketingTheme[] = [
  MarketingTheme.EDUCATIONAL,
  MarketingTheme.CURIOSITY,
  MarketingTheme.COMPARISON,
  MarketingTheme.REVIEW,
  MarketingTheme.UNBOXING,
  MarketingTheme.BEHIND_THE_SCENES,
  MarketingTheme.TESTIMONIAL,
];

const PROMO_CAMPAIGN_TYPES = new Set([
  'promotional',
  'flash_sale',
  'coupon',
  'clearance',
  'black_friday',
]);

/**
 * AGENTE 6 (Marketing IA) — Calendar.
 * Puramente determinístico (sem chamada de IA): decide QUANDO, QUAL PRODUTO,
 * QUE FORMATO e QUE TEMA, equilibrando tipos de conteúdo e nunca repetindo o
 * mesmo produto+campanha (`usedCombos`, alimentado pelo histórico real do
 * `MarketingService`). A geração de LEGENDA (Copywriter) acontece depois, por
 * post — aqui só o esqueleto do calendário.
 */
@Injectable()
export class MarketingCalendarAgent {
  build(
    products: CalendarProductInput[],
    startDate: Date,
    days: number,
    usedCombos: Set<string>,
  ): CalendarSlot[] {
    if (!products.length) return [];

    const slots: CalendarSlot[] = [];
    let productCursor = 0;
    let themeCursor = 0;
    let lastTheme: MarketingTheme | null = null;
    const comboKey = (p: CalendarProductInput) => `${p.productId}:${p.plan.campaignType}`;
    const seen = new Set(usedCombos);

    for (let day = 0; day < days; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);

      for (let slotIdx = 0; slotIdx < DAILY_HOURS.length; slotIdx++) {
        let picked: CalendarProductInput | null = null;

        // Round-robin a partir do cursor, preferindo combos ainda não usados.
        for (let attempt = 0; attempt < products.length; attempt++) {
          const candidate = products[(productCursor + attempt) % products.length];
          if (!seen.has(comboKey(candidate))) {
            picked = candidate;
            productCursor = (productCursor + attempt + 1) % products.length;
            break;
          }
        }
        // Catálogo pequeno / muitos dias: todas as combinações já usadas —
        // libera repetir, mantendo a rotação.
        if (!picked) {
          picked = products[productCursor % products.length];
          productCursor++;
        }
        seen.add(comboKey(picked));

        const theme = this.pickTheme(picked, lastTheme, themeCursor);
        lastTheme = theme;
        themeCursor++;

        const scheduledFor = new Date(date);
        scheduledFor.setHours(DAILY_HOURS[slotIdx], 0, 0, 0);

        slots.push({
          productId: picked.productId,
          scheduledFor: scheduledFor.toISOString(),
          channel: CHANNEL_CYCLE[slotIdx % CHANNEL_CYCLE.length],
          type: TYPE_CYCLE[slotIdx % TYPE_CYCLE.length],
          theme,
          campaignType: picked.plan.campaignType,
          trendScore: picked.trend.score,
        });
      }
    }

    return slots;
  }

  private pickTheme(
    product: CalendarProductInput,
    lastTheme: MarketingTheme | null,
    cursor: number,
  ): MarketingTheme {
    if (product.trend.seasonalEvent) return MarketingTheme.SEASONAL;
    if (product.plan.campaignType === 'launch') return MarketingTheme.NEW_ARRIVAL;
    if (PROMO_CAMPAIGN_TYPES.has(product.plan.campaignType)) return MarketingTheme.PROMOTIONAL;

    let theme = THEME_ROTATION[cursor % THEME_ROTATION.length];
    if (theme === lastTheme) theme = THEME_ROTATION[(cursor + 1) % THEME_ROTATION.length];
    return theme;
  }
}
