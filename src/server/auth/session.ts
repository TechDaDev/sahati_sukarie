/**
 * وحدة المصادقة: تجزئة كلمات المرور، الجلسات، حماية CSRF، وتحديد المعدل.
 */
import bcrypt from 'bcryptjs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { isIP } from 'node:net';
import { cookies, headers } from 'next/headers';
import { db } from '../db';
import { sessions, users, auditLogs, rateLimitCounters } from '../db/schema';
import { env, isProduction } from '../env';
import { randomToken, sha256Hex } from '../lib/crypto';

export const SESSION_COOKIE = 'sahati_session';
/** كوكي غير محمي يُستخدم فقط لنمط "الرمز المزدوج" في حماية CSRF */
export const CSRF_COOKIE = 'sahati_csrf';
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // أقصى عمر مطلق 7 أيام

/** bcrypt بـ 12 دورة — متوافق مع بيئة Node بدون بناء أصلي */
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export type SessionUser = {
  id: string;
  email: string;
  role: 'PATIENT' | 'ADMIN' | 'DOCTOR';
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  mustChangePassword: boolean;
};

export type SessionRecord = {
  sessionId: string;
  csrfToken: string;
  user: SessionUser;
};

/* --------------------------------------------------------------- إنشاء جلسة */

export async function createSession(userId: string, meta?: { ip?: string | null; userAgent?: string | null }): Promise<{
  token: string; csrfToken: string; expiresAt: Date;
}> {
  const config = env();
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const now = new Date();
  const idle = new Date(now.getTime() + config.SESSION_IDLE_HOURS * 3600_000);
  const absolute = new Date(now.getTime() + config.SESSION_ABSOLUTE_DAYS * 86400_000);

  await db.insert(sessions).values({
    id: sha256Hex(token),
    userId,
    csrfToken,
    ipAddress: meta?.ip ?? null,
    userAgent: meta?.userAgent ? meta.userAgent.slice(0, 400) : null,
    idleExpiresAt: idle,
    absoluteExpiresAt: absolute,
  });

  return { token, csrfToken, expiresAt: absolute };
}

export async function setSessionCookie(token: string, expiresAt: Date, csrfToken?: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  if (csrfToken) {
    // كوكي قابل للقراءة من JS لتمرير رمز CSRF في الترويسة (رمز مزدوج)
    store.set(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: isProduction(),
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { httpOnly: true, secure: isProduction(), sameSite: 'lax', path: '/', maxAge: 0 });
  store.set(CSRF_COOKIE, '', { httpOnly: false, secure: isProduction(), sameSite: 'lax', path: '/', maxAge: 0 });
}

/* ------------------------------------------------------------- قراءة الجلسة */

/**
 * يحمّل الجلسة الحالية من الكوكي، ويتحقق من انتهاء المدة، ويحدّث آخر ظهور.
 * يُرجع null إذا لم توجد جلسة صالحة.
 */
export async function getCurrentSession(): Promise<SessionRecord | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = sha256Hex(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      csrfToken: sessions.csrfToken,
      idleExpiresAt: sessions.idleExpiresAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      revokedAt: sessions.revokedAt,
      id_: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = new Date();
  if (row.revokedAt || row.idleExpiresAt <= now || row.absoluteExpiresAt <= now) {
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, row.sessionId));
    return null;
  }
  if (row.status !== 'ACTIVE') {
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, row.sessionId));
    return null;
  }

  // تجديد انتهاء الخمول
  const idle = new Date(Math.min(
    now.getTime() + env().SESSION_IDLE_HOURS * 3600_000,
    row.absoluteExpiresAt.getTime(),
  ));
  await db.update(sessions).set({ lastSeenAt: now, idleExpiresAt: idle }).where(eq(sessions.id, row.sessionId));

  return {
    sessionId: row.sessionId,
    csrfToken: row.csrfToken,
    user: {
      id: row.id_, email: row.email, role: row.role, status: row.status,
      mustChangePassword: row.mustChangePassword,
    },
  };
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sha256Hex(token)));
}

/** إلغاء كل جلسات مستخدم (يُستخدم بعد استعادة كلمة المرور أو التغيير) */
export async function revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  const now = new Date();
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), sql`${sessions.id} <> ${exceptSessionId}`)
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
  await db.update(sessions).set({ revokedAt: now }).where(where);
}

/* ------------------------------------------------------------ CSRF والحماية */

/**
 * حماية CSRF بنمط "رمز مزدوج": يُرسل رمز الجلسة في ترويسة x-csrf-token
 * ويُقارن مع القيمة المخزّنة في الخادم.
 */
