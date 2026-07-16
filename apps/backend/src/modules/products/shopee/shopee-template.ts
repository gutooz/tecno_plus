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

export type ShopeeFieldGroup =
  'basica' | 'variacao' | 'venda' | 'envio' | 'midia' | 'canal' | 'fiscal' | 'agrupado';

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

/**
 * Limites exatos lidos da linha de formato (linha 6) da aba "Modelo" do
 * template oficial Shopee BR baixado do Seller Center — não são estimativa.
 * Reveja estes números sempre que baixar um template novo (a Shopee muda os
 * limites sem aviso).
 */
export const SHOPEE_LIMITS = {
  titleMin: 2,
  titleMax: 120,
  descriptionMin: 10,
  descriptionMax: 5000,
  priceMin: 1,
  priceMax: 100000,
  /** Preço da variação mais cara ÷ preço da mais barata não pode passar disso. */
  maxVariationPriceRatio: 4,
  stockMin: 0,
  stockMax: 10000000,
  weightMax: 100000,
  dimensionMax: 10000000,
  skuMaxLength: 100,
  variationIntegrationMaxLength: 100,
  variationNameMaxLength: 30,
  gtinMinLength: 8,
  gtinMaxLength: 14,
  /**
   * Faixa de estoque assumida quando o produto não traz quantidade (marcado
   * como corrigido). Modelo é dropshipping — não há contagem física pra
   * "ler"; um valor nessa faixa evita anúncio com estoque zerado/parado.
   */
  defaultStockMin: 50,
  defaultStockMax: 100,
  maxAdditionalPhotos: 8,
} as const;

/**
 * Colunas de foto: 1 capa + N adicionais, geradas em ordem.
 * Rótulos exatos da aba "Modelo" oficial: "Imagem de capa" e "Imagem do
 * produto 1".."8". A capa é tecnicamente "Opcional" na planilha de upload em
 * massa (dá para subir depois na ferramenta de atributos), mas é obrigatória
 * antes de o anúncio poder ser publicado — por isso o aviso explícito.
 */
