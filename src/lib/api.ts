'use client';
/**
 * عميل الـ API في المتصفح.
 * - يقرأ رمز CSRF من كوكي غير محمي (نمط الرمز المزدوج) ويُرسله في ترويسة.
 * - يوحّد معالجة الأخطاء العربية القادمة من الخادم.
 */

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

export const CSRF_COOKIE = 'sahati_csrf';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fields?: Record<string, string>; status: number };

export class ApiClientError extends Error {
  code?: string;
  fields?: Record<string, string>;
  status: number;
  constructor(result: Extract<ApiResult<unknown>, { ok: false }>) {
    super(result.error);
    this.name = 'ApiClientError';
    this.code = result.code;
    this.fields = result.fields;
    this.status = result.status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = readCookie(CSRF_COOKIE);

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }

  const parsed = payload as { ok?: boolean; data?: T; error?: string; code?: string; fields?: Record<string, string> } | null;

  if (!response.ok || !parsed?.ok) {
    throw new ApiClientError({
      ok: false,
      error: parsed?.error ?? 'حدث خطأ غير متوقع. حاول مرة أخرى.',
      code: parsed?.code,
      fields: parsed?.fields,
      status: response.status,
    });
  }

  return parsed.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** تحميل ملف PDF عبر fetch مع ترويسة CSRF ثم تنزيله في المتصفح */
export async function downloadPdf(path: string, filename: string): Promise<void> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) {
    let message = 'تعذّر توليد الملف. حاول مرة أخرى.';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch { /* تجاهل */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
