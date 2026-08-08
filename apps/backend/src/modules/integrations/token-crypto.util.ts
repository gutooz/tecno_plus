import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const PREFIX = 'v1:';

/**
 * Deriva uma chave de 32 bytes a partir do segredo em texto (mesmo padrão do
 * JWT_SECRET — qualquer string forte serve, não precisa ser hex/base64 exato).
 */
function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'tecnoplus-marketplace-tokens', 32);
}

/** Criptografa um token (access/refresh) para guardar em repouso no Mongo. */
export function encryptToken(plainText: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Descriptografa um token salvo. Valores sem o prefixo `v1:` são tratados como
 * texto puro legado (conexões salvas antes desta criptografia existir) — evita
 * derrubar conexões já ativas em produção; o próximo refresh já regrava
 * criptografado.
 */
export function decryptToken(stored: string, secret: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(':');
  if (!ivB64 || !tagB64 || !dataB64) return stored;
  const decipher = createDecipheriv(ALGO, deriveKey(secret), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return plain.toString('utf8');
}
