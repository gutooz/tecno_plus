'use client';

/**
 * Cliente HTTP fino para a API Nest. Guarda o access token em localStorage
 * (MVP) e injeta o Bearer automaticamente. Em produção, migrar para cookies
 * httpOnly + refresh silencioso (ver roadmap).
 */
const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const BASE = RAW_BASE.replace(/\/+$/, '').replace(/\/api$/i, '');

const TOKEN_KEY = 'tp_access';
const REFRESH_KEY = 'tp_refresh';
const USER_KEY = 'tp_user';

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'operator' | 'supplier' | 'seller';
}

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
export function setSessionUser(user: SessionUser, persist = true) {
  if (typeof window === 'undefined') return;
  const value = JSON.stringify(user);
  if (persist) {
    localStorage.setItem(USER_KEY, value);
    sessionStorage.removeItem(USER_KEY);
  } else {
    sessionStorage.setItem(USER_KEY, value);
    localStorage.removeItem(USER_KEY);
  }
}
export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
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
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(USER_KEY);
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

/** Extrai o `message` do corpo de erro do Nest; cai no statusText se não vier JSON. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    return msg || res.statusText;
  } catch {
    return res.statusText;
  }
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });

  if (res.status === 401) {
    // Num endpoint de auth, 401 é "credencial errada" — não sessão morta. Redirecionar
    // aqui recarregaria a página antes do formulário conseguir exibir o erro, e o
    // usuário voltaria pro login sem explicação nenhuma.
    if (path.startsWith('/auth/')) {
      throw new ApiError(401, await errorMessage(res));
    }
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
    throw new ApiError(res.status, await errorMessage(res));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Base do upload multipart via XHR (progresso + retry de token em 401),
 * reaproveitada por `api.upload()` (fotos do catálogo principal) e
 * `api.uploadTo()` (qualquer outro endpoint multipart, ex. fotos do
 * fornecedor). */
function uploadFiles<T>(
  url: string,
  files: File[],
  onProgress?: (pct: number) => void,
  extraFields?: Record<string, string | undefined>,
): Promise<T> {
  const attempt = (): Promise<T> =>
    new Promise((resolve, reject) => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      for (const [key, value] of Object.entries(extraFields ?? {})) {
        if (value !== undefined) form.append(key, value);
      }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
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
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  // Devolve os headers junto com o blob — endpoints como o export Shopee mandam
  // um relatório em `X-Shopee-Export-Report` (ex.: produtos rejeitados) que só
  // existe aí; descartar os headers faz o chamador achar que um arquivo vazio
  // (todos os produtos rejeitados) é um download normal, sem explicação.
  async download(path: string): Promise<{ blob: Blob; headers: Headers }> {
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
    return { blob: await res.blob(), headers: res.headers };
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
    return uploadFiles(`${BASE}/api/upload`, files, onProgress, {
      deferPipeline: options?.deferPipeline ? 'true' : undefined,
    });
  },

  /** Mesmo mecanismo do `upload()` (progresso + retry de token via XHR), mas
   * apontando pra qualquer endpoint multipart — usado pelo cadastro por foto
   * do fornecedor (`/dropshipping/supplier/products/photos`). */
  uploadTo<T>(
    path: string,
    files: File[],
    onProgress?: (pct: number) => void,
    extraFields?: Record<string, string | undefined>,
  ): Promise<T> {
    return uploadFiles<T>(`${BASE}/api${path}`, files, onProgress, extraFields);
  },
};
