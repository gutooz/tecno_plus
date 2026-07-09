import { MarketListing, MarketQuery, MarketSource } from '@tecnoplus/shared';

/**
 * Fonte de mercado de referência para o MVP.
 *
 * IMPORTANTE: é um ADAPTER substituível. Ele NÃO faz scraping de terceiros;
 * gera uma estimativa determinística a partir da consulta para que o pipeline
 * rode ponta-a-ponta sem depender de API externa. Quando a API oficial (Mercado
 * Livre, Shopee, etc.) estiver disponível, cria-se um novo MarketSource e
 * registra-se no lugar deste — o MarketAgent não muda.
 */
export class SampleMarketSource implements MarketSource {
  readonly name = 'sample';
  readonly enabled = true;

  async search(query: MarketQuery): Promise<MarketListing[]> {
    const seedText = [query.name, query.brand, query.model, query.ean].filter(Boolean).join(' ');
    const seed = hashString(seedText || 'produto');
    const base = 20 + (seed % 480); // preço base "de mercado" 20..500
    const count = 3 + (seed % 8);

    return Array.from({ length: count }, (_, i) => {
      const variance = ((seed >> (i + 1)) % 40) - 20; // -20%..+20%
      const price = round2(base * (1 + variance / 100));
      return {
        title: `${query.name ?? 'Produto'} ${query.brand ?? ''} (ref ${i + 1})`.trim(),
        price,
        source: this.name,
      };
    });
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
