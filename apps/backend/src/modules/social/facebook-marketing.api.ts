/**
 * Cliente mínimo da Facebook Marketing API — só o necessário para "impulsionar
 * o post de um produto": cria Campaign → Ad Set → Ad Creative → Ad, sempre
 * nascendo PAUSADO (quem ativa o gasto é uma ação explícita do usuário, ver
 * `PaidCampaignsService.setStatus`). Sem insights/relatórios, sem públicos
 * customizados, sem múltiplos ad sets — extensão futura se precisar.
 */

export interface AdTargeting {
  countries: string[];
  ageMin: number;
  ageMax: number;
  genders?: ('male' | 'female')[];
}

const GENDER_CODE: Record<'male' | 'female', number> = { male: 1, female: 2 };

export class FacebookMarketingApi {
  private readonly base: string;

  constructor(
    private readonly adAccountId: string,
    private readonly pageId: string,
    private readonly accessToken: string,
    apiVersion: string,
  ) {
    this.base = `https://graph.facebook.com/${apiVersion}`;
  }

  async createCampaign(name: string, objective: string): Promise<string> {
    const json = await this.call(`/act_${this.adAccountId}/campaigns`, {
      name,
      objective,
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([]),
    });
    return String(json.id);
  }

  async createAdSet(params: {
    campaignId: string;
    name: string;
    dailyBudgetCents: number;
    targeting: AdTargeting;
    startDate?: string;
    endDate?: string;
  }): Promise<string> {
    const targeting: Record<string, unknown> = {
      geo_locations: { countries: params.targeting.countries },
      age_min: params.targeting.ageMin,
      age_max: params.targeting.ageMax,
    };
    if (params.targeting.genders?.length) {
      targeting.genders = params.targeting.genders.map((g) => GENDER_CODE[g]);
    }
    const json = await this.call(`/act_${this.adAccountId}/adsets`, {
      name: params.name,
      campaign_id: params.campaignId,
      daily_budget: String(params.dailyBudgetCents),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'POST_ENGAGEMENT',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(targeting),
      status: 'PAUSED',
      ...(params.startDate ? { start_time: new Date(params.startDate).toISOString() } : {}),
      ...(params.endDate ? { end_time: new Date(params.endDate).toISOString() } : {}),
    });
    return String(json.id);
  }

  async createAdCreative(imageUrl: string, caption: string): Promise<string> {
    const objectStorySpec = {
      page_id: this.pageId,
      link_data: { picture: imageUrl, message: caption },
    };
    const json = await this.call(`/act_${this.adAccountId}/adcreatives`, {
      object_story_spec: JSON.stringify(objectStorySpec),
    });
    return String(json.id);
  }

  async createAd(params: { adSetId: string; creativeId: string; name: string }): Promise<string> {
    const json = await this.call(`/act_${this.adAccountId}/ads`, {
      name: params.name,
      adset_id: params.adSetId,
      creative: JSON.stringify({ creative_id: params.creativeId }),
      status: 'PAUSED',
    });
    return String(json.id);
  }

  async setCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
    await this.call(`/${campaignId}`, { status });
  }

  private async call(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...body, access_token: this.accessToken }).toString(),
    });
    const json = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || json.error) {
      throw new Error(`Marketing API ${path}: ${json.error?.message ?? `HTTP ${res.status}`}`);
    }
    return json;
  }
}
