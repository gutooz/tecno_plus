import { ShopeeTemplate, SHOPEE_LIMITS } from './shopee-template';
import { MappedProduct } from './shopee-mapper';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTOFIX — corrige automaticamente o que É corrigível SEM inventar dados
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O que corrige: título (emoji/caracteres proibidos, espaços, repetição, limite),
 * descrição (controle + limite), preço (2 casas), estoque (default/negativo/
 * inteiro) e SKU duplicado (sufixo). Cada correção é registrada.
 *
 * O que NÃO faz: inventar peso, preço, categoria numérica ou qualquer campo
 * obrigatório ausente. Isso é papel do validador, que sinaliza no relatório.
 */

export interface Correction {
  productId: string;
  productSku: string;
  column: string;
  before: string;
  after: string;
  reason: string;
}

// Emoji e símbolos pictográficos + juntores/variação (proibidos em título Shopee).
// eslint-disable-next-line no-misleading-character-class -- remoção proposital de ZWJ/seletores de variação
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu;
// Caracteres de controle (exceto tab/newline que já colapsamos).
// eslint-disable-next-line no-control-regex -- remoção proposital de caracteres de controle
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, '');
}
function stripControl(s: string): string {
  return s.replace(CONTROL_RE, '');
}
function collapseSpaces(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Reduz repetição excessiva: uma mesma palavra (≥4 letras) no máx. 2 vezes. */
function reduceRepetition(title: string): string {
  const words = title.split(/(\s+)/); // mantém separadores
  const counts = new Map<string, number>();
  const out: string[] = [];
  for (const token of words) {
    if (/^\s+$/.test(token) || token.length < 4) {
      out.push(token);
      continue;
    }
    const norm = token
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const n = (counts.get(norm) ?? 0) + 1;
    counts.set(norm, n);
    if (n <= 2) out.push(token);
    // além de 2 ocorrências: descarta a palavra (e o espaço anterior órfão é limpo depois)
  }
  return collapseSpaces(out.join(''));
}

/** Corta no limite de caracteres respeitando a fronteira de palavra. */
function clampLength(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Inteiro aleatório dentro da faixa de estoque padrão (dropshipping). */
function randomStock(): number {
  const { defaultStockMin: min, defaultStockMax: max } = SHOPEE_LIMITS;
  return Math.floor(min + Math.random() * (max - min + 1));
}

function push(
  list: Correction[],
  mp: MappedProduct,
  column: string,
  before: unknown,
  after: unknown,
  reason: string,
): void {
  const b = String(before ?? '');
  const a = String(after ?? '');
  if (b === a) return;
  list.push({
    productId: mp.productId,
    productSku: mp.productSku,
    column,
    before: b,
    after: a,
    reason,
  });
}

/**
 * Aplica correções nas linhas (mutação) e devolve o log de correções.
 * Roda ANTES da validação final para que o relatório mostre só o que sobrou.
 */
export function autofix(products: MappedProduct[], template: ShopeeTemplate): Correction[] {
  const corrections: Correction[] = [];
  const usedSkus = new Set<string>();

  const titleCol = template.columns.find((c) => c.key === 'nome');
  const descCol = template.columns.find((c) => c.key === 'descricao');
  const titleMax = titleCol?.maxLength ?? SHOPEE_LIMITS.titleMax;
  const descMax = descCol?.maxLength ?? SHOPEE_LIMITS.descriptionMax;

  for (const mp of products) {
    for (const row of mp.rows) {
      const v = row.values;

      // ── Título ────────────────────────────────────────────────────────
      if (typeof v.nome === 'string' && v.nome) {
        const before = v.nome;
        let title = stripControl(stripEmoji(before));
        title = collapseSpaces(title);
        title = reduceRepetition(title);
        title = clampLength(title, titleMax);
        if (title !== before) {
          v.nome = title;
          push(
            corrections,
            mp,
            'nome',
            before,
            title,
            'Título saneado (emoji/limite/repetição/espaços).',
          );
        }
      }

      // ── Descrição ─────────────────────────────────────────────────────
      if (typeof v.descricao === 'string' && v.descricao) {
        const before = v.descricao;
        let desc = collapseSpaces(stripControl(before));
        desc = clampLength(desc, descMax);
        if (desc !== before) {
          v.descricao = desc;
          push(corrections, mp, 'descricao', before, desc, 'Descrição saneada (controle/limite).');
        }
      }

      // ── Preço: 2 casas decimais ───────────────────────────────────────
      if (typeof v.preco === 'number' && Number.isFinite(v.preco) && v.preco > 0) {
        const rounded = Math.round(v.preco * 100) / 100;
        if (rounded !== v.preco) {
          push(corrections, mp, 'preco', v.preco, rounded, 'Preço arredondado para 2 casas.');
          v.preco = rounded;
        }
      }

      // ── Estoque: default (dropshipping) / negativo / inteiro ──────────
      if (v.estoque === '' || v.estoque == null) {
        const generated = randomStock();
        push(
          corrections,
          mp,
          'estoque',
          '',
          generated,
          `Estoque ausente — gerado ${generated} (faixa ${SHOPEE_LIMITS.defaultStockMin}–${SHOPEE_LIMITS.defaultStockMax}, modelo dropshipping).`,
        );
        v.estoque = generated;
      } else if (typeof v.estoque === 'number') {
        if (v.estoque < 0) {
          push(corrections, mp, 'estoque', v.estoque, 0, 'Estoque negativo ajustado para 0.');
          v.estoque = 0;
        } else if (!Number.isInteger(v.estoque)) {
          const floored = Math.floor(v.estoque);
          push(corrections, mp, 'estoque', v.estoque, floored, 'Estoque arredondado para inteiro.');
          v.estoque = floored;
        }
      }

      // ── SKU único ─────────────────────────────────────────────────────
      const sku = String(v.sku ?? '').trim();
      if (sku) {
        let unique = sku;
        let n = 2;
        while (usedSkus.has(unique.toLowerCase())) unique = `${sku}-${n++}`;
        if (unique !== sku) {
          push(corrections, mp, 'sku', sku, unique, 'SKU duplicado — renomeado para ficar único.');
          v.sku = unique;
        }
        usedSkus.add(unique.toLowerCase());
      }
    }
  }

  return corrections;
}
