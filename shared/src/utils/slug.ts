/** Gera slug URL-safe a partir de um texto (remove acentos, espaços -> hifen). */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacriticos combinantes
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** SKU interno deterministico e legivel: TP-<CATEGORIA>-<SEQ/rand>. */
export function buildInternalSku(category: string | undefined, seed: string): string {
  const cat = (category ?? 'GEN')
    .slice(0, 3)
    .toUpperCase()
    .replace(/[^A-Z]/g, 'X');
  const suffix = seed
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6)
    .toUpperCase()
    .padStart(6, '0');
  return `TP-${cat}-${suffix}`;
}
