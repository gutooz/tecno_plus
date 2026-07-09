import { computePrice, selectMarkup, toPsychologicalPrice } from '@tecnoplus/shared';
import { PricingAgent } from './pricing.agent';
import { ConfigService } from '@nestjs/config';

/**
 * Testes da lógica de precificação. A regra pura vive em @tecnoplus/shared;
 * o agente apenas injeta os tiers configurados.
 */
describe('Pricing rules (shared)', () => {
  it('seleciona markup por faixa de preço de compra', () => {
    expect(selectMarkup(20)).toBe(1.2); // até 30
    expect(selectMarkup(50)).toBe(0.9); // 30–100
    expect(selectMarkup(200)).toBe(0.7); // 100–300
    expect(selectMarkup(500)).toBe(0.5); // acima
  });

  it('sempre retorna preço psicológico terminando em ,90', () => {
    for (const v of [72.4, 118, 210.1, 5, 999]) {
      const p = toPsychologicalPrice(v);
      expect(Number((p % 1).toFixed(2))).toBe(0.9);
      expect(p).toBeGreaterThanOrEqual(v);
    }
  });

  it('calcula lucro, margem e ROI coerentes', () => {
    const r = computePrice({ purchasePrice: 50 });
    expect(r.suggestedPrice).toBeGreaterThan(50);
    expect(r.profit).toBeCloseTo(r.suggestedPrice - 50, 2);
    expect(r.roi).toBeGreaterThan(0);
    expect(r.marginPercent).toBeGreaterThan(0);
  });

  it('respeita o teto de mercado (não passa de 10% acima da média)', () => {
    const r = computePrice({ purchasePrice: 50, marketAveragePrice: 60 });
    expect(r.suggestedPrice).toBeLessThanOrEqual(toPsychologicalPrice(66) + 10);
  });
});

describe('PricingAgent', () => {
  const config = {
    get: (key: string) =>
      ({ 'pricing.tier1': 1.2, 'pricing.tier2': 0.9, 'pricing.tier3': 0.7, 'pricing.tier4': 0.5 })[
        key
      ],
  } as unknown as ConfigService;

  it('produz um PricingResult a partir do preço de compra', () => {
    const agent = new PricingAgent(config);
    const r = agent.run(80);
    expect(r.purchasePrice).toBe(80);
    expect(r.suggestedPrice).toBeGreaterThan(80);
    expect(Number((r.suggestedPrice % 1).toFixed(2))).toBe(0.9);
  });
});
