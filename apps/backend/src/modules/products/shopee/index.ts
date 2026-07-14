/**
 * Motor de exportação Shopee (Importação em Massa — BR).
 * Módulos: template → mapper → autofix → validator → workbook, orquestrados
 * por `exportShopeeWorkbook`. Regra nº 1: nunca inventar colunas.
 */
export * from './shopee-template';
export * from './shopee-mapper';
export * from './shopee-autofix';
export * from './shopee-validator';
export * from './shopee-workbook';
export * from './shopee-export';
