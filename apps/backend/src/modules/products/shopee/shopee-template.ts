import { promises as fs } from 'fs';
import ExcelJS from 'exceljs';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ESQUEMA DO MODELO DE IMPORTAÇÃO EM MASSA — SHOPEE BRASIL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * REGRA Nº 1 DO PROJETO: nunca inventar colunas nem presumir o layout.
 *
 * Por isso este arquivo tem DUAS fontes possíveis de verdade, nesta ordem:
 *
 *   1. `official-file` — se `SHOPEE_TEMPLATE_PATH` (ou o parâmetro `templatePath`)
 *      apontar para o .xlsx oficial baixado no Seller Center, lemos os cabeçalhos
 *      REAIS daquele arquivo e escrevemos os dados nas colunas exatas dele. É o
 *      caminho 100% compatível — e adapta-se automaticamente se a Shopee mudar o
 *      layout: basta trocar o arquivo.
 *
 *   2. `reference` — sem arquivo oficial, usamos o esquema de referência abaixo,
 *      derivado da documentação oficial da Shopee (Seller Education Hub / Mass
 *      Upload User Guide). Ele NÃO é um palpite de colunas soltas: reproduz os
 *      grupos e campos oficiais (Informações Básicas, Variação, Venda, Envio,
 *      Mídia). Ainda assim, como os rótulos exatos podem variar por categoria e
 *      versão, todo arquivo gerado neste modo é claramente marcado como
 *      "referência" e recomenda plugar o arquivo oficial.
 *
 * Regras oficiais que o esquema respeita (fonte: guias da Shopee):
 *   • As 4 primeiras linhas são instruções e NÃO devem ser editadas; os dados
 *     começam na linha 5.
 *   • Cada opção de variação é uma nova linha; variações do mesmo produto
 *     compartilham o mesmo "Número de Integração da Variação".
 *   • Estoque 0 para variações indisponíveis.
 *   • Imagens entram como URL.
 */

export type ShopeeFieldGroup = 'basica' | 'variacao' | 'venda' | 'envio' | 'midia';

export interface ShopeeColumn {
  /** Chave interna estável usada pelo mapper/validador (não vai para a planilha). */
  key: string;
  /** Rótulo EXATO da coluna, como escrito na linha de cabeçalho da planilha. */
  header: string;
  group: ShopeeFieldGroup;
  /** Obrigatória em todo anúncio. */
  required?: boolean;
  /** Obrigatória apenas quando o produto tem variações. */
  requiredForVariations?: boolean;
  /** O valor válido depende da categoria da Shopee (ex.: ID de categoria, atributos). */
  categoryDependent?: boolean;
  /** Dica de formato exibida na linha de instrução (e usada em algumas validações). */
  format?: string;
  /** Limite de caracteres validado (conservador quando a Shopee não publica o exato). */
  maxLength?: number;
  /** Nota/definição exibida na linha de instrução. */
  note?: string;
}

export interface ShopeeTemplate {
  version: string;
  region: 'BR';
  source: 'reference' | 'official-file';
  sourcePath?: string;
  currency: 'BRL';
  /** Primeira linha (1-based) em que os dados de produto começam. */
  dataStartRow: number;
  /** Nome da aba de dados. */
  sheetName: string;
  columns: ShopeeColumn[];
  /**
   * Quando `source === 'official-file'`, guardamos o workbook/worksheet já
   * carregados para escrever os dados PRESERVANDO instruções, dropdowns e
   * validações do arquivo oficial.
   */
  officialWorkbook?: ExcelJS.Workbook;
  officialWorksheet?: ExcelJS.Worksheet;
}

// Limites validados (conservadores — ajustáveis). Não são "colunas", são regras.
export const SHOPEE_LIMITS = {
  titleMin: 10,
  titleMax: 120,
  descriptionMax: 3000,
  /** Estoque assumido quando o produto não traz quantidade (marcado como corrigido). */
  defaultStock: 1,
  maxAdditionalPhotos: 8,
} as const;

