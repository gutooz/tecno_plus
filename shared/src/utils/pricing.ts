/**
 * Regras de precificação compartilhadas entre backend (Agente 5) e frontend
 * (pré-visualização). Puras e testáveis.
 */

export interface MarkupTiers {
  tier1: number; // até 30
  tier2: number; // 30–100
  tier3: number; // 100–300
  tier4: number; // acima de 300
}

export const DEFAULT_MARKUP: MarkupTiers = {
  tier1: 1.2,
  tier2: 0.9,
  tier3: 0.7,
  tier4: 0.5,
};

/** Seleciona o markup pela faixa do preço de compra. */
export function selectMarkup(purchasePrice: number, tiers: MarkupTiers = DEFAULT_MARKUP): number {
  if (purchasePrice <= 30) return tiers.tier1;
  if (purchasePrice <= 100) return tiers.tier2;
  if (purchasePrice <= 300) return tiers.tier3;
  return tiers.tier4;
}

/**
 * Arredonda para "preço psicológico" terminando em ,90.
 * Ex.: 72,40 → 79,90 | 118,00 → 119,90 | 210,10 → 219,90
 * Nunca retorna número quebrado.
 */
export function toPsychologicalPrice(value: number): number {
  if (value <= 0) return 0;
  // sobe para o próximo "inteiro de dezena base" e aplica ,90
  const whole = Math.ceil(value);
  const endsBelow90 = whole - Math.floor(whole / 10) * 10 <= 9;
  const base = endsBelow90 ? Math.floor(whole / 10) * 10 + 9 : Math.ceil(whole / 10) * 10 + 9;
  const candidate = base + 0.9;
  return candidate < value ? candidate + 10 : Number(candidate.toFixed(2));
}

export interface ComputePriceInput {
  purchasePrice: number;
  marketAveragePrice?: number;
  tiers?: MarkupTiers;
}

export interface ComputedPrice {
  suggestedPrice: number;
  markupApplied: number;
  profit: number;
  marginPercent: number;
  roi: number;
}

/**
 * Calcula preço sugerido, lucro, margem e ROI.
 * Se houver preço médio de mercado, o preço-alvo é limitado para não destoar
 * (não passa de 10% acima da média), mantendo competitividade.
 */
export function computePrice(input: ComputePriceInput): ComputedPrice {
  const { purchasePrice, marketAveragePrice, tiers } = input;
  const markup = selectMarkup(purchasePrice, tiers);
  let target = purchasePrice * (1 + markup);

  if (marketAveragePrice && marketAveragePrice > 0) {
    const ceiling = marketAveragePrice * 1.1;
    target = Math.min(target, ceiling);
    target = Math.max(target, purchasePrice * 1.05); // nunca abaixo de 5% de lucro
  }

  const suggestedPrice = toPsychologicalPrice(target);
  const profit = Number((suggestedPrice - purchasePrice).toFixed(2));
  const marginPercent = Number(((profit / suggestedPrice) * 100).toFixed(2));
  const roi = Number(((profit / purchasePrice) * 100).toFixed(2));

  return { suggestedPrice, markupApplied: markup, profit, marginPercent, roi };
}
