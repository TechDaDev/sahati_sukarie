/**
 * خدمة المصادقة المشتركة بين واجهات المريض والمدير.
 * تُغلّف سياسة القفل بعد المحاولات الفاشلة وتحديد المعدل.
 */
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { ApiError, assertRateLimit, createSession, setSessionCookie, verifyPassword, writeAudit } from '../auth/session';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type LoginResult = {
  userId: string;
  email: string;
  role: 'PATIENT' | 'ADMIN' | 'DOCTOR';
  mustChangePassword: boolean;
  csrfToken: string;
};

/** رسالة موحّدة لمنع تسريب وجود الحساب من عدمه */
const INVALID_CREDENTIALS = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';

export async function authenticate(
  email: string,
  password: string,
  meta: { ip: string; userAgent?: string | null; requireRole?: 'PATIENT' | 'ADMIN' },
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();

  await assertRateLimit(
    { key: `login:${meta.ip}`, limit: 15, windowSeconds: 900 },
    'محاولات تسجيل دخول كثيرة من هذا الجهاز. يرجى المحاولة بعد 15 دقيقة.',
  );

  const row = await db.query.users.findFirst({
    where: (u, { sql: s }) => s`lower(${u.email}) = ${normalizedEmail}`,
  });

  // حساب وهمي بمقارنة ثابتة لتقليل فرق زمن الاستجابة
  if (!row) {
    await verifyPassword(password, '$2b$12$0000000000000000000000000000000000000000000000000000');
    throw new ApiError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
  }

  if (row.lockedUntil && row.lockedUntil > new Date()) {
    throw new ApiError(429, 'ACCOUNT_LOCKED', 'تم قفل الحساب مؤقتًا بسبب محاولات فاشلة متكررة. حاول بعد قليل.');
  }

  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) {
    const [updated] = await db.update(users).set({
      failedLoginCount: sql`LEAST(${users.failedLoginCount} + 1, ${MAX_FAILED})`,
      lockedUntil: sql`CASE WHEN ${users.failedLoginCount} + 1 >= ${MAX_FAILED} THEN ${new Date(Date.now() + LOCK_MINUTES * 60_000)}::timestamptz ELSE NULL::timestamptz END`,
      updatedAt: new Date(),
    }).where(eq(users.id, row.id)).returning({ failedLoginCount: users.failedLoginCount });
    const failed = updated?.failedLoginCount ?? MAX_FAILED;

    await writeAudit({
      actorUserId: row.id, actorRole: row.role === 'ADMIN' ? 'ADMIN' : 'PATIENT',
      action: 'LOGIN_FAILED', targetType: 'user', targetId: row.id,
      metadata: { attempts: failed }, ip: meta.ip,
    });
    throw new ApiError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
  }

  if (row.status !== 'ACTIVE') {
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'هذا الحساب غير مُفعّل حاليًا. يرجى التواصل مع إدارة المنصة.');
  }

  if (row.role === 'PATIENT' && row.emailActivationRequired && !row.emailVerifiedAt) {
    throw new ApiError(403, 'EMAIL_VERIFICATION_REQUIRED', 'تحقق من بريدك الإلكتروني قبل تسجيل الدخول.');
  }

  if (meta.requireRole && row.role !== meta.requireRole) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
  }

  const now = new Date();
  const [unlocked] = await db.update(users).set({
    failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now,
  }).where(and(eq(users.id, row.id), or(isNull(users.lockedUntil), lte(users.lockedUntil, now))))
    .returning({ id: users.id });
  if (!unlocked) {
    throw new ApiError(429, 'ACCOUNT_LOCKED', 'تم قفل الحساب مؤقتًا بسبب محاولات فاشلة متكررة. حاول بعد قليل.');
  }

  const session = await createSession(row.id, { ip: meta.ip, userAgent: meta.userAgent });
  await setSessionCookie(session.token, session.expiresAt, session.csrfToken);

  await writeAudit({
    actorUserId: row.id, actorRole: row.role === 'ADMIN' ? 'ADMIN' : 'PATIENT',
    action: 'LOGIN_SUCCESS', targetType: 'user', targetId: row.id, ip: meta.ip,
  });

  return {
    userId: row.id,
    email: row.email,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    csrfToken: session.csrfToken,
  };
}

/** تجاوز سجل الأرقام المستخدمة في الاختبارات */
export async function resetRateLimits(): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limit_counters`);
}
