'use client';

/**
 * Cliente HTTP fino para a API Nest. Guarda o access token em localStorage
 * (MVP) e injeta o Bearer automaticamente. Em produção, migrar para cookies
 * httpOnly + refresh silencioso (ver roadmap).
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

const TOKEN_KEY = 'tp_access';

/** `persist=false` keeps the session only for the current tab (sessionStorage). */
export function setToken(token: string, persist = true) {
  if (typeof window === 'undefined') return;
  if (persist) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}
export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${message}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  async download(path: string): Promise<Blob> {
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${BASE}/api${path}`, { headers });
    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText);
      throw new Error(`API ${res.status}: ${message}`);
    }
    return res.blob();
  },

  /** Upload de múltiplos arquivos com progresso via XHR. */
  upload(
    files: File[],
    onProgress?: (pct: number) => void,
    options?: { deferPipeline?: boolean },
  ): Promise<{
    received: number;
    products: { id: string; internalSku: string; status: string }[];
  }> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      if (options?.deferPipeline) form.append('deferPipeline', 'true');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/api/upload`);
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status < 300
          ? resolve(JSON.parse(xhr.responseText))
          : reject(new Error(`Upload ${xhr.status}: ${xhr.responseText}`));
      xhr.onerror = () => reject(new Error('Falha de rede no upload'));
      xhr.send(form);
    });
  },
};
