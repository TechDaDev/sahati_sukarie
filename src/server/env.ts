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
