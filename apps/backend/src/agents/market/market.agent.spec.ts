import { MarketAgent } from './market.agent';
import { SampleMarketSource } from './sample-market.source';
import { competitionFromListingCount } from '@tecnoplus/shared';

describe('MarketAgent', () => {
  it('agrega preços de N fontes e deriva a concorrência', async () => {
    const agent = new MarketAgent([new SampleMarketSource()]);
    const res = await agent.run({ name: 'Fone Bluetooth', brand: 'Acme' });

    expect(res.averagePrice).toBeGreaterThan(0);
    expect(res.minPrice).toBeLessThanOrEqual(res.averagePrice);
    expect(res.maxPrice).toBeGreaterThanOrEqual(res.averagePrice);
    expect(res.sources).toContain('sample');
    expect(['low', 'medium', 'high']).toContain(res.competition);
  });

  it('é determinístico para a mesma consulta (facilita testes/replay)', async () => {
    const agent = new MarketAgent([new SampleMarketSource()]);
    const a = await agent.run({ name: 'Cabo USB-C', ean: '789123' });
    const b = await agent.run({ name: 'Cabo USB-C', ean: '789123' });
    expect(a.averagePrice).toBe(b.averagePrice);
  });

  it('mapeia contagem de anúncios para nível de concorrência', () => {
    expect(competitionFromListingCount(10)).toBe('low');
    expect(competitionFromListingCount(100)).toBe('medium');
    expect(competitionFromListingCount(300)).toBe('high');
  });
});
