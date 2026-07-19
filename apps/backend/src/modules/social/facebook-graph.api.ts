/**
 * Cliente mínimo da Graph API (Facebook Pages + Instagram Graph API) — só os
 * métodos que usamos: publicar uma foto na Página e publicar uma imagem no
 * Instagram (fluxo em 2 passos: cria o container em `/media`, depois publica
 * com `/media_publish`).
 */

export interface GraphPhotoResult {
  id: string; // id do post/foto na Página
  postId?: string;
}

/** Métricas de engajamento de UM post/mídia publicado — usado pelo Analytics Agent (Fase 6). */
export interface GraphPostInsights {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
}

type GraphInsightMetric = { name: string; values: { value: number }[] };

export class FacebookGraphApi {
  private readonly base: string;

  constructor(
    private readonly pageId: string,
    private readonly instagramBusinessAccountId: string,
    private readonly accessToken: string,
    apiVersion: string,
  ) {
    this.base = `https://graph.facebook.com/${apiVersion}`;
  }

  /** Publica uma foto (com legenda) no feed da Página do Facebook. */
  async postPagePhoto(imageUrl: string, caption: string): Promise<GraphPhotoResult> {
    const json = await this.call(`/${this.pageId}/photos`, {
      url: imageUrl,
      caption,
      access_token: this.accessToken,
    });
    const postId = json.post_id ? String(json.post_id) : undefined;
    return { id: String(json.id ?? postId), postId };
  }

  /** Passo 1/2 do Instagram: cria o container de mídia. Devolve o `creation_id`. */
  async createInstagramMedia(imageUrl: string, caption: string): Promise<string> {
    const json = await this.call(`/${this.instagramBusinessAccountId}/media`, {
      image_url: imageUrl,
      caption,
      access_token: this.accessToken,
    });
    return String(json.id);
  }

  /** Passo 2/2 do Instagram: publica o container criado em `createInstagramMedia`. */
  async publishInstagramMedia(creationId: string): Promise<string> {
    const json = await this.call(`/${this.instagramBusinessAccountId}/media_publish`, {
      creation_id: creationId,
      access_token: this.accessToken,
    });
    return String(json.id);
  }

  /**
   * Insights de um post do feed da Página (curtidas/comentários/compartilhamentos
   * vêm do objeto do post; alcance/impressões vêm do endpoint `/insights` — a Graph
   * API separa os dois). `post_impressions*` só existe enquanto a Página tiver
   * volume mínimo de atividade; se vier vazio, os campos ficam 0 (não é erro).
   */
  async getPagePostInsights(postId: string): Promise<GraphPostInsights> {
    const [post, insights] = await Promise.all([
      this.getJson(`/${postId}`, {
        fields: 'likes.summary(true),comments.summary(true),shares',
        access_token: this.accessToken,
      }),
      this.getJson(`/${postId}/insights`, {
        metric: 'post_impressions,post_impressions_unique',
        access_token: this.accessToken,
      }).catch(() => ({ data: [] as GraphInsightMetric[] })),
    ]);

    const metric = (name: string) => this.metricValue(insights.data as GraphInsightMetric[], name);
    const likesObj = post.likes as { summary?: { total_count?: number } } | undefined;
    const commentsObj = post.comments as { summary?: { total_count?: number } } | undefined;
    const sharesObj = post.shares as { count?: number } | undefined;

    return {
      likes: likesObj?.summary?.total_count ?? 0,
      comments: commentsObj?.summary?.total_count ?? 0,
      shares: sharesObj?.count ?? 0,
      saves: 0, // não existe conceito de "salvar" no feed do Facebook
      impressions: metric('post_impressions'),
      reach: metric('post_impressions_unique'),
    };
  }

  /** Insights de uma mídia do Instagram (curtidas/comentários/salvamentos/alcance/impressões). */
  async getInstagramMediaInsights(mediaId: string): Promise<GraphPostInsights> {
    const insights = await this.getJson(`/${mediaId}/insights`, {
      metric: 'impressions,reach,likes,comments,saved,shares',
      access_token: this.accessToken,
    });
    const data = insights.data as GraphInsightMetric[];
    const metric = (name: string) => this.metricValue(data, name);

    return {
      likes: metric('likes'),
      comments: metric('comments'),
      shares: metric('shares'),
      saves: metric('saved'),
      impressions: metric('impressions'),
      reach: metric('reach'),
    };
  }

  private metricValue(data: GraphInsightMetric[], name: string): number {
    return data?.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
  }

  private async getJson(
    path: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${path}?${new URLSearchParams(params).toString()}`);
    const json = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || json.error) {
      throw new Error(`Graph API ${path}: ${json.error?.message ?? `HTTP ${res.status}`}`);
    }
    return json;
  }

  private async call(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    const json = (await res.json()) as Record<string, unknown> & {
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      throw new Error(`Graph API ${path}: ${json.error?.message ?? `HTTP ${res.status}`}`);
    }
    return json;
  }
}
