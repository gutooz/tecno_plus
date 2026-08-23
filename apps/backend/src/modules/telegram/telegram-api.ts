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
  /** Presente quando a foto faz parte de um álbum (várias fotos numa mensagem só). */
  media_group_id?: string;
}

export interface TgCallbackQuery {
  id: string;
  data?: string;
  from: { id: number; first_name?: string; username?: string };
  message?: TgMessage;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TgInlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
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

  async sendMessage(
    chatId: number | string,
    text: string,
    replyMarkup?: TgInlineKeyboard,
  ): Promise<void> {
    const res = await fetch(`${this.base}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) throw new Error(`sendMessage: ${json.description ?? 'erro'}`);
  }

  /** Manda foto (por URL) com legenda e, opcionalmente, botões inline. Devolve o message_id. */
  async sendPhoto(
    chatId: number | string,
    photoUrl: string,
    caption: string,
    replyMarkup?: TgInlineKeyboard,
  ): Promise<number> {
    const res = await fetch(`${this.base}/sendPhoto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };
    if (!json.ok || !json.result) throw new Error(`sendPhoto: ${json.description ?? 'erro'}`);
    return json.result.message_id;
  }

  /** Troca a legenda (e os botões) de uma mensagem de foto já enviada. */
  async editMessageCaption(
    chatId: number | string,
    messageId: number,
    caption: string,
    replyMarkup?: TgInlineKeyboard,
  ): Promise<void> {
    await fetch(`${this.base}/editMessageCaption`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
  }

  /** Fecha o "carregando" do botão pressionado; `text` vira um toast rápido no app. */
  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await fetch(`${this.base}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  }
}
