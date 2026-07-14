import ExcelJS from 'exceljs';
import { ShopeeColumn, ShopeeTemplate, requirementLabel } from './shopee-template';
import { MappedProduct } from './shopee-mapper';
import { Correction } from './shopee-autofix';
import { Issue } from './shopee-validator';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WORKBOOK — monta o .xlsx final (UTF-8), sem alterar nomes/ordem de colunas
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Aba de dados:
 *   • modo referência: cria a aba com 4 linhas de instrução (cabeçalho +
 *     obrigatoriedade + formato + nota) e os dados a partir da linha 5.
 *   • modo arquivo oficial: ANEXA os dados ao worksheet original, preservando
 *     instruções, listas suspensas e validações do Seller Center.
 *
 * Abas de relatório: Validação, Corrigidos, Rejeitados e Leia-me.
 */

export interface BuildWorkbookParams {
  template: ShopeeTemplate;
  products: MappedProduct[];
  corrections: Correction[];
  issues: Issue[];
  rejected: Set<string>;
  warning?: string;
  generatedAtISO: string;
}

const SHOPEE_ORANGE = 'FFEE4D2D';
const HEADER_GREY = 'FFF2F2F2';
const REJECT_RED = 'FFFCE8E6';

function widthFor(col: ShopeeColumn): number {
  if (col.key === 'descricao' || col.key === 'info_adicional') return 50;
  if (col.key === 'nome') return 42;
  if (col.key.startsWith('foto') || col.key === 'var_imagem' || col.key === 'imagem_tamanhos')
    return 48;
  if (col.key === 'ids_compatibilidade') return 34;
  if (col.group === 'variacao' || col.group === 'canal') return 22;
  if (col.note && col.note.length > 40) return 30;
  return 18;
}

function styleInstructionRows(sheet: ExcelJS.Worksheet, columnCount: number): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SHOPEE_ORANGE } };
  header.alignment = { vertical: 'middle', wrapText: true };
  for (let r = 2; r <= 4; r++) {
    const row = sheet.getRow(r);
    row.font = { italic: true, size: 9, color: { argb: 'FF666666' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_GREY } };
    row.alignment = { vertical: 'top', wrapText: true };
  }
  // Congela as 4 linhas de instrução e a 1ª coluna.
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(1, columnCount) },
  };
}

/** Escreve a aba de dados no modo referência (aba nova criada por nós). */
function writeReferenceSheet(wb: ExcelJS.Workbook, params: BuildWorkbookParams): void {
  const { template, products, rejected } = params;
  const cols = template.columns;
  const sheet = wb.addWorksheet(template.sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  sheet.columns = cols.map((c) => ({ width: widthFor(c) }));

  // Linhas de instrução (1-4). Positional: array[i] → coluna i+1.
  sheet.addRow(cols.map((c) => c.header));
  sheet.addRow(cols.map((c) => requirementLabel(c)));
  sheet.addRow(cols.map((c) => c.format ?? ''));
  sheet.addRow(cols.map((c) => c.note ?? ''));
  styleInstructionRows(sheet, cols.length);

  // Dados a partir da linha 5.
  for (const mp of products) {
    const isRejected = rejected.has(mp.productId);
    for (const row of mp.rows) {
      const added = sheet.addRow(cols.map((c) => row.values[c.key] ?? ''));
      added.alignment = { vertical: 'top', wrapText: true };
      if (isRejected) {
        added.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REJECT_RED } };
      }
    }
  }
}

/** Anexa os dados ao worksheet do arquivo oficial (modo official-file). */
function appendToOfficialSheet(params: BuildWorkbookParams): void {
  const { template, products } = params;
  const ws = template.officialWorksheet;
  if (!ws) return;
  const cols = template.columns;
  // Começa após o conteúdo existente, nunca antes da 1ª linha de dados.
  let cursor = Math.max(template.dataStartRow, (ws.actualRowCount || 0) + 1);
  for (const mp of products) {
    for (const row of mp.rows) {
      const target = ws.getRow(cursor++);
      cols.forEach((c, i) => {
        target.getCell(i + 1).value = row.values[c.key] ?? '';
      });
      target.alignment = { vertical: 'top', wrapText: true };
      target.commit?.();
    }
  }
}

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  intro: string[],
  headers: string[],
  rows: Array<Array<string | number>>,
  widths?: number[],
): void {
  const sheet = wb.addWorksheet(name);
  if (widths) sheet.columns = widths.map((w) => ({ width: w }));
  intro.forEach((line) => {
    const r = sheet.addRow([line]);
    r.font = { italic: true, color: { argb: 'FF666666' } };
  });
  if (intro.length) sheet.addRow([]);
  if (headers.length) {
    const head = sheet.addRow(headers);
    head.font = { bold: true };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_GREY } };
  }
  for (const row of rows) {
    const r = sheet.addRow(row);
    r.alignment = { vertical: 'top', wrapText: true };
  }
}

