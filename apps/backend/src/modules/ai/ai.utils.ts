/**
 * Utilitários compartilhados pelos adapters de IA. Puros e sem dependência de
 * SDK — assim os providers permanecem finos.
 */

/**
 * Parse tolerante de JSON: modelos às vezes embrulham o JSON em ```json ...```
 * ou adicionam texto antes/depois. Extrai o primeiro objeto/array válido.
 */
export function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/[{[][\s\S]*[}\]]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Baixa uma imagem (URL http/https ou data URL) e devolve base64 + media type.
 * Claude e Gemini exigem base64 inline; a OpenAI aceita URL direta.
 */
export async function fetchImageAsBase64(
  imageUrl: string,
): Promise<{ base64: string; mediaType: string }> {
  if (imageUrl.startsWith('data:')) {
    const [meta, data] = imageUrl.split(',');
    const mediaType = meta.slice(5, meta.indexOf(';')) || 'image/jpeg';
    return { base64: data, mediaType };
  }

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Falha ao baixar imagem (${res.status}): ${imageUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = imageUrl.split('.').pop()?.toLowerCase()?.split('?')[0] ?? 'jpeg';
  const mediaType = res.headers.get('content-type') ?? EXT_TO_MIME[ext] ?? 'image/jpeg';
  return { base64: buf.toString('base64'), mediaType };
}
