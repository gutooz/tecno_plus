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
