import { MarketingChannel } from '@tecnoplus/shared';
import { MarketingPublisherAgent } from './marketing-publisher.agent';

describe('MarketingPublisherAgent', () => {
  it('mantém Instagram desativado para marketing', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'facebook.pageId') return 'page-1';
        if (key === 'facebook.pageAccessToken') return 'token-1';
        if (key === 'facebook.instagramBusinessAccountId') return 'ig-1';
        if (key === 'facebook.apiVersion') return 'v19.0';
        return undefined;
      }),
    };
    const agent = new MarketingPublisherAgent(config as never);

    expect(agent.configuredFor(MarketingChannel.INSTAGRAM)).toBe(false);
    await expect(
      agent.publish({
        channel: MarketingChannel.INSTAGRAM,
        caption: 'Legenda',
        imageUrl: 'https://cdn.test/image.jpg',
      }),
    ).rejects.toThrow('Instagram desativado para marketing.');
  });
});
