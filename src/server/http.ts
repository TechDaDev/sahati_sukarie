/**
 * أدوات موحّدة لمعالجة طلبات الـ API: تغليف الاستجابات، ترجمة الأخطاء،
 * وتطبيق المصادقة و CSRF وتحديد المعدل.
 */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { z } from 'zod';
import { ApiError, guard } from './auth/session';
import { zodFieldErrors } from './validation/schemas';

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: string; code?: string; fields?: Record<string, string> };

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function fail(status: number, error: string, code?: string, fields?: Record<string, string>) {
  const body: ApiFailure = { ok: false, error };
  if (code) body.code = code;
  if (fields) body.fields = fields;
  return NextResponse.json(body, { status });
}

/** يُحوّل أي استثناء إلى استجابة JSON عربية آمنة (بدون تسريب تفاصيل داخلية) */
export function handleError(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ApiError) {
    return fail(error.status, error.message, error.code, error.fields);
  }
  if (error instanceof ZodError) {
    const { message, fields } = zodFieldErrors(error);
    return fail(400, message, 'VALIDATION', fields);
  }
  // أخطاء قاعدة البيانات: نُعيد رسالة عامة ونطبع تفاصيل تقنية فقط في السجلات
  const message = error instanceof Error ? error.message : String(error);
  if (/duplicate key|unique constraint/i.test(message)) {
    return fail(409, 'توجد بيانات مكررة. تحقق من القيم المدخلة.', 'DUPLICATE');
  }
  console.error('[api] خطأ غير متوقع:', message);
  return fail(500, 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.', 'INTERNAL');
}

/** قراءة جسم الطلب والتحقق منه بمخطط Zod */
export async function parseBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'حجم الطلب أكبر من الحد المسموح.');
  }
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'نوع محتوى الطلب غير مدعوم.');
  }
  try {
    if (!request.body) throw new Error('Missing request body');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'حجم الطلب أكبر من الحد المسموح.');
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON', 'صيغة الطلب غير صحيحة.');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const { message, fields } = zodFieldErrors(result.error);
    throw new ApiError(400, 'VALIDATION', message, fields);
  }
  return result.data;
}

/** قراءة معاملات الاستعلام والتحقق منها */
export function parseQuery<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => { raw[key] = value; });
  const result = schema.safeParse(raw);
  if (!result.success) {
    const { message, fields } = zodFieldErrors(result.error);
    throw new ApiError(400, 'VALIDATION', message, fields);
  }
  return result.data;
}

export { guard };

export const noStore = { 'Cache-Control': 'no-store, max-age=0' };
const MAX_JSON_BODY_BYTES = 1024 * 1024;
