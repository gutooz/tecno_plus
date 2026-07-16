import { resolveShopeeTemplate } from './shopee-template';
import { mapProducts, SourceProduct } from './shopee-mapper';
import { autofix } from './shopee-autofix';
import { validate, rejectedProductIds } from './shopee-validator';
import { buildWorkbook } from './shopee-workbook';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ORQUESTRADOR — junta template → mapa → autofix → validação → workbook
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ponto de entrada único do motor de exportação Shopee. É uma função pura
 * (não depende do Nest/Mongo) — recebe os produtos e devolve o .xlsx + relatório.
 */

export interface ShopeeExportReport {
  templateSource: 'reference' | 'official-file';
  templateVersion: string;
  totalProducts: number;
  totalRows: number;
  /** Produtos que realmente foram escritos no arquivo (total menos rejeitados). */
  exportedProducts: number;
  /** Linhas realmente escritas — é isso que a Shopee vai importar. */
  exportedRows: number;
  corrections: number;
  errors: number;
  warnings: number;
  rejected: number;
  warning?: string;
}

export interface ShopeeExportResult {
  buffer: Buffer;
  report: ShopeeExportReport;
}

/**
 * Serializa o relatório para caber num header HTTP.
 *
 * Header só aceita Latin-1, e o relatório carrega texto em português — acento e
 * travessão (ex.: "esquema de referência BR — para 100%…"). Passar o JSON cru
 * faz `res.setHeader` lançar ERR_INVALID_CHAR e derrubar a resposta inteira com
 * um 500, mesmo com o .xlsx já pronto na mão.
 *
 * Escapar para `\uXXXX` mantém tudo ASCII e continua sendo JSON válido: um
 * `JSON.parse` do outro lado devolve o texto acentuado original.
 */
export function encodeReportHeader(report: ShopeeExportReport): string {
  return JSON.stringify(report).replace(
    /[^\x20-\x7e]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

export async function exportShopeeWorkbook(
  products: SourceProduct[],
  opts?: { templatePath?: string; generatedAt?: Date; includeReportSheets?: boolean },
): Promise<ShopeeExportResult> {
  const { template, warning } = await resolveShopeeTemplate({ templatePath: opts?.templatePath });

  const mapped = mapProducts(products, template);
  const corrections = autofix(mapped, template);
  const issues = validate(mapped, template);
  const rejected = rejectedProductIds(issues);

  const generatedAtISO = (opts?.generatedAt ?? new Date()).toISOString();
  const buffer = await buildWorkbook({
    template,
    products: mapped,
    corrections,
    issues,
    rejected,
    warning,
    generatedAtISO,
    includeReportSheets: opts?.includeReportSheets ?? false,
  });

  const errors = issues.filter((i) => i.level === 'error').length;
  const exported = mapped.filter((p) => !rejected.has(p.productId));
  const report: ShopeeExportReport = {
    templateSource: template.source,
    templateVersion: template.version,
    totalProducts: mapped.length,
    totalRows: mapped.reduce((n, p) => n + p.rows.length, 0),
    exportedProducts: exported.length,
    exportedRows: exported.reduce((n, p) => n + p.rows.length, 0),
    corrections: corrections.length,
    errors,
    warnings: issues.length - errors,
    rejected: rejected.size,
    warning,
  };

  return { buffer, report };
}
