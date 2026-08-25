import { MarketingCampaignType, MarketingChannel } from '@tecnoplus/shared';
import { MarketingCalendarAgent } from './marketing-calendar.agent';

describe('MarketingCalendarAgent', () => {
  it('gera calendário de marketing somente para Facebook', () => {
    const agent = new MarketingCalendarAgent();

    const slots = agent.build(
      [
        {
          productId: 'product-1',
          trend: {
            productId: 'product-1',
            score: 90,
            reasons: [],
            suggestedHashtags: [],
            suggestedKeywords: [],
            calculatedAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
          },
          plan: {
            productId: 'product-1',
            campaignType: MarketingCampaignType.PROMOTIONAL,
            objective: 'Vender',
            targetAudience: 'Compradores',
            strategy: 'Oferta',
            idealPostingHour: 10,
            trendScore: 90,
            reasoning: 'Bom potencial',
          },
        },
      ],
      new Date('2026-08-25T00:00:00.000Z'),
      2,
      new Set(),
    );

    expect(slots).toHaveLength(6);
    expect(slots.every((slot) => slot.channel === MarketingChannel.FACEBOOK)).toBe(true);
  });
});
