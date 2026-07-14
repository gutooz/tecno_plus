'use client';

/**
 * Cliente HTTP fino para a API Nest. Guarda o access token em localStorage
 * (MVP) e injeta o Bearer automaticamente. Em produção, migrar para cookies
 * httpOnly + refresh silencioso (ver roadmap).
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

const TOKEN_KEY = 'tp_access';
const REFRESH_KEY = 'tp_refresh';

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
export function setRefreshToken(token: string, persist = true) {
  if (typeof window === 'undefined') return;
  if (persist) {
    localStorage.setItem(REFRESH_KEY, token);
    sessionStorage.removeItem(REFRESH_KEY);
  } else {
    sessionStorage.setItem(REFRESH_KEY, token);
    localStorage.removeItem(REFRESH_KEY);
  }
}
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
}
export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

// O access token dura só 15min (JWT_EXPIRES_IN) — numa sessão longa (subir
// várias fotos, preencher uma a uma) ele expira no meio do caminho. Troca
// pelo refresh token nos bastidores em vez de falhar silenciosamente.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    const persisted = typeof window !== 'undefined' && !!localStorage.getItem(TOKEN_KEY);
    setToken(data.accessToken, persisted);
    setRefreshToken(data.refreshToken, persisted);
    return data.accessToken;
  } catch {
    return null;
  }
}

function ensureFreshToken(): Promise<string | null> {
  refreshing ??= refreshAccessToken().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function goToLogin() {
  clearToken();
  if (typeof window !== 'undefined') window.location.href = '/login';
}

/** Erro tipado p/ o React Query distinguir 401 (sessão morta) de falha transitória
 * e não ficar reexecutando a query em loop contra um backend que já rejeitou o token. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });

  if (res.status === 401) {
    if (!isRetry && getRefreshToken()) {
      const newToken = await ensureFreshToken();
      if (newToken) return request<T>(path, options, true);
    }
    // Sem refresh token ou refresh também falhou: sessão está morta de vez —
    // manda pro login em vez de deixar a UI presa mostrando dado vazio.
    goToLogin();
    throw new ApiError(401, 'Sessão expirada — faça login novamente.');
  }

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `API ${res.status}: ${message}`);
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
    const fetchOnce = () => {
      const token = getToken();
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return fetch(`${BASE}/api${path}`, { headers });
    };
    let res = await fetchOnce();
    if (res.status === 401 && getRefreshToken() && (await ensureFreshToken())) {
      res = await fetchOnce();
    }
    if (res.status === 401) {
      goToLogin();
      throw new ApiError(401, 'Sessão expirada — faça login novamente.');
    }
    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText);
      throw new ApiError(res.status, `API ${res.status}: ${message}`);
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
    const attempt = (): Promise<{
      received: number;
      products: { id: string; internalSku: string; status: string }[];
    }> =>
      new Promise((resolve, reject) => {
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

    return attempt().catch(async (err) => {
      const is401 = err instanceof Error && /^Upload 401/.test(err.message);
      if (!is401) throw err;
      if (getRefreshToken() && (await ensureFreshToken())) return attempt();
      goToLogin();
      throw new ApiError(401, 'Sessão expirada — faça login novamente.');
    });
  },
};