function photoColumns(): ShopeeColumn[] {
  const cover: ShopeeColumn = {
    key: 'foto_capa',
    header: 'Imagem de capa',
    group: 'midia',
    format: 'URL pública (https://…), máx. 2MB, JPG/JPEG/PNG, proporção 1:1',
    note: 'Opcional para o upload em massa, mas obrigatória antes de o anúncio poder ser publicado. A imagem não pode ser duplicada com outro anúncio da loja.',
  };
  const extras: ShopeeColumn[] = Array.from(
    { length: SHOPEE_LIMITS.maxAdditionalPhotos },
    (_, i) => ({
      key: `foto_${i + 1}`,
      header: `Imagem do produto ${i + 1}`,
      group: 'midia' as const,
      format: 'URL pública (https://…), máx. 2MB, JPG/JPEG/PNG, proporção 1:1',
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
  version: 'ref-br-2026-07-15',
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
      format: 'ID/nome de categoria da Shopee (caixa suspensa no arquivo oficial)',
      note: 'Opcional no arquivo oficial atual (a Shopee recomenda mesmo assim: categoria imprecisa reduz o alcance na busca).',
    },
    {
      key: 'nome',
      header: 'Nome do Produto',
      group: 'basica',
      required: true,
      maxLength: SHOPEE_LIMITS.titleMax,
      format: `Texto, ${SHOPEE_LIMITS.titleMin}–${SHOPEE_LIMITS.titleMax} caracteres`,
      note: 'Deve incluir marca e modelo do produto. Sem emoji, sem palavras-chave irrelevantes/proibidas.',
    },
    {
      key: 'descricao',
      header: 'Descrição do Produto',
      group: 'basica',
      required: true,
      maxLength: SHOPEE_LIMITS.descriptionMax,
      format: `Texto, ${SHOPEE_LIMITS.descriptionMin}–${SHOPEE_LIMITS.descriptionMax} caracteres`,
      note: 'Evite palavras irrelevantes e proibidas.',
    },
    {
      key: 'marca',
      header: 'Marca',
      group: 'basica',
      categoryDependent: true,
      format: 'ID da marca (ou vazio para preencher depois na ferramenta de atributos)',
      note: 'Só existe como coluna quando o arquivo oficial inclui atributos de categoria — a exportação "basic" sem categoria não a traz. Obrigatória (marca válida ou "sem marca") quando presente.',
    },
    // ── Variação ─────────────────────────────────────────────────────────
    {
      key: 'var_integracao',
      header: 'Número de Integração de Variação',
      group: 'variacao',
      requiredForVariations: true,
      maxLength: SHOPEE_LIMITS.variationIntegrationMaxLength,
      format: `Texto único por produto, 1–${SHOPEE_LIMITS.variationIntegrationMaxLength} caracteres`,
      note: 'Mesmo código para todas as variações do mesmo produto. Não pode repetir entre produtos.',
    },
    {
      key: 'var_nome1',
      header: 'Nome da Variação 1',
      group: 'variacao',
      requiredForVariations: true,
      maxLength: SHOPEE_LIMITS.variationNameMaxLength,
      format: `Texto, 1–${SHOPEE_LIMITS.variationNameMaxLength} caracteres (ex.: Cor, Tamanho)`,
      note: 'Cada opção de variação é uma nova linha.',
    },
    {
      key: 'var_opcao1',
      header: 'Opção para Variação 1',
      group: 'variacao',
      requiredForVariations: true,
      maxLength: SHOPEE_LIMITS.variationNameMaxLength,
      format: `Texto, 1–${SHOPEE_LIMITS.variationNameMaxLength} caracteres (ex.: Preto, M)`,
    },
    {
      key: 'var_imagem',
      header: 'Imagem por Variação',
      group: 'variacao',
      categoryDependent: true,
      format: 'URL pública (https://…)',
      note: 'Imagem no 1º nível de variação. Se usar, preencha para todas as opções do nível 1.',
    },
    {
      key: 'var_nome2',
      header: 'Nome da Variação 2',
      group: 'variacao',
      categoryDependent: true,
      maxLength: SHOPEE_LIMITS.variationNameMaxLength,
      format: `Texto, 1–${SHOPEE_LIMITS.variationNameMaxLength} caracteres (ex.: Tamanho)`,
    },
    {
      key: 'var_opcao2',
      header: 'Opção para Variação 2',
      group: 'variacao',
      categoryDependent: true,
      maxLength: SHOPEE_LIMITS.variationNameMaxLength,
      format: `Texto, 1–${SHOPEE_LIMITS.variationNameMaxLength} caracteres (ex.: P, M, G)`,
      note: 'Correlacione as duas variações. Estoque 0 para combinações indisponíveis.',
    },
    // ── Informações de Venda ─────────────────────────────────────────────
    {
      key: 'preco',
      header: 'Preço',
      group: 'venda',
      required: true,
      format: `Número, ${SHOPEE_LIMITS.priceMin.toFixed(2)}–${SHOPEE_LIMITS.priceMax.toFixed(2)} (BRL)`,
      note: `Preço de venda por unidade/variação. Entre variações do mesmo produto: (preço mais caro ÷ preço mais barato) ≤ ${SHOPEE_LIMITS.maxVariationPriceRatio}.`,
    },
    {
      key: 'estoque',
      header: 'Estoque',
      group: 'venda',
      required: true,
      format: `Inteiro, ${SHOPEE_LIMITS.stockMin}–${SHOPEE_LIMITS.stockMax}`,
      note: '0 para variações indisponíveis.',
    },
    {
      key: 'sku',
      header: 'SKU da Variação',
      group: 'venda',
      maxLength: SHOPEE_LIMITS.skuMaxLength,
      format: `Texto único, até ${SHOPEE_LIMITS.skuMaxLength} caracteres`,
      note: 'Identificador da variação. Não recomendado duplicar dentro da loja.',
    },
    {
      key: 'sku_pai',
      header: 'SKU principal',
      group: 'venda',
      maxLength: SHOPEE_LIMITS.skuMaxLength,
      format: `Texto, 1–${SHOPEE_LIMITS.skuMaxLength} caracteres`,
      note: 'Localiza o produto principal (comum às variações). Não recomendado duplicar dentro da loja.',
    },
    {
      key: 'gtin',
      header: 'GTIN (EAN)',
      group: 'venda',
      format: `${SHOPEE_LIMITS.gtinMinLength}–${SHOPEE_LIMITS.gtinMaxLength} dígitos`,
      note: 'Identificador GS1 (UPC/EAN/JAN/ISBN).',
    },
    {
      key: 'ids_compatibilidade',
      header: 'IDs de compatibilidade',
      group: 'venda',
      format: '[ID marca,ID modelo,ID ano,ID versão];[...]',
      note: 'Ex.: [1234,4567,7899,5432];[6789,6788,5433,7889]. Consulte a lista de modelos compatíveis do Seller Center.',
    },
    {
      key: 'tabela_medidas_id',
      header: 'Template da Tabela de Medidas',
      group: 'midia',
      categoryDependent: true,
      format: 'ID do template (aba "Lista de Modelos de Tabela de Medidas")',
      note: 'Preencha isto OU "Imagem de Tamanhos" — nunca os dois (se ambos, só o template é mantido).',
    },
    {
      key: 'imagem_tamanhos',
      header: 'Imagem de Tamanhos',
      group: 'midia',
      categoryDependent: true,
      format: 'URL, máx. 2MB, PDF/JPG/PNG, até 1280×1280px',
      note: 'Alternativa a "Template da Tabela de Medidas" — preencha só um dos dois.',
    },
    // ── Informações de Envio ─────────────────────────────────────────────
    {
      key: 'peso',
      header: 'Peso',
      group: 'envio',
      required: true,
      format: `Número, 0.00–${SHOPEE_LIMITS.weightMax.toFixed(2)} kg`,
      note: 'Usado para calcular o frete. Peso incorreto pode causar recusa de entrega pelos parceiros logísticos.',
    },
    {
      key: 'comprimento',
      header: 'Comprimento',
      group: 'envio',
      categoryDependent: true,
      format: `0–${SHOPEE_LIMITS.dimensionMax} cm`,
      note: 'Preencha comprimento, largura e altura juntos — ou deixe os três vazios.',
    },
    {
      key: 'largura',
      header: 'Largura',
      group: 'envio',
      categoryDependent: true,
      format: `0–${SHOPEE_LIMITS.dimensionMax} cm`,
    },
    {
      key: 'altura',
      header: 'Altura',
      group: 'envio',
      categoryDependent: true,
      format: `0–${SHOPEE_LIMITS.dimensionMax} cm`,
    },
    {
      key: 'prazo_envio',
      header: 'Prazo de Postagem para Encomenda',
      group: 'envio',
      format: 'Inteiro (dias)',
      note: 'Só se aplica a produtos vendidos como encomenda. Vazio = padrão de 2 dias.',
    },
    // ── Canais logísticos (específicos da loja) ─────────────────────────
    {
      key: 'canal_xpress_cpf',
      header: 'Shopee Xpress CPF',
      group: 'canal',
      categoryDependent: true,
      format: '"Ativar" ou "Off"',
      note: 'Ative pelo menos um canal por produto — os nomes/qtd. de canais variam por loja; confira os exatos no arquivo oficial baixado da sua conta.',
    },
    {
      key: 'canal_retirada_comprador',
      header: 'Retirada pelo Comprador',
      group: 'canal',
      categoryDependent: true,
      format: '"Ativar" ou "Off"',
      note: 'Ative pelo menos um canal por produto.',
    },
    // ── Fiscal / NF-e (Brasil) ───────────────────────────────────────────
    {
      key: 'ncm',
      header: 'NCM',
      group: 'fiscal',
      categoryDependent: true,
      format: '8 dígitos',
      note: 'Nomenclatura Comum do Mercosul.',
    },
    {
      key: 'cfop_mesmo_estado',
      header: 'CFOP (Mesmo Estado)',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Código sugerido pela Shopee para o NCM',
      note: 'Usado quando vendedor e comprador estão no mesmo estado.',
    },
    {
      key: 'cfop_outro_estado',
      header: 'CFOP (Outro Estado)',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Código sugerido pela Shopee para o NCM',
      note: 'Usado quando vendedor e comprador estão em estados diferentes.',
    },
    {
      key: 'origem',
      header: 'Origem',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Código de origem (0–8)',
    },
    {
      key: 'csosn',
      header: 'CSOSN',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Código de Situação Operacional do Simples Nacional',
    },
    {
      key: 'cest',
      header: 'CEST',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Conforme o NCM',
    },
    {
      key: 'unidade_medida',
      header: 'Unidade de Medida',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Unidade válida (ex.: UNI, CX, KG)',
    },
    {
      key: 'cst_pis_cofins',
      header: 'CST PIS/Cofins',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Um dos códigos da lista oficial',
    },
    {
      key: 'pct_tributos',
      header: '% total de tributos federais, estaduais e municipais',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Percentual, até 2 casas decimais',
      note: 'Lei da Transparência Fiscal (IBPT).',
    },
    {
      key: 'tipo_operacao',
      header: 'Tipo de Operação',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Opção da lista suspensa',
    },
    {
      key: 'ex_tipi',
      header: 'EX TIPI (tabela de exceções IPI)',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Código de exceção, quando o NCM exigir',
    },
    {
      key: 'fci_num',
      header: 'Nr. de controle da FCI',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Ficha de Conteúdo de Importação',
    },
    {
      key: 'recopi_num',
      header: 'Nr. RECOPI',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Registro de Controle das Operações com Papel Imune',
    },
    {
      key: 'info_adicional',
      header: 'Informações adicionais do produto',
      group: 'fiscal',
      categoryDependent: true,
      format: 'Texto livre para a Nota Fiscal',
    },
    // ── Item agrupável ───────────────────────────────────────────────────
    {
      key: 'produto_agrupavel',
      header: 'Produto é um item agrupável',
      group: 'agrupado',
      categoryDependent: true,
      format: 'Opção da lista suspensa (Sim/Não)',
      note: 'Ex.: uma caixa com 6 pacotes de 6 latas cada é um item agrupável.',
    },
    {
      key: 'gtin_unidade_tributavel',
      header: 'GTIN da Unidade Tributável',
      group: 'agrupado',
      categoryDependent: true,
      format: 'Código GTIN/SSCC',
    },
    {
      key: 'qtd_unidade_tributavel',
      header: 'Quantidade da Unidade Tributável',
      group: 'agrupado',
      categoryDependent: true,
      format: 'Inteiro',
      note: 'Ex.: pacote com 6 latas → 6.',
    },
    {
      key: 'unidade_medida_agrupavel',
      header: 'Unidade de medida do item agrupável',
      group: 'agrupado',
      categoryDependent: true,
      format: 'Unidade (ex.: UNI)',
    },
    // ── Informações de Mídia ─────────────────────────────────────────────
    ...photoColumns(),
  ],
};

/**
 * Rótulo da linha de instrução "obrigatoriedade" para uma coluna — usa o
 * mesmo vocabulário de 3 níveis da Shopee (Obrigatório / Condicional
 * obrigatório / Opcional), como aparece na linha 4 do arquivo oficial.
 */
export function requirementLabel(col: ShopeeColumn): string {
  if (col.required) return 'Obrigatório';
  if (col.requiredForVariations || col.categoryDependent) return 'Condicional obrigatório';
  return 'Opcional';
}

/**
 * Tokens conhecidos de cabeçalho → chave interna (usado ao ler o arquivo
 * oficial). ORDEM IMPORTA: `matchHeaderKey` devolve a primeira chave cujo
 * token bate como substring do cabeçalho normalizado — por isso aliases mais
 * específicos (ex.: "gtin da unidade tributável") vêm antes dos genéricos
 * que são substring deles (ex.: "gtin"), senão o específico nunca seria
 * alcançado.
 */
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
      'número de integração de variação',
      'numero de integracao de variacao',
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
  { key: 'estoque', tokens: ['estoque', 'stock'] },
  { key: 'sku_pai', tokens: ['sku principal', 'sku pai', 'parent sku'] },
  // Específico ANTES do genérico "gtin" (senão nunca seria alcançado).
  {
    key: 'gtin_unidade_tributavel',
    tokens: ['gtin da unidade tributável', 'gtin da unidade tributavel'],
  },
  { key: 'gtin', tokens: ['gtin', 'ean'] },
  { key: 'ids_compatibilidade', tokens: ['ids de compatibilidade', 'compatibilidade'] },
  { key: 'sku', tokens: ['sku'] },
  { key: 'tabela_medidas_id', tokens: ['template da tabela de medidas', 'tabela de medidas'] },
  { key: 'imagem_tamanhos', tokens: ['imagem de tamanhos'] },
  { key: 'foto_capa', tokens: ['imagem de capa', 'foto de capa', 'cover image', 'foto capa'] },
  { key: 'peso', tokens: ['peso', 'weight'] },
  { key: 'comprimento', tokens: ['comprimento', 'length'] },
  { key: 'largura', tokens: ['largura', 'width'] },
  { key: 'altura', tokens: ['altura', 'height'] },
  { key: 'canal_xpress_cpf', tokens: ['shopee xpress cpf'] },
  { key: 'canal_retirada_comprador', tokens: ['retirada pelo comprador'] },
  {
    key: 'prazo_envio',
    tokens: ['prazo de postagem', 'prazo de envio', 'prazo de manuseio', 'days to ship', 'dts'],
  },
  { key: 'ncm', tokens: ['ncm'] },
  { key: 'cfop_mesmo_estado', tokens: ['cfop (mesmo estado)', 'cfop mesmo estado'] },
  { key: 'cfop_outro_estado', tokens: ['cfop (outro estado)', 'cfop outro estado'] },
  { key: 'origem', tokens: ['origem'] },
  { key: 'csosn', tokens: ['csosn'] },
  { key: 'cest', tokens: ['cest'] },
  // Específico ANTES do genérico "unidade de medida".
  {
    key: 'unidade_medida_agrupavel',
    tokens: ['unidade de medida do item agrupável', 'unidade de medida do item agrupavel'],
  },
  { key: 'unidade_medida', tokens: ['unidade de medida'] },
  { key: 'cst_pis_cofins', tokens: ['cst pis/cofins', 'cst pis cofins', 'pis/cofins'] },
  {
    key: 'pct_tributos',
    tokens: ['tributos federais, estaduais e municipais', '% total de tributos'],
  },
  { key: 'tipo_operacao', tokens: ['tipo de operação', 'tipo de operacao'] },
  { key: 'ex_tipi', tokens: ['ex tipi'] },
  { key: 'fci_num', tokens: ['controle da fci', 'nr. de controle da fci', 'fci'] },
  { key: 'recopi_num', tokens: ['recopi'] },
  {
    key: 'info_adicional',
    tokens: ['informações adicionais do produto', 'informacoes adicionais do produto'],
  },
  // Específico ANTES do genérico "item agrupável".
  {
    key: 'qtd_unidade_tributavel',
    tokens: ['quantidade da unidade tributável', 'quantidade da unidade tributavel'],
  },
  { key: 'produto_agrupavel', tokens: ['item agrupável', 'item agrupavel'] },
];