export async function assertCsrf(request: Request, session: SessionRecord): Promise<void> {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  const supplied = request.headers.get('x-csrf-token') ?? request.headers.get('x-xsrf-token');
  if (!supplied || supplied !== session.csrfToken) {
    throw new ApiError(403, 'CSRF_INVALID', 'تعذّر التحقق من صحة الطلب. أعد تحميل الصفحة وحاول مرة أخرى.');
  }
  // حماية إضافية: رفض الطلبات القادمة من أصل مختلف
  const origin = request.headers.get('origin');
  if (origin) {
    const host = (await headers()).get('host');
    try {
      const originHost = new URL(origin).host;
      if (host && originHost !== host) {
        throw new ApiError(403, 'ORIGIN_MISMATCH', 'مصدر الطلب غير مسموح.');
      }
    } catch {
      throw new ApiError(403, 'ORIGIN_INVALID', 'مصدر الطلب غير صالح.');
    }
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** المصادقة الإلزامية لمستخدم مسجّل — تُرمي خطأ 401 عند الفشل */
export async function requireSession(allowedRoles?: Array<'PATIENT' | 'ADMIN'>): Promise<SessionRecord> {
  const session = await getCurrentSession();
  if (!session) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'يجب تسجيل الدخول للمتابعة.');
  }
  if (allowedRoles && !allowedRoles.includes(session.user.role as 'PATIENT' | 'ADMIN')) {
    throw new ApiError(403, 'FORBIDDEN', 'ليست لديك صلاحية الوصول إلى هذا المورد.');
  }
  return session;
}

/**
 * حماية موحّدة للـ API: مصادقة + صلاحية الدور + حماية CSRF لطلبات التعديل.
 * تعيش هنا لأنها تعتمد على الجلسة والكوكيز مباشرة.
 */
export async function guard(
  request: Request,
  options: { roles?: Array<'PATIENT' | 'ADMIN'>; csrf?: boolean } = {},
): Promise<{ session: SessionRecord; ip: string }> {
  const session = await requireSession(options.roles);
  if (options.csrf !== false) {
    await assertCsrf(request, session);
  }
  return { session, ip: clientIp(request) };
}

/** المسار المفضل بعد تسجيل الدخول حسب الدور */
export function homePathForRole(role: string): string {
  return role === 'ADMIN' ? '/admin' : '/dashboard';
}

/* --------------------------------------------------------------- تحديد المعدل */

export type RateLimitRule = { key: string; limit: number; windowSeconds: number };

/**
 * محدد معدل بسيط مدعوم بقاعدة البيانات (يعمل عبر جميع نسخ التطبيق).
 * يُعيد false إذا تجاوز الطالب الحد.
 */
export async function checkRateLimit(rule: RateLimitRule): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - rule.windowSeconds * 1000);
  const [row] = await db.insert(rateLimitCounters)
    .values({ key: rule.key, windowStart: now, counter: 1 })
    .onConflictDoUpdate({
      target: rateLimitCounters.key,
      set: {
        windowStart: sql`CASE WHEN ${rateLimitCounters.windowStart} <= ${cutoff} THEN ${now} ELSE ${rateLimitCounters.windowStart} END`,
        counter: sql`CASE WHEN ${rateLimitCounters.windowStart} <= ${cutoff} THEN 1 ELSE LEAST(${rateLimitCounters.counter} + 1, ${rule.limit + 1}) END`,
      },
    })
    .returning({ counter: rateLimitCounters.counter });
  return (row?.counter ?? rule.limit + 1) <= rule.limit;
}

export async function assertRateLimit(rule: RateLimitRule, message: string): Promise<void> {
  const allowed = await checkRateLimit(rule);
  if (!allowed) throw new ApiError(429, 'RATE_LIMITED', message);
}

/* ----------------------------------------------------------------- سجل التدقيق */

export async function writeAudit(entry: {
  actorUserId?: string | null;
  actorRole?: 'PATIENT' | 'ADMIN' | 'SYSTEM';
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId ?? null,
    actorRole: entry.actorRole ?? 'SYSTEM',
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? null,
    ipAddress: entry.ip ?? null,
  });
}

/** Trust only the platform header set by Railway's proxy. */
export function clientIp(request: Request): string {
  const candidate = request.headers.get('x-real-ip');
  if (!candidate) return 'unknown';
  const ip = candidate.trim();
  return ip.length <= 64 && isIP(ip) !== 0 ? ip : 'unknown';
}
