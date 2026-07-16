import { ShopeeTemplate, SHOPEE_LIMITS } from './shopee-template';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MAPPER — Produto do catálogo → linhas do modelo Shopee
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Traduz o documento canônico do catálogo (vision/content/pricing/images) para
 * uma ou mais LINHAS da planilha. Uma variação = uma linha (regra oficial). Sem
 * variações, o produto vira uma única linha.
 *
 * Princípio: só preenche o que EXISTE nos dados. Campo obrigatório sem origem
 * (ex.: peso) fica vazio de propósito — quem sinaliza é o validador. Nunca
 * inventamos valor para "passar" na validação.
 */

/** Valor de célula: string ou número (o workbook escreve conforme o tipo). */
export type CellValue = string | number;

/** Uma variação declarada explicitamente no produto (opcional no modelo atual). */
export interface SourceVariation {
  name1?: string;
  option1?: string;
  image?: string;
  name2?: string;
  option2?: string;
  price?: number;
  stock?: number;
  sku?: string;
}

/** Formato mínimo esperado de um produto (compatível com o doc lean do Mongo). */
export interface SourceProduct {
  id?: string;
  _id?: unknown;
  internalSku?: string;
  status?: string;
  vision?: Record<string, unknown> | null;
  content?: Record<string, unknown> | null;
  pricing?: Record<string, unknown> | null;
  images?: Record<string, unknown> | null;
  variations?: SourceVariation[];
  /**
   * Dados fiscais/NF-e (NCM, CFOP, CSOSN, CEST, ...). O catálogo hoje não
   * coleta isso em lugar nenhum — só existe aqui para que, quando/se passar a
   * existir (ex.: cadastro manual do time fiscal), o exportador já saiba
   * onde ler. Até lá fica vazio de propósito (o validador sinaliza).
   */
  fiscal?: Record<string, unknown> | null;
  /** Ativação de canais logísticos (nomes variam por loja/conta). */
  logistics?: { canalXpressCpf?: boolean; canalRetiradaComprador?: boolean } | null;
  /** GTIN e IDs de compatibilidade (marca/modelo/ano/versão). */
  identifiers?: Record<string, unknown> | null;
  /** Tabela de medidas: preencher só um dos dois (template OU imagem). */
  sizeChart?: { templateId?: string | number; imageUrl?: string } | null;
  /** Item agrupável (caixa com N pacotes/unidades). */
  groupedItem?: Record<string, unknown> | null;
}

/** Uma linha mapeada: valores por CHAVE de coluna (não por rótulo). */
export interface ShopeeRow {
  values: Record<string, CellValue>;
}

/** Resultado do mapeamento de um produto (pode gerar várias linhas). */
export interface MappedProduct {
  productId: string;
  productSku: string;
  title: string;
  rows: ShopeeRow[];
  /** Sinais coletados no mapeamento, úteis ao relatório (não bloqueiam). */
  notes: string[];
}

function str(obj: Record<string, unknown> | null | undefined, key: string): string {
  const v = obj?.[key];
  return v == null ? '' : String(v).trim();
}