function matchHeaderKey(header: string): string | undefined {
  const norm = header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!norm) return undefined;
  // Fotos: "Foto N" / "Image N" / "Imagem (do) produto N" (rótulo real da Shopee).
  const foto =
    norm.match(/^foto\s*(\d{1,2})$/) ||
    norm.match(/^image\s*(\d{1,2})$/) ||
    norm.match(/^imagem(?:\s+do)?\s+produto\s*(\d{1,2})$/);
  if (foto) return `foto_${foto[1]}`;
  // Aliases mais específicos precisam vir antes dos genéricos que são
  // substring deles — ver ordem comentada em HEADER_ALIASES.
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
 * Heurística: o arquivo real da Shopee traz várias abas (ex.: "Orientação",
 * "Modelo", "Fazer upload do exemplo", listas ocultas) e a aba de DADOS nem
 * sempre é a primeira — por isso escaneamos TODAS as abas, nas primeiras 8
 * linhas de cada, e ficamos com a linha (de qualquer aba) que mais casa com
 * rótulos conhecidos. Acima dela ficam as instruções; os dados começam na
 * linha seguinte. Mapeia cada coluna para uma chave interna.
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
  if (!wb.worksheets.length) throw new Error('Arquivo de template sem abas.');

  let best: { ws: ExcelJS.Worksheet; idx: number; matches: number; cells: string[] } | null = null;

  for (const ws of wb.worksheets) {
    const scanRows = Math.min(8, ws.rowCount || 8);
    for (let r = 1; r <= scanRows; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      let matches = 0;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const text = String(cell.value ?? '').trim();
        cells[col - 1] = text;
        if (text && matchHeaderKey(text)) matches++;
      });
      if (!best || matches > best.matches) best = { ws, idx: r, matches, cells };
    }
  }
  // Uma linha de cabeçalho real bate dezenas de rótulos (a aba "Modelo" tem
  // >50 colunas); um limiar baixo deixava abas de instrução/exemplo vencerem
  // por coincidência de 1-2 palavras soltas.
  if (!best || best.matches < 8) {
    throw new Error(
      'Não consegui identificar a linha de cabeçalho do template oficial (poucos rótulos reconhecidos).',
    );
  }
  const { ws, idx: headerRowIdx, cells } = best;

  // Evita que duas colunas reais distintas colidam na mesma chave interna
  // (defensivo — a ordem de HEADER_ALIASES já previne isso, mas se colidir,
  // preferimos perder o match a sobrescrever/duplicar dado entre colunas).
  const usedKeys = new Set<string>();
  const columns: ShopeeColumn[] = cells.map((header, i) => {
    const trimmed = (header ?? '').trim();
    let key = matchHeaderKey(trimmed) ?? `col_${i + 1}`;
    if (usedKeys.has(key)) key = `col_${i + 1}`;
    usedKeys.add(key);
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
