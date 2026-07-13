/**
 * Extrai TÍTULO + PREÇO de uma legenda livre do Telegram.
 * Formatos aceitos (o preço é sempre o último número / vem após uma pista):
 *   "Copo térmico 502ml 16"
 *   "Kit de facas R$ 25,90"
 *   "Garrafa Stitch 500ml - 10"
 *   "Jogo de copos  paguei 18"
 */
export interface ParsedCaption {
  title: string;
  price: number;
}

/** Converte "1.234,56" | "16,90" | "16.90" | "1.234" | "16" em número. */
export function parseBRL(input: string): number {
  const s = input.replace(/[^\d.,]/g, '');
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) {
    return Number(s.replace(/\./g, '').replace(',', '.')); // 1.234,56
  }
  if (s.includes(',')) return Number(s.replace(',', '.')); // 16,90
  const parts = s.split('.');
  if (parts.length > 1 && parts[parts.length - 1].length === 3) {
    return Number(s.replace(/\./g, '')); // 1.234 → milhar
  }
  return Number(s); // 16.90 | 16
}

export function parseCaption(raw: string): ParsedCaption {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { title: 'Produto', price: 0 };

  // 1) Preço com pista explícita (R$, paguei, custo, preço, valor, por)
  const cue = text.match(/(?:r\$|paguei|custo(?:u)?|pre[cç]o|valor|por)\s*:?\s*(\d[\d.,]*\d|\d)/i);
  // 2) Ou número solto no fim (opcionalmente "reais")
  const trailing = text.match(/(?:^|\s)(\d[\d.,]*\d|\d)\s*(?:reais)?\s*$/i);

  const m = cue ?? trailing;
  if (!m || m.index === undefined) {
    return { title: text, price: 0 };
  }

  const price = parseBRL(m[1]);
  const before = text
    .slice(0, m.index)
    .replace(/(?:r\$|paguei|custo(?:u)?|pre[cç]o|valor|por)\s*:?\s*$/i, '')
    .replace(/[-:–—]\s*$/, '')
    .trim();
  const after = text
    .slice(m.index + m[0].length)
    .replace(/^\s*reais\b/i, '')
    .trim();

  const title = `${before} ${after}`.replace(/\s+/g, ' ').trim() || 'Produto';
  return { title, price };
}