/** Colunas de foto: 1 capa + N adicionais, geradas em ordem. */
function photoColumns(): ShopeeColumn[] {
  const cover: ShopeeColumn = {
    key: 'foto_capa',
    header: 'Foto de Capa',
    group: 'midia',
    required: true,
    format: 'URL pública (https://…)',
    note: 'Primeira imagem = capa do anúncio. Recomendado 1:1, fundo limpo.',
  };
  const extras: ShopeeColumn[] = Array.from(
    { length: SHOPEE_LIMITS.maxAdditionalPhotos },
    (_, i) => ({
      key: `foto_${i + 1}`,
      header: `Foto ${i + 1}`,
      group: 'midia' as const,
      format: 'URL pública (https://…)',
      note: 'Imagem adicional do produto.',
    }),
  );
  return [cover, ...extras];
}

/**
 * Esquema de referência Shopee Brasil, na ordem oficial dos grupos.
 * (source: 'reference' — sobreposto pelo arquivo oficial quando disponível.)
 */
export const REFERENCE_TEMPLATE_BR: ShopeeTemplate = {
  version: 'ref-br-2026-07',
  region: 'BR',
  source: 'reference',
  currency: 'BRL',
  dataStartRow: 5,
  sheetName: 'Modelo',
  columns: [
    // ── Informações Básicas ──────────────────────────────────────────────
    {
      key: 'categoria',
      header: 'Categoria',
      group: 'basica',
      required: true,
      categoryDependent: true,
      format: 'ID/caminho de categoria da Shopee',
      note: 'A Shopee exige a categoria oficial (ID numérico no Seller Center). O texto da IA vai aqui como referência — confirme o ID correto.',
    },
    {
      key: 'nome',
      header: 'Nome do produto',
      group: 'basica',
      required: true,
      maxLength: SHOPEE_LIMITS.titleMax,
      format: `Texto, ${SHOPEE_LIMITS.titleMin}–${SHOPEE_LIMITS.titleMax} caracteres`,
      note: 'Sem emoji, sem caracteres proibidos, sem repetição excessiva.',
    },
    {
      key: 'descricao',
      header: 'Descrição do produto',
      group: 'basica',
      required: true,
      maxLength: SHOPEE_LIMITS.descriptionMax,
      format: `Texto até ${SHOPEE_LIMITS.descriptionMax} caracteres`,
      note: 'Descrição comercial e técnica do produto.',
    },
    {
      key: 'marca',
      header: 'Marca',
      group: 'basica',
      categoryDependent: true,
      format: 'Texto (ou "Sem marca")',
      note: 'Marcas válidas dependem da categoria; use "Sem marca" quando aplicável.',
    },
    // ── Variação ─────────────────────────────────────────────────────────
    {
      key: 'var_integracao',
      header: 'Número de Integração da Variação',
      group: 'variacao',
      requiredForVariations: true,
      format: 'Código único por produto',
      note: 'Mesmo código para todas as variações do mesmo produto. Não pode repetir entre produtos.',
    },
    {
      key: 'var_nome1',
      header: 'Nome da Variação 1',
      group: 'variacao',
      format: 'Texto (ex.: Cor, Tamanho)',
      note: 'Cada opção de variação é uma nova linha.',
    },
    {
      key: 'var_opcao1',
      header: 'Opção para Variação 1',
      group: 'variacao',
      format: 'Texto (ex.: Preto, M)',
    },
    {
      key: 'var_imagem',
      header: 'Imagem por Variação',
      group: 'variacao',
      format: 'URL pública (https://…)',
      note: 'Imagem no 1º nível de variação. Se usar, preencha para todas as opções do nível 1.',
    },
    {
      key: 'var_nome2',
      header: 'Nome da Variação 2',
      group: 'variacao',
      format: 'Texto (ex.: Tamanho)',
    },
    {
      key: 'var_opcao2',
      header: 'Opção para Variação 2',
      group: 'variacao',
      format: 'Texto (ex.: P, M, G)',
      note: 'Correlacione as duas variações. Estoque 0 para combinações indisponíveis.',
    },
    // ── Informações de Venda ─────────────────────────────────────────────
    {
      key: 'preco',
      header: 'Preço',
      group: 'venda',
      required: true,
      format: 'Número > 0 (BRL, ponto decimal)',
      note: 'Preço de venda por unidade/variação.',
    },
    {
      key: 'estoque',
      header: 'Estoque',
      group: 'venda',
      required: true,
      format: 'Inteiro ≥ 0',
      note: '0 para variações indisponíveis.',
    },
    {
      key: 'sku',
      header: 'SKU',
      group: 'venda',
      format: 'Texto único',
      note: 'Código do vendedor. Não pode repetir dentro do arquivo.',
    },
    {
      key: 'sku_pai',
      header: 'SKU Pai',
      group: 'venda',
      format: 'Texto',
      note: 'SKU do produto (comum às variações).',
    },
    // ── Informações de Envio ─────────────────────────────────────────────
    {
      key: 'peso',
      header: 'Peso (kg)',
      group: 'envio',
      required: true,
      format: 'Número > 0 em kg',
      note: 'Usado para calcular o frete.',
    },
    {
      key: 'comprimento',
      header: 'Comprimento (cm)',
      group: 'envio',
      format: 'Número em cm',
      note: 'Preencha comprimento, largura e altura juntos — ou deixe os três vazios.',
    },
    {
      key: 'largura',
      header: 'Largura (cm)',
      group: 'envio',
      format: 'Número em cm',
    },
    {
      key: 'altura',
      header: 'Altura (cm)',
      group: 'envio',
      format: 'Número em cm',
    },
    {
      key: 'prazo_envio',
      header: 'Prazo de Envio (dias)',
      group: 'envio',
      format: 'Inteiro (dias)',
      note: 'Deixe vazio para o padrão de 2 dias.',
    },
    // ── Informações de Mídia ─────────────────────────────────────────────
    ...photoColumns(),
  ],
};

