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

export async function exportShopeeWorkbook(
  products: SourceProduct[],
  opts?: { templatePath?: string; generatedAt?: Date },
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
  });

  const errors = issues.filter((i) => i.level === 'error').length;
  const report: ShopeeExportReport = {
    templateSource: template.source,
    templateVersion: template.version,
    totalProducts: mapped.length,
    totalRows: mapped.reduce((n, p) => n + p.rows.length, 0),
    corrections: corrections.length,
    errors,
    warnings: issues.length - errors,
    rejected: rejected.size,
    warning,
  };

  return { buffer, report };
}
