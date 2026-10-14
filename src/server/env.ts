/**
 * قراءة والتحقق من متغيرات البيئة.
 * لا تُطبع أي قيمة سرية في السجلات.
 */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL مطلوب'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET قصير جدًا'),
  FIELD_ENCRYPTION_KEY: z.string().min(1, 'FIELD_ENCRYPTION_KEY مطلوب'),
  NATIONAL_ID_PEPPER: z.string().min(8, 'NATIONAL_ID_PEPPER مطلوب'),
  APP_URL: z.string().default('http://localhost:3000'),
  DISPLAY_TIMEZONE: z.string().default('Asia/Baghdad'),
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),
  SESSION_IDLE_HOURS: z.coerce.number().default(8),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().default(7),
  /** مسار متصفح Chromium المستخدم لتوليد ملفات PDF العربية */
  CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
  PDF_ENGINE: z.enum(['chromium']).default('chromium'),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;
  for (const name of ['SESSION_SECRET', 'NATIONAL_ID_PEPPER'] as const) {
    if (Buffer.byteLength(value[name], 'utf8') < 32) {
      ctx.addIssue({ code: 'custom', path: [name], message: 'يجب أن يحتوي على 32 بايت على الأقل في الإنتاج' });
    }
  }
  const rawKey = value.FIELD_ENCRYPTION_KEY.trim();
  const decodedKey = Buffer.from(rawKey, 'base64');
  if (decodedKey.length !== 32 && Buffer.byteLength(rawKey, 'utf8') !== 32) {
    ctx.addIssue({ code: 'custom', path: ['FIELD_ENCRYPTION_KEY'], message: 'يجب أن يكون مفتاح AES-256 صالحًا بطول 32 بايت' });
  }
  let appUrl: URL | null = null;
  try { appUrl = new URL(value.APP_URL); } catch { /* reported below */ }
  if (!appUrl || appUrl.protocol !== 'https:' || appUrl.username || appUrl.password) {
    ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'يجب أن يكون عنوان HTTPS صالحًا دون بيانات اعتماد' });
  }
  if (!Number.isInteger(value.SESSION_IDLE_HOURS) || value.SESSION_IDLE_HOURS < 1 || value.SESSION_IDLE_HOURS > 168) {
    ctx.addIssue({ code: 'custom', path: ['SESSION_IDLE_HOURS'], message: 'يجب أن يكون بين 1 و168 ساعة' });
  }
  if (!Number.isInteger(value.SESSION_ABSOLUTE_DAYS) || value.SESSION_ABSOLUTE_DAYS < 1 || value.SESSION_ABSOLUTE_DAYS > 30) {
    ctx.addIssue({ code: 'custom', path: ['SESSION_ABSOLUTE_DAYS'], message: 'يجب أن يكون بين 1 و30 يومًا' });
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
    throw new Error(`إعدادات البيئة غير مكتملة أو غير صحيحة → ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().NODE_ENV === 'production';
export const displayTimezone = () => env().DISPLAY_TIMEZONE;
