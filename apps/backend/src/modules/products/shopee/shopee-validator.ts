import { ShopeeTemplate, SHOPEE_LIMITS } from './shopee-template';
import { MappedProduct, ShopeeRow } from './shopee-mapper';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VALIDADOR — verifica os dados JÁ corrigidos e sinaliza o que restou
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `error`   → a Shopee rejeitará a linha se não for corrigido (ex.: peso ausente,
 *             preço fora da faixa, descrição curta demais). Não inventamos o valor.
 * `warning` → aceita, mas convém revisar (ex.: categoria ausente, campos fiscais
 *             não preenchidos, nenhum canal logístico ativado).
 *
 * Os limites usados aqui (SHOPEE_LIMITS) e os campos "Condicional obrigatório"
 * vêm da linha de formato/obrigatoriedade do arquivo oficial baixado do Seller
 * Center — não são estimativa.
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

const EMOJI_RE =
  // eslint-disable-next-line no-misleading-character-class -- detecção proposital de ZWJ/seletores de variação
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/u;
const URL_RE = /^https?:\/\/\S+$/i;
const GTIN_RE = /^\d+$/;

// Colunas do bloco fiscal/NF-e — usadas para o aviso agregado (uma mensagem
// por linha, não uma por campo, senão o relatório vira ruído).
const FISCAL_KEYS = [
  'ncm',
  'cfop_mesmo_estado',
  'cfop_outro_estado',
  'origem',
  'csosn',
  'cest',
  'unidade_medida',
  'cst_pis_cofins',
  'pct_tributos',
  'tipo_operacao',
];
const CANAL_KEYS = ['canal_xpress_cpf', 'canal_retirada_comprador'];

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

  // Só cobra canal/fiscal se a coluna existir de fato no template resolvido
  // (oficial ou referência — ambos já incluem essas colunas hoje).
  const hasCanalColumns = template.columns.some((c) => CANAL_KEYS.includes(c.key));
  const hasFiscalColumns = template.columns.some((c) => FISCAL_KEYS.includes(c.key));

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
      // ── Categoria (Opcional no arquivo oficial atual) ───────────────────
      const categoria = text(row, 'categoria');
      if (!categoria) {
        add(
          i,
          'warning',
          'categoria_ausente',
          'Categoria vazia — a Shopee vai recomendar uma na importação. A coluna espera o ID ' +
            'numérico da Árvore de Categorias (ex.: 120039), e a categoria que a IA infere é texto, ' +
            'que o importador recusa. Para escolher você mesmo, pegue o ID no Seller Center.',
          'categoria',
        );
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
            'error',
            'nome_curto',
            `Título com ${nome.length} caractere(s) — mínimo ${SHOPEE_LIMITS.titleMin}.`,
            'nome',
          );
        if (nome.length > titleMax)
          add(i, 'error', 'nome_longo', `Título excede ${titleMax} caracteres.`, 'nome');
        if (EMOJI_RE.test(nome))
          add(i, 'error', 'nome_emoji', 'Título contém emoji/caractere proibido.', 'nome');
      }

      // ── Descrição ──────────────────────────────────────────────────────
      const descricao = text(row, 'descricao');
      if (!descricao) {
        add(i, 'error', 'descricao_ausente', 'Descrição obrigatória ausente.', 'descricao');
      } else {
        if (descricao.length < SHOPEE_LIMITS.descriptionMin)
          add(
            i,
            'error',
            'descricao_curta',
            `Descrição com ${descricao.length} caractere(s) — mínimo ${SHOPEE_LIMITS.descriptionMin}.`,
            'descricao',
          );
        if (descricao.length > descMax)
          add(
            i,
            'error',
            'descricao_longa',
            `Descrição excede ${descMax} caracteres.`,
            'descricao',
          );
      }

      // ── Preço (não inferível → erro, nunca inventado) ──────────────────
      const preco = number(row, 'preco');
      if (preco == null) {
        add(
          i,
          'error',
          'preco_ausente',
          'Preço ausente — não é possível inferir com segurança.',
          'preco',
        );
      } else if (preco < SHOPEE_LIMITS.priceMin || preco > SHOPEE_LIMITS.priceMax) {
        add(
          i,
          'error',
          'preco_fora_da_faixa',
          `Preço ${preco} fora da faixa aceita pela Shopee (${SHOPEE_LIMITS.priceMin.toFixed(2)}–${SHOPEE_LIMITS.priceMax.toFixed(2)}).`,
          'preco',
        );
      }

      // ── Estoque ────────────────────────────────────────────────────────
      const estoque = number(row, 'estoque');
      if (estoque == null) {
        add(i, 'error', 'estoque_ausente', 'Estoque obrigatório ausente.', 'estoque');
      } else if (estoque < SHOPEE_LIMITS.stockMin || !Number.isInteger(estoque)) {
        add(
          i,
          'error',
          'estoque_invalido',
          `Estoque deve ser inteiro ≥ ${SHOPEE_LIMITS.stockMin}.`,
          'estoque',
        );
      } else if (estoque > SHOPEE_LIMITS.stockMax) {
        add(
          i,
          'error',
          'estoque_excede_limite',
          `Estoque ${estoque} excede o limite da Shopee (${SHOPEE_LIMITS.stockMax}).`,
          'estoque',
        );
      }

      // ── Peso (obrigatório, não inferível pelos dados atuais) ───────────
      const peso = number(row, 'peso');
      if (peso == null || peso <= 0) {
        add(
          i,
          'error',
          'peso_ausente',
          'Peso (kg) obrigatório e não disponível nos dados — preencha antes de importar.',
          'peso',
        );
      } else if (peso > SHOPEE_LIMITS.weightMax) {
        add(
          i,
          'error',
          'peso_excede_limite',
          `Peso ${peso}kg excede o limite da Shopee (${SHOPEE_LIMITS.weightMax}kg).`,
          'peso',
        );
      }

      // ── Dimensões: tudo ou nada (0 é um valor válido, não "vazio") ─────
      const dimCols: Array<[string, number | undefined]> = [
        ['comprimento', number(row, 'comprimento')],
        ['largura', number(row, 'largura')],
        ['altura', number(row, 'altura')],
      ];
      const filled = dimCols.filter(([, d]) => d != null).length;
      if (filled > 0 && filled < 3) {
        add(
          i,
          'warning',
          'dimensoes_incompletas',
          'Preencha comprimento, largura e altura juntos — ou deixe os três vazios.',
          'comprimento',
        );
      }
      for (const [col, d] of dimCols) {
        if (d != null && (d < 0 || d > SHOPEE_LIMITS.dimensionMax)) {
          add(
            i,
            'error',
            'dimensao_fora_da_faixa',
            `${col[0].toUpperCase()}${col.slice(1)} ${d} fora da faixa aceita (0–${SHOPEE_LIMITS.dimensionMax}).`,
            col,
          );
        }
      }

      // ── Imagem de capa (Opcional para o upload; obrigatória p/ publicar) ─
      const capa = text(row, 'foto_capa');
      if (!capa) {
        add(
          i,
          'warning',
          'sem_capa',
          'Sem imagem de capa. Aceito no upload em massa, mas obrigatório antes de o anúncio poder ser publicado.',
          'foto_capa',
        );
      } else if (!URL_RE.test(capa)) {
        add(
          i,
          'warning',
          'capa_nao_url',
          'A capa não parece uma URL pública (https://…) — a Shopee importa por URL.',
          'foto_capa',
        );
      }

      // ── GTIN: se preenchido, precisa ter o formato certo ───────────────
      const gtin = text(row, 'gtin');
      if (
        gtin &&
        (!GTIN_RE.test(gtin) ||
          gtin.length < SHOPEE_LIMITS.gtinMinLength ||
          gtin.length > SHOPEE_LIMITS.gtinMaxLength)
      ) {
        add(
          i,
          'warning',
          'gtin_invalido',
          `GTIN "${gtin}" deve ter ${SHOPEE_LIMITS.gtinMinLength}–${SHOPEE_LIMITS.gtinMaxLength} dígitos numéricos.`,
          'gtin',
        );
      }

      // ── Variações: integração obrigatória quando há variação ───────────
      const varNome1 = text(row, 'var_nome1');
      const varOpcao1 = text(row, 'var_opcao1');
      const varNome2 = text(row, 'var_nome2');
      const varOpcao2 = text(row, 'var_opcao2');
      const temVariacao = varNome1 || varOpcao1 || varNome2 || varOpcao2;
      const varIntegracao = text(row, 'var_integracao');
      if (temVariacao && !varIntegracao) {
        add(
          i,
          'error',
          'var_sem_integracao',
          'Produto com variação exige Número de Integração da Variação.',
          'var_integracao',
        );
      }
      if (varIntegracao.length > SHOPEE_LIMITS.variationIntegrationMaxLength) {
        add(
          i,
          'error',
          'var_integracao_longa',
          `Número de Integração com ${varIntegracao.length} caracteres — máximo ${SHOPEE_LIMITS.variationIntegrationMaxLength}.`,
          'var_integracao',
        );
      }
      for (const [col, val] of [
        ['var_nome1', varNome1],
        ['var_opcao1', varOpcao1],
        ['var_nome2', varNome2],
        ['var_opcao2', varOpcao2],
      ] as const) {
        if (val && val.length > SHOPEE_LIMITS.variationNameMaxLength) {
          add(
            i,
            'error',
            'var_texto_longo',
            `"${val}" tem ${val.length} caracteres — máximo ${SHOPEE_LIMITS.variationNameMaxLength}.`,
            col,
          );
        }
      }

      // ── SKU duplicado (defensivo; o autofix já deduplica) e tamanho ────
      const skuRaw = text(row, 'sku');
      const sku = skuRaw.toLowerCase();
      if (sku) {
        const owner = seenSku.get(sku);
        if (owner && owner !== mp.productSku)
          add(
            i,
            'error',
            'sku_duplicado',
            `SKU "${skuRaw}" duplicado (também em ${owner}).`,
            'sku',
          );
        else seenSku.set(sku, mp.productSku);
      }
      if (skuRaw.length > SHOPEE_LIMITS.skuMaxLength)
        add(
          i,
          'error',
          'sku_longo',
          `SKU com ${skuRaw.length} caracteres — máximo ${SHOPEE_LIMITS.skuMaxLength}.`,
          'sku',
        );
      const skuPai = text(row, 'sku_pai');
      if (skuPai.length > SHOPEE_LIMITS.skuMaxLength)
        add(
          i,
          'error',
          'sku_pai_longo',
          `SKU principal com ${skuPai.length} caracteres — máximo ${SHOPEE_LIMITS.skuMaxLength}.`,
          'sku_pai',
        );

      // ── Canal logístico: a Shopee exige pelo menos 1 canal ativo ───────
      if (hasCanalColumns) {
        const algumAtivo = CANAL_KEYS.some((k) => {
          const v = text(row, k).toLowerCase();
          return v === 'ativar' || v === 'ativado' || v === 'on' || v === 'sim';
        });
        if (!algumAtivo) {
          add(
            i,
            'warning',
            'sem_canal_ativo',
            'Nenhum canal logístico ativado — a Shopee exige pelo menos 1 canal ativo por produto ("Ativar"/"Off" nas colunas de canal).',
          );
        }
      }

      // ── Fiscal/NF-e: aviso agregado (depende da categoria/regime) ──────
      if (hasFiscalColumns) {
        const algumPreenchido = FISCAL_KEYS.some((k) => text(row, k));
        if (!algumPreenchido) {
          add(
            i,
            'warning',
            'fiscal_incompleto',
            'Campos fiscais (NCM, CFOP, CSOSN, CEST, Unidade de Medida...) vazios — a Shopee os exige dependendo da categoria/regime tributário. Confirme com o time fiscal antes de importar.',
          );
        }
      }
    });

    // ── Proporção de preço entre variações do mesmo produto ──────────────
    const precos = mp.rows
      .map((row) => number(row, 'preco'))
      .filter((p): p is number => p != null && p > 0);
    if (precos.length > 1) {
      const max = Math.max(...precos);
      const min = Math.min(...precos);
      const ratio = max / min;
      if (ratio > SHOPEE_LIMITS.maxVariationPriceRatio) {
        add(
          0,
          'error',
          'proporcao_preco_variacoes',
          `Preço mais caro (${max}) ÷ mais barato (${min}) = ${ratio.toFixed(2)} — acima do limite da Shopee (${SHOPEE_LIMITS.maxVariationPriceRatio}).`,
          'preco',
        );
      }
    }
  }

  return issues;
}

/** Conjunto de produtos com pelo menos 1 erro (serão rejeitados pela Shopee). */
export function rejectedProductIds(issues: Issue[]): Set<string> {
  const set = new Set<string>();
  for (const it of issues) if (it.level === 'error') set.add(it.productId);
  return set;
}
