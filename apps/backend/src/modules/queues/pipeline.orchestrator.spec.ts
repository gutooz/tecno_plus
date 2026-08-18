import {
  mergeContentWithOperatorTitle,
  mergeVisionWithOperatorFields,
  resolvePricingDecision,
} from './pipeline.orchestrator';

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

  it('prioriza preço pago digitado pelo operador sobre preço lido na imagem', () => {
    const decision = resolvePricingDecision({
      source: 'web',
      vision: { labelPrice: 99 },
      pricing: { purchasePrice: 18.5 },
      market: { minPrice: 120 },
    });

    expect(decision).toEqual({
      purchasePrice: 18.5,
      missingPurchasePrice: false,
      shouldAutoPublish: true,
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

describe('pipeline manual field preservation', () => {
  it('mantém nome, preço, peso e estoque preenchidos antes da visão da IA', () => {
    const merged = mergeVisionWithOperatorFields(
      {
        name: 'Cabo USB-C 20W',
        labelPrice: 18.5,
        weight: 0.3,
        weightSource: 'etiqueta',
        quantity: 10,
      },
      {
        name: 'Carregador genérico',
        labelPrice: 99,
        weight: 1.2,
        quantity: 80,
        brand: 'Marca IA',
      },
      55,
    );

    expect(merged).toEqual({
      name: 'Cabo USB-C 20W',
      labelPrice: 18.5,
      weight: 0.3,
      weightSource: 'etiqueta',
      quantity: 10,
      brand: 'Marca IA',
    });
  });

  it('mantém a legenda manual como título do conteúdo gerado', () => {
    const content = mergeContentWithOperatorTitle(
      { name: 'Cabo USB-C 20W' },
      {
        title: 'Título inventado pela IA',
        description: 'Descrição gerada',
        longDescription: 'Descrição longa gerada',
        summary: 'Resumo gerado',
        bulletPoints: [],
        seo: {
          metaDescription: 'Meta gerada',
          slug: 'titulo-inventado',
          keywords: [],
          tags: [],
        },
        category: 'Acessórios',
        technicalSpecs: {},
        marketplaceDescription: 'Texto marketplace',
      },
    );

    expect(content.title).toBe('Cabo USB-C 20W');
    expect(content.description).toBe('Descrição gerada');
  });
});
