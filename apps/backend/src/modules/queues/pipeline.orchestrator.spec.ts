import { resolvePricingDecision } from './pipeline.orchestrator';

describe('resolvePricingDecision', () => {
  it('não usa preço de mercado como preço pago em produto do Telegram', () => {
    const decision = resolvePricingDecision({
      source: 'telegram',
      vision: { name: 'Garrafa de Água Infantil', labelPrice: null },
      market: { minPrice: 460, averagePrice: 498.33 },
      pricing: null,
    });

    expect(decision).toEqual({
      purchasePrice: 0,
      missingPurchasePrice: true,
      shouldAutoPublish: false,
    });
  });

  it('aceita preço pago visível ou digitado para produto do Telegram, mas não publica sozinho', () => {
    const decision = resolvePricingDecision({
      source: 'telegram',
      vision: { labelPrice: 10 },
      market: { minPrice: 460 },
      pricing: null,
    });

    expect(decision).toEqual({
      purchasePrice: 10,
      missingPurchasePrice: false,
      shouldAutoPublish: false,
    });
  });

  it('mantém fallback de mercado para upload web legado', () => {
    const decision = resolvePricingDecision({
      source: 'web',
      vision: {},
      market: { minPrice: 89.9 },
      pricing: null,
    });

    expect(decision).toEqual({
      purchasePrice: 89.9,
      missingPurchasePrice: false,
      shouldAutoPublish: true,
    });
  });
});
