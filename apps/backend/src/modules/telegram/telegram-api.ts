/**
 * Cliente mínimo da Bot API do Telegram via long-polling (não precisa de URL
 * pública / webhook — ideal para rodar local). Só os métodos que usamos.
 */

export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number; type: string; first_name?: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export class TelegramApi {
  private readonly base: string;
  private readonly fileBase: string;

  constructor(private readonly token: string) {
    this.base = `https://api.telegram.org/bot${token}`;
    this.fileBase = `https://api.telegram.org/file/bot${token}`;
  }

  /** Long-poll: bloqueia até `timeout`s ou até chegar update. */
  async getUpdates(offset: number, timeout = 30): Promise<TgUpdate[]> {
    const res = await fetch(`${this.base}/getUpdates?offset=${offset}&timeout=${timeout}`, {
      // margem sobre o long-poll para a conexão não morrer antes do servidor responder
      signal: AbortSignal.timeout((timeout + 15) * 1000),
    });
    const json = (await res.json()) as { ok: boolean; result?: TgUpdate[]; description?: string };
    if (!json.ok) throw new Error(`getUpdates: ${json.description ?? 'erro'}`);
    return json.result ?? [];
  }

  /** Resolve o caminho do arquivo a partir do file_id. */
  async getFilePath(fileId: string): Promise<string> {
    const res = await fetch(`${this.base}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const json = (await res.json()) as {
      ok: boolean;
      result?: { file_path: string };
      description?: string;
    };
    if (!json.ok || !json.result) throw new Error(`getFile: ${json.description ?? 'erro'}`);
    return json.result.file_path;
  }

  /** Baixa o binário de um arquivo do Telegram. */
  async download(filePath: string): Promise<Buffer> {
    const res = await fetch(`${this.fileBase}/${filePath}`);
    if (!res.ok) throw new Error(`download: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    await fetch(`${this.base}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  }
}