function num(obj: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const v = obj?.[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function idOf(p: SourceProduct): string {
  if (p.id) return String(p.id);
  if (p._id != null) return String(p._id);
  return p.internalSku ?? '';
}

/**
 * Coleta URLs de imagem: só as variantes já tratadas pela IA (recorte/fundo/lote de
 * uso), nunca a foto original enviada pelo operador — ela costuma ter fundo bagunçado,
 * dedo na frente, iluminação ruim etc., imprópria pra ir direto pro anúncio da Shopee.
 */
export function collectImages(images: Record<string, unknown> | null | undefined): string[] {
  const img = images ?? {};
  const shopee = Array.isArray(img.shopee) ? (img.shopee as unknown[]).map(String) : [];
  const ordered = [...shopee, str(img, 'square'), str(img, 'hd'), str(img, 'webp')];
  // Únicas, não-vazias, preservando ordem. Capa + até N adicionais.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of ordered) {
    const u = url.trim();
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out.slice(0, SHOPEE_LIMITS.maxAdditionalPhotos + 1);
}

/**
 * Valores aceitos pelas colunas de canal logístico. Vêm do dropdown do arquivo
 * oficial (`"Ligado,Desativado"` na validação das colunas AE/AF) — não da linha
 * de instrução, que diz "Ativado/Desativado", nem do exemplo, que traz "Ativar".
 * Qualquer outra grafia é recusada pela validação da planilha.
 */
const CANAL_ON = 'Ligado';
const CANAL_OFF = 'Desativado';

/** Título comercial preferindo o conteúdo gerado pela IA. */
function deriveTitle(p: SourceProduct): string {
  return str(p.content, 'title') || str(p.vision, 'name') || p.internalSku || 'Produto sem título';
}

/** Descrição comercial: versão de marketplace → longa → curta. */
function deriveDescription(p: SourceProduct, title: string): string {
  return (
    str(p.content, 'marketplaceDescription') ||
    str(p.content, 'longDescription') ||
    str(p.content, 'description') ||
    str(p.vision, 'shortDescription') ||
    title
  );
}

function deriveCategory(p: SourceProduct): string {
  return str(p.content, 'category') || str(p.vision, 'category');
}

/**
 * A coluna "Categoria" da Shopee espera o ID numérico da Árvore de Categorias
 * (o exemplo do arquivo oficial traz `120039`), não um caminho de texto. Nossa
 * categoria vem da IA como "Beleza > Maquiagem > Bases" — mandar isso ali faz o
 * importador recusar.
 *
 * A coluna é "Opcional" e a instrução oficial diz: em branco, "o sistema
 * recomendará a categoria para seus produtos". Deixar a Shopee recomendar é
 * melhor que enviar um valor que ela não entende — e a categoria de texto segue
 * útil no título/descrição, que é onde ela ajuda na busca.
 */
function categoriaParaShopee(category: string): string {
  return /^\d+$/.test(category.trim()) ? category.trim() : '';
}

function derivePrice(p: SourceProduct, variation?: SourceVariation): number | undefined {
  if (variation && typeof variation.price === 'number') return variation.price;
  return num(p.pricing, 'suggestedPrice') ?? num(p.vision, 'labelPrice');
}

/** Estoque a partir da quantidade detectada; ausência vira vazio (validador trata). */
function deriveStock(p: SourceProduct, variation?: SourceVariation): number | undefined {
  if (variation && typeof variation.stock === 'number') return variation.stock;
  return num(p.vision, 'quantity');
}

/** Preenche as colunas de foto (capa + adicionais) na linha. */
function fillPhotos(values: Record<string, CellValue>, urls: string[]): void {
  if (urls.length) values.foto_capa = urls[0];
  for (let i = 1; i <= SHOPEE_LIMITS.maxAdditionalPhotos; i++) {
    if (urls[i]) values[`foto_${i}`] = urls[i];
  }
}

/**
 * Mapeia um produto para suas linhas Shopee.
 * `template` é usado só para garantir que toda coluna exista como chave (vazia
 * por padrão) — assim o workbook nunca perde/reordena colunas.
 */
export function mapProduct(p: SourceProduct, template: ShopeeTemplate): MappedProduct {
  const productId = idOf(p);
  const sku = p.internalSku || str(p.vision, 'sku') || productId;
  const title = deriveTitle(p);
  const description = deriveDescription(p, title);
  const category = deriveCategory(p);
  const brand = str(p.vision, 'brand');
  const images = collectImages(p.images);
  const notes: string[] = [];

  // Logística: usada só se vier nos dados (peso/dimensões). Nunca inventamos.
  const peso = num(p.vision, 'weight') ?? num(p.vision, 'peso');
  const comprimento = num(p.vision, 'length') ?? num(p.vision, 'comprimento');
  const largura = num(p.vision, 'width') ?? num(p.vision, 'largura');
  const altura = num(p.vision, 'height') ?? num(p.vision, 'altura');

  // Fiscal/canal/identificadores/tabela de medidas/item agrupável: só entram
  // se já vierem prontos nos dados — nunca inventados aqui (o validador
  // sinaliza o que falta).
  const fiscal = p.fiscal ?? {};
  const identifiers = p.identifiers ?? {};
  const groupedItem = p.groupedItem ?? {};

  // Base comum a todas as linhas do produto.
  const base = (): Record<string, CellValue> => {
    const v: Record<string, CellValue> = {};
    for (const col of template.columns) v[col.key] = '';
    v.categoria = categoriaParaShopee(category);
    v.nome = title;
    v.descricao = description;
    if (brand) v.marca = brand;
    v.sku_pai = sku;
    if (peso != null) v.peso = peso;
    if (comprimento != null) v.comprimento = comprimento;
    if (largura != null) v.largura = largura;
    if (altura != null) v.altura = altura;
    fillPhotos(v, images);

    const gtin = str(identifiers, 'gtin');
    if (gtin) v.gtin = gtin;
    const idsCompat = str(identifiers, 'idsCompatibilidade');
    if (idsCompat) v.ids_compatibilidade = idsCompat;

    if (p.sizeChart?.templateId != null && p.sizeChart.templateId !== '')
      v.tabela_medidas_id = p.sizeChart.templateId;
    else if (p.sizeChart?.imageUrl) v.imagem_tamanhos = p.sizeChart.imageUrl;

    // Sem canal de envio a Shopee recusa o produto ("Produto não pode ser salvo
    // sem um canal de envio habilitado"), então o padrão é LIGADO — vazio não é
    // opção. Xpress CPF é o único canal editável no template basic: a coluna
    // "Retirada pelo Comprador" traz "Please do not edit this column", por isso
    // não a escrevemos.
    v.canal_xpress_cpf = p.logistics?.canalXpressCpf === false ? CANAL_OFF : CANAL_ON;

    const fiscalFields: Array<[string, string]> = [
      ['ncm', 'ncm'],
      ['cfop_mesmo_estado', 'cfopMesmoEstado'],
      ['cfop_outro_estado', 'cfopOutroEstado'],
      ['origem', 'origem'],
      ['csosn', 'csosn'],
      ['cest', 'cest'],
      ['unidade_medida', 'unidadeMedida'],
      ['cst_pis_cofins', 'cstPisCofins'],
      ['pct_tributos', 'pctTributos'],
      ['tipo_operacao', 'tipoOperacao'],
      ['ex_tipi', 'exTipi'],
      ['fci_num', 'fciNum'],
      ['recopi_num', 'recopiNum'],
      ['info_adicional', 'infoAdicional'],
    ];
    for (const [colKey, srcKey] of fiscalFields) {
      const val = str(fiscal, srcKey);
      if (val) v[colKey] = val;
    }

    const produtoAgrupavel = groupedItem.isGrouped;
    if (produtoAgrupavel != null) v.produto_agrupavel = produtoAgrupavel ? 'Sim' : 'Não';
    const gtinAgrup = str(groupedItem, 'gtinUnidadeTributavel');
    if (gtinAgrup) v.gtin_unidade_tributavel = gtinAgrup;
    const qtdAgrup = num(groupedItem, 'qtdUnidadeTributavel');
    if (qtdAgrup != null) v.qtd_unidade_tributavel = qtdAgrup;
    const unidadeAgrup = str(groupedItem, 'unidadeMedidaAgrupavel');
    if (unidadeAgrup) v.unidade_medida_agrupavel = unidadeAgrup;

    return v;
  };

  const variations = Array.isArray(p.variations) ? p.variations.filter(Boolean) : [];

  if (variations.length === 0) {
    const v = base();
    const price = derivePrice(p);
    const stock = deriveStock(p);
    v.sku = sku;
    if (price != null) v.preco = price;
    if (stock != null) v.estoque = stock;
    return { productId, productSku: sku, title, rows: [{ values: v }], notes };
  }

  // Com variações: cada opção é uma linha, todas com o mesmo Nº de Integração.
  const integrationNo = `V-${sku}`;
  const rows: ShopeeRow[] = variations.map((variation, i) => {
    const v = base();
    v.var_integracao = integrationNo;
    if (variation.name1) v.var_nome1 = variation.name1;
    if (variation.option1) v.var_opcao1 = variation.option1;
    if (variation.image) v.var_imagem = variation.image;
    if (variation.name2) v.var_nome2 = variation.name2;
    if (variation.option2) v.var_opcao2 = variation.option2;
    v.sku = variation.sku || `${sku}-${i + 1}`;
    const price = derivePrice(p, variation);
    const stock = deriveStock(p, variation);
    if (price != null) v.preco = price;
    if (stock != null) v.estoque = stock;
    return { values: v };
  });

  return { productId, productSku: sku, title, rows, notes };
}

/** Mapeia uma lista de produtos, preservando a ordem. */
export function mapProducts(products: SourceProduct[], template: ShopeeTemplate): MappedProduct[] {
  return products.map((p) => mapProduct(p, template));
}