function buildValidationSheet(wb: ExcelJS.Workbook, params: BuildWorkbookParams): void {
  const order = { error: 0, warning: 1 } as const;
  const sorted = [...params.issues].sort((a, b) => order[a.level] - order[b.level]);
  const rows = sorted.map((it) => [
    it.productSku,
    it.rowIndex + 1,
    it.level === 'error' ? 'ERRO' : 'aviso',
    it.column ?? '',
    it.code,
    it.message,
  ]);
  const errors = params.issues.filter((i) => i.level === 'error').length;
  const warnings = params.issues.length - errors;
  addSheet(
    wb,
    'Validação',
    [
      `${errors} erro(s) e ${warnings} aviso(s). Erros impedem a importação até serem corrigidos.`,
      'Erros nunca são preenchidos com valores inventados — são sinalizados para revisão.',
    ],
    ['Produto (SKU)', 'Linha', 'Nível', 'Campo', 'Código', 'Mensagem'],
    rows,
    [24, 8, 10, 16, 20, 70],
  );
}

function buildCorrectionsSheet(wb: ExcelJS.Workbook, params: BuildWorkbookParams): void {
  const rows = params.corrections.map((c) => [c.productSku, c.column, c.before, c.after, c.reason]);
  addSheet(
    wb,
    'Corrigidos',
    [`${params.corrections.length} correção(ões) automática(s) aplicada(s).`],
    ['Produto (SKU)', 'Campo', 'Antes', 'Depois', 'Motivo'],
    rows,
    [24, 16, 42, 42, 48],
  );
}

function buildRejectedSheet(wb: ExcelJS.Workbook, params: BuildWorkbookParams): void {
  const byProduct = new Map<string, { title: string; sku: string; msgs: string[] }>();
  for (const mp of params.products) {
    if (params.rejected.has(mp.productId)) {
      byProduct.set(mp.productId, { title: mp.title, sku: mp.productSku, msgs: [] });
    }
  }
  for (const it of params.issues) {
    if (it.level !== 'error') continue;
    const entry = byProduct.get(it.productId);
    if (entry) entry.msgs.push(`${it.column ?? '-'}: ${it.message}`);
  }
  const rows = [...byProduct.values()].map((e) => [e.sku, e.title, e.msgs.join(' | ')]);
  addSheet(
    wb,
    'Rejeitados',
    [
      `${rows.length} produto(s) serão REJEITADOS pela Shopee se os campos apontados não forem preenchidos.`,
      'As linhas correspondentes aparecem destacadas em vermelho na aba de dados.',
    ],
    ['Produto (SKU)', 'Título', 'Pendências (erros)'],
    rows,
    [24, 44, 80],
  );
}

function buildReadmeSheet(wb: ExcelJS.Workbook, params: BuildWorkbookParams): void {
  const { template } = params;
  const sourceLabel =
    template.source === 'official-file'
      ? `Arquivo oficial do Seller Center (${template.sourcePath ?? ''})`
      : 'Esquema de referência BR (derivado da documentação oficial da Shopee)';
  const lines: string[] = [
    'COMO USAR ESTA PLANILHA',
    '',
    `Origem do layout: ${sourceLabel}`,
    `Versão do template: ${template.version}`,
    `Região: ${template.region}   |   Moeda: ${template.currency}`,
    `Gerado em: ${params.generatedAtISO}`,
    '',
  ];
  if (params.warning) lines.push(`⚠ ${params.warning}`, '');
  lines.push(
    'REGRAS OFICIAIS RESPEITADAS',
    '• As 4 primeiras linhas são instruções — não edite; os dados começam na linha 5.',
    '• Cada opção de variação é uma nova linha; variações do mesmo produto usam o mesmo Número de Integração.',
    '• Estoque 0 para variações indisponíveis.',
    '• Imagens são enviadas por URL pública (https://…).',
    '',
    'IMPORTANTE',
    '• Nada é inventado: campos obrigatórios sem origem (ex.: peso, categoria numérica) são sinalizados nas abas Validação/Rejeitados.',
    '• Para 100% de compatibilidade, baixe o modelo atual no Seller Center e configure SHOPEE_TEMPLATE_PATH; o gerador passa a usar as colunas exatas do seu arquivo.',
  );
  const sheet = wb.addWorksheet('Leia-me');
  sheet.columns = [{ width: 110 }];
  lines.forEach((line, idx) => {
    const r = sheet.addRow([line]);
    if (idx === 0) r.font = { bold: true, size: 14 };
    else if (/^[A-ZÂÊÎÔÛÁÉÍÓÚÃÕÇ ]+$/.test(line) && line.length > 3) r.font = { bold: true };
    else if (line.startsWith('⚠')) r.font = { bold: true, color: { argb: 'FFB25000' } };
  });
}

/** Monta o workbook completo e devolve o buffer .xlsx. */
export async function buildWorkbook(params: BuildWorkbookParams): Promise<Buffer> {
  const { template } = params;
  const wb = template.officialWorkbook ?? new ExcelJS.Workbook();
  wb.creator = 'Tecno Plus — Exportador Shopee';
  wb.created = new Date(params.generatedAtISO);

  if (template.source === 'official-file' && template.officialWorksheet) {
    appendToOfficialSheet(params);
  } else {
    writeReferenceSheet(wb, params);
  }

  buildValidationSheet(wb, params);
  buildCorrectionsSheet(wb, params);
  buildRejectedSheet(wb, params);
  buildReadmeSheet(wb, params);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
