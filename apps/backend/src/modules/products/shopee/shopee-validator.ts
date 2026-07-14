import { ShopeeTemplate, SHOPEE_LIMITS } from './shopee-template';
import { MappedProduct, ShopeeRow } from './shopee-mapper';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VALIDADOR — verifica os dados JÁ corrigidos e sinaliza o que restou
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `error`   → a Shopee rejeitará a linha se não for corrigido (ex.: peso ausente,
 *             preço inválido, sem imagem de capa). Não inventamos o valor.
 * `warning` → aceita, mas convém revisar (ex.: categoria sem ID numérico oficial,
 *             título curto, dimensões incompletas).
 */

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  productId: string;
  productSku: string;
  /** Índice da linha do produto (0-based) — produtos com variações têm várias. */
  rowIndex: number;
  column?: string;
  code: string;
  level: IssueLevel;
  message: string;
}

// eslint-disable-next-line no-misleading-character-class -- detecção proposital de ZWJ/seletores de variação
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/u;
const URL_RE = /^https?:\/\/\S+$/i;

function text(row: ShopeeRow, key: string): string {
  const v = row.values[key];
  return v == null ? '' : String(v).trim();
}
function number(row: ShopeeRow, key: string): number | undefined {
  const v = row.values[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Valida todas as linhas de todos os produtos. */
export function validate(products: MappedProduct[], template: ShopeeTemplate): Issue[] {
  const issues: Issue[] = [];
  const titleMax =
    template.columns.find((c) => c.key === 'nome')?.maxLength ?? SHOPEE_LIMITS.titleMax;
  const descMax =
    template.columns.find((c) => c.key === 'descricao')?.maxLength ?? SHOPEE_LIMITS.descriptionMax;
  const seenSku = new Map<string, string>(); // sku → productSku que o usou primeiro

  for (const mp of products) {
    const add = (
      rowIndex: number,
      level: IssueLevel,
      code: string,
      message: string,
      column?: string,
    ): void => {
      issues.push({
        productId: mp.productId,
        productSku: mp.productSku,
        rowIndex,
        column,
        code,
        level,
        message,
      });
    };

    mp.rows.forEach((row, i) => {
      // ── Categoria ──────────────────────────────────────────────────────
      const categoria = text(row, 'categoria');
      if (!categoria) {
        add(i, 'error', 'categoria_ausente', 'Categoria obrigatória ausente.', 'categoria');
      } else if (!/^\d+$/.test(categoria)) {
        add(
          i,
          'warning',
          'categoria_sem_id',
          `Categoria "${categoria}" não é um ID numérico da Shopee — confirme no Seller Center.`,
          'categoria',
        );
      }

      // ── Nome ───────────────────────────────────────────────────────────
      const nome = text(row, 'nome');
      if (!nome) {
        add(i, 'error', 'nome_ausente', 'Nome do produto obrigatório ausente.', 'nome');
      } else {
        if (nome.length < SHOPEE_LIMITS.titleMin)
          add(
            i,
            'warning',
            'nome_curto',
            `Título com ${nome.length} caracteres (mín. recomendado ${SHOPEE_LIMITS.titleMin}).`,
            'nome',
          );
        if (nome.length > titleMax)
          add(i, 'error', 'nome_longo', `Título excede ${titleMax} caracteres.`, 'nome');
        if (EMOJI_RE.test(nome))
          add(i, 'error', 'nome_emoji', 'Título contém emoji/caractere proibido.', 'nome');
      }

      // ── Descrição ──────────────────────────────────────────────────────
      const descricao = text(row, 'descricao');
      if (!descricao)
        add(i, 'error', 'descricao_ausente', 'Descrição obrigatória ausente.', 'descricao');
      else if (descricao.length > descMax)
        add(i, 'error', 'descricao_longa', `Descrição excede ${descMax} caracteres.`, 'descricao');

      // ── Preço (não inferível → erro, nunca inventado) ──────────────────
      const preco = number(row, 'preco');
      if (preco == null || preco <= 0)
        add(
          i,
          'error',
          'preco_invalido',
          'Preço ausente ou inválido — não é possível inferir com segurança.',
          'preco',
        );

      // ── Estoque ────────────────────────────────────────────────────────
      const estoque = number(row, 'estoque');
      if (estoque == null)
        add(i, 'error', 'estoque_ausente', 'Estoque obrigatório ausente.', 'estoque');
      else if (estoque < 0 || !Number.isInteger(estoque))
        add(i, 'error', 'estoque_invalido', 'Estoque deve ser inteiro ≥ 0.', 'estoque');

      // ── Peso (obrigatório, não inferível pelos dados atuais) ───────────
      const peso = number(row, 'peso');
      if (peso == null || peso <= 0)
        add(
          i,
          'error',
          'peso_ausente',
          'Peso (kg) obrigatório e não disponível nos dados — preencha antes de importar.',
          'peso',
        );

      // ── Dimensões: tudo ou nada ────────────────────────────────────────
      const dims = [number(row, 'comprimento'), number(row, 'largura'), number(row, 'altura')];
      const filled = dims.filter((d) => d != null && d > 0).length;
      if (filled > 0 && filled < 3)
        add(
          i,
          'warning',
          'dimensoes_incompletas',
          'Preencha comprimento, largura e altura juntos — ou deixe os três vazios.',
          'comprimento',
        );

      // ── Imagem de capa ─────────────────────────────────────────────────
      const capa = text(row, 'foto_capa');
      if (!capa) add(i, 'error', 'sem_capa', 'Imagem de capa obrigatória ausente.', 'foto_capa');
      else if (!URL_RE.test(capa))
        add(
          i,
          'warning',
          'capa_nao_url',
          'A capa não parece uma URL pública (https://…) — a Shopee importa por URL.',
          'foto_capa',
        );

      // ── Variações: integração obrigatória quando há variação ───────────
      const temVariacao =
        text(row, 'var_nome1') ||
        text(row, 'var_opcao1') ||
        text(row, 'var_nome2') ||
        text(row, 'var_opcao2');
      if (temVariacao && !text(row, 'var_integracao'))
        add(
          i,
          'error',
          'var_sem_integracao',
          'Produto com variação exige Número de Integração da Variação.',
          'var_integracao',
        );

      // ── SKU duplicado (defensivo; o autofix já deduplica) ──────────────
      const sku = text(row, 'sku').toLowerCase();
      if (sku) {
        const owner = seenSku.get(sku);
        if (owner && owner !== mp.productSku)
          add(
            i,
            'error',
            'sku_duplicado',
            `SKU "${text(row, 'sku')}" duplicado (também em ${owner}).`,
            'sku',
          );
        else seenSku.set(sku, mp.productSku);
      }
    });
  }

  return issues;
}

/** Conjunto de produtos com pelo menos 1 erro (serão rejeitados pela Shopee). */
export function rejectedProductIds(issues: Issue[]): Set<string> {
  const set = new Set<string>();
  for (const it of issues) if (it.level === 'error') set.add(it.productId);
  return set;
}