/** Rótulo da linha de instrução "obrigatoriedade" para uma coluna. */
export function requirementLabel(col: ShopeeColumn): string {
  if (col.required) return 'Obrigatório';
  if (col.requiredForVariations) return 'Obrigatório p/ variações';
  if (col.categoryDependent) return 'Depende da categoria';
  return 'Opcional';
}

/** Tokens conhecidos de cabeçalho → chave interna (usado ao ler o arquivo oficial). */
const HEADER_ALIASES: Array<{ key: string; tokens: string[] }> = [
  { key: 'categoria', tokens: ['categoria', 'category', 'et_title_category'] },
  {
    key: 'nome',
    tokens: ['nome do produto', 'nome do anuncio', 'product name', 'título', 'titulo', 'title'],
  },
  {
    key: 'descricao',
    tokens: [
      'descrição do produto',
      'descricao do produto',
      'product description',
      'descrição',
      'descricao',
      'description',
    ],
  },
  { key: 'marca', tokens: ['marca', 'brand'] },
  {
    key: 'var_integracao',
    tokens: [
      'integração da variação',
      'integracao da variacao',
      'variation integration',
      'integração',
      'integracao',
    ],
  },
  {
    key: 'var_nome1',
    tokens: ['nome da variação 1', 'nome da variacao 1', 'variation name1', 'variation name 1'],
  },
  {
    key: 'var_opcao1',
    tokens: ['opção para variação 1', 'opcao para variacao 1', 'option for variation 1'],
  },
  {
    key: 'var_imagem',
    tokens: ['imagem por variação', 'imagem por variacao', 'image per variation'],
  },
  {
    key: 'var_nome2',
    tokens: ['nome da variação 2', 'nome da variacao 2', 'variation name2', 'variation name 2'],
  },
  {
    key: 'var_opcao2',
    tokens: ['opção para variação 2', 'opcao para variacao 2', 'option for variation 2'],
  },
  { key: 'preco', tokens: ['preço', 'preco', 'price'] },
  { key: 'estoque', tokens: ['estoque', 'stock', 'quantidade'] },
  { key: 'sku_pai', tokens: ['sku pai', 'parent sku', 'sku principal'] },
  { key: 'sku', tokens: ['sku', 'código', 'codigo'] },
  { key: 'peso', tokens: ['peso', 'weight'] },
  { key: 'comprimento', tokens: ['comprimento', 'length'] },
  { key: 'largura', tokens: ['largura', 'width'] },
  { key: 'altura', tokens: ['altura', 'height'] },
  { key: 'prazo_envio', tokens: ['prazo de envio', 'prazo de manuseio', 'days to ship', 'dts'] },
  { key: 'foto_capa', tokens: ['foto de capa', 'cover image', 'imagem de capa', 'foto capa'] },
];

function matchHeaderKey(header: string): string | undefined {
  const norm = header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!norm) return undefined;
  // Foto 1..8
  const foto = norm.match(/^foto\s*(\d{1,2})$/) || norm.match(/^image\s*(\d{1,2})$/);
  if (foto) return `foto_${foto[1]}`;
  // "sku pai" precisa casar antes de "sku": a lista já está ordenada com sku_pai antes de sku.
  for (const alias of HEADER_ALIASES) {
    if (
      alias.tokens.some((t) => norm.includes(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
    ) {
      return alias.key;
    }
  }
  return undefined;
}

/**
 * Carrega o template oficial de um .xlsx do Seller Center.
 * Heurística: procura, nas primeiras 8 linhas, a linha de cabeçalho (a que mais
 * casa com rótulos conhecidos); acima+incluindo ela ficam as instruções, os
 * dados começam na linha seguinte. Mapeia cada coluna para uma chave interna.
 *
 * É best-effort e propositalmente conservador: só é usado quando o operador
 * aponta explicitamente o arquivo oficial. Em caso de dúvida, lança e caímos no
 * esquema de referência.
 */
export async function loadOfficialTemplate(path: string): Promise<ShopeeTemplate> {
  const buf = await fs.readFile(path);
  const wb = new ExcelJS.Workbook();
  // @types/node 22 marca o Buffer de forma incompatível com o tipo esperado pelo
  // exceljs; o valor em runtime é o mesmo Buffer.
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Arquivo de template sem abas.');

  const scanRows = Math.min(8, ws.rowCount || 8);
  let headerRowIdx = -1;
  let best: { idx: number; matches: number; cells: string[] } | null = null;

  for (let r = 1; r <= scanRows; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    let matches = 0;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const text = String(cell.value ?? '').trim();
      cells[col - 1] = text;
      if (text && matchHeaderKey(text)) matches++;
    });
    if (!best || matches > best.matches) best = { idx: r, matches, cells };
  }
  if (!best || best.matches < 3) {
    throw new Error(
      'Não consegui identificar a linha de cabeçalho do template oficial (poucos rótulos reconhecidos).',
    );
  }
  headerRowIdx = best.idx;

  const columns: ShopeeColumn[] = best.cells.map((header, i) => {
    const trimmed = (header ?? '').trim();
    const key = matchHeaderKey(trimmed) ?? `col_${i + 1}`;
    const ref = REFERENCE_TEMPLATE_BR.columns.find((c) => c.key === key);
    return {
      key,
      header: trimmed || `Coluna ${i + 1}`,
      group: ref?.group ?? 'basica',
      required: ref?.required,
      requiredForVariations: ref?.requiredForVariations,
      categoryDependent: ref?.categoryDependent,
      format: ref?.format,
      maxLength: ref?.maxLength,
      note: ref?.note,
    };
  });

  return {
    version: `oficial:${path.split('/').pop() ?? path}`,
    region: 'BR',
    source: 'official-file',
    sourcePath: path,
    currency: 'BRL',
    dataStartRow: headerRowIdx + 1,
    sheetName: ws.name,
    columns,
    officialWorkbook: wb,
    officialWorksheet: ws,
  };
}

/**
 * Resolve o template a usar: arquivo oficial se apontado e legível; senão, a
 * referência BR. Nunca falha — no pior caso retorna a referência.
 */
export async function resolveShopeeTemplate(opts?: {
  templatePath?: string;
}): Promise<{ template: ShopeeTemplate; warning?: string }> {
  const path = opts?.templatePath ?? process.env.SHOPEE_TEMPLATE_PATH;
  if (path) {
    try {
      const template = await loadOfficialTemplate(path);
      return { template };
    } catch (err) {
      return {
        template: REFERENCE_TEMPLATE_BR,
        warning: `Falha ao ler o template oficial em "${path}" (${
          err instanceof Error ? err.message : String(err)
        }). Usando o esquema de referência.`,
      };
    }
  }
  return {
    template: REFERENCE_TEMPLATE_BR,
    warning:
      'Nenhum template oficial configurado (SHOPEE_TEMPLATE_PATH). Gerado com o esquema de referência BR — para 100% de compatibilidade, baixe o modelo atual no Seller Center e aponte o caminho.',
  };
}
