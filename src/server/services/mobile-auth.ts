import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { mobileRefreshTokens, mobileSessions, users } from '../db/schema';
import { ApiError, assertRateLimit, verifyPassword, writeAudit, type SessionRecord } from '../auth/session';
import { randomToken, sha256Hex } from '../lib/crypto';

const ACCESS_MS = 15 * 60_000;
const REFRESH_MS = 30 * 86400_000;
const DUMMY_PASSWORD_HASH = '$2b$12$0000000000000000000000000000000000000000000000000000';

function tokens() {
  return { accessToken: `sat_${randomToken(32)}`, refreshToken: `srt_${randomToken(32)}` };
}

function tokenResult(accessToken: string, refreshToken: string, accessExpiresAt: Date, refreshExpiresAt: Date) {
  return { accessToken, refreshToken, tokenType: 'Bearer', accessExpiresAt: accessExpiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString() };
}

export async function loginMobile(email: string, password: string, meta: { ip: string; userAgent?: string | null; deviceLabel?: string | null }) {
  await assertRateLimit({ key: `mobile-login:${meta.ip}`, limit: 12, windowSeconds: 900 }, 'محاولات تسجيل دخول كثيرة. حاول لاحقًا.');
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  const validPassword = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !validPassword) {
    if (user?.lockedUntil && user.lockedUntil > new Date()) throw new ApiError(429, 'ACCOUNT_LOCKED', 'تم قفل الحساب مؤقتًا بسبب محاولات فاشلة متكررة. حاول لاحقًا.');
    if (user) {
      const [updated] = await db.update(users).set({
        failedLoginCount: sql`LEAST(${users.failedLoginCount} + 1, 5)`,
        lockedUntil: sql`CASE WHEN ${users.failedLoginCount} + 1 >= 5 THEN ${new Date(Date.now() + 15 * 60_000)} ELSE ${users.lockedUntil} END`,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id)).returning({ failedLoginCount: users.failedLoginCount });
      if ((updated?.failedLoginCount ?? 0) >= 5) throw new ApiError(429, 'ACCOUNT_LOCKED', 'تم قفل الحساب مؤقتًا بسبب محاولات فاشلة متكررة. حاول لاحقًا.');
    }
    if (user) await writeAudit({ actorUserId: user.id, actorRole: user.role === 'ADMIN' ? 'ADMIN' : 'PATIENT', action: 'MOBILE_LOGIN_FAILED', targetType: 'user', targetId: user.id, ip: meta.ip });
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new ApiError(429, 'ACCOUNT_LOCKED', 'تم قفل الحساب مؤقتًا بسبب محاولات فاشلة متكررة. حاول لاحقًا.');
  if (user.status !== 'ACTIVE') throw new ApiError(403, 'ACCOUNT_DISABLED', 'هذا الحساب غير مُفعّل حاليًا.');
  if (user.role !== 'PATIENT') throw new ApiError(403, 'PATIENT_ONLY', 'هذا التطبيق مخصص لحسابات المرضى.');
  const now = new Date();
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now }).where(eq(users.id, user.id));
  const accessExpiresAt = new Date(now.getTime() + ACCESS_MS);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_MS);
  const { accessToken, refreshToken } = tokens();
  const session = await db.transaction(async (tx) => {
    const [created] = await tx.insert(mobileSessions).values({ userId: user.id, deviceLabel: meta.deviceLabel?.slice(0, 120) ?? null, accessTokenHash: sha256Hex(accessToken), accessExpiresAt, refreshExpiresAt, ipAddress: meta.ip, userAgent: meta.userAgent?.slice(0, 400) ?? null }).returning({ id: mobileSessions.id });
    await tx.insert(mobileRefreshTokens).values({ tokenHash: sha256Hex(refreshToken), mobileSessionId: created!.id, generation: 0, expiresAt: refreshExpiresAt });
    return created!;
  });
  await writeAudit({ actorUserId: user.id, actorRole: 'PATIENT', action: 'MOBILE_LOGIN_SUCCESS', targetType: 'mobile_session', targetId: session.id, ip: meta.ip });
  return { ...tokenResult(accessToken, refreshToken, accessExpiresAt, refreshExpiresAt), user: { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword } };
}

export async function authenticateBearer(request: Request): Promise<{ session: SessionRecord; mobileSessionId: string }> {
  const url = new URL(request.url);
  if (['token', 'access_token', 'refresh_token'].some((key) => url.searchParams.has(key))) throw new ApiError(400, 'TOKEN_IN_URL', 'لا تُرسل الرموز ضمن عنوان الطلب.');
  const auth = request.headers.get('authorization');
  const cookie = request.headers.get('cookie') ?? '';
  if (auth && /(?:^|;\s*)sahati_session=/.test(cookie)) throw new ApiError(400, 'AMBIGUOUS_AUTH', 'أرسل طريقة مصادقة واحدة فقط.');
  if (!auth?.startsWith('Bearer ') || auth.length > 512) throw new ApiError(401, 'UNAUTHENTICATED', 'يجب تسجيل الدخول للمتابعة.');
  const token = auth.slice(7);
  if (!token.startsWith('sat_')) throw new ApiError(401, 'UNAUTHENTICATED', 'رمز الدخول غير صالح.');
  const [row] = await db.select({ sessionId: mobileSessions.id, expiresAt: mobileSessions.accessExpiresAt, revokedAt: mobileSessions.revokedAt, userId: users.id, email: users.email, role: users.role, status: users.status, mustChangePassword: users.mustChangePassword }).from(mobileSessions).innerJoin(users, eq(users.id, mobileSessions.userId)).where(eq(mobileSessions.accessTokenHash, sha256Hex(token))).limit(1);
  if (!row || row.revokedAt || row.expiresAt <= new Date()) throw new ApiError(401, 'UNAUTHENTICATED', 'رمز الدخول غير صالح أو منتهي.');
  if (row.status !== 'ACTIVE' || row.role !== 'PATIENT') {
    await db.update(mobileSessions).set({ revokedAt: new Date(), revocationReason: 'account_unavailable' }).where(and(eq(mobileSessions.id, row.sessionId), isNull(mobileSessions.revokedAt)));
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'هذا الحساب غير مُفعّل حاليًا.');
  }
  await db.update(mobileSessions).set({ lastUsedAt: new Date() }).where(eq(mobileSessions.id, row.sessionId));
  return { session: { sessionId: row.sessionId, csrfToken: '', user: { id: row.userId, email: row.email, role: row.role, status: row.status, mustChangePassword: row.mustChangePassword } }, mobileSessionId: row.sessionId };
}

export async function refreshMobile(refreshToken: string, requestId: string, ip: string) {
  await assertRateLimit({ key: `mobile-refresh:${ip}`, limit: 60, windowSeconds: 900 }, 'طلبات تجديد كثيرة. حاول لاحقًا.');
  if (!refreshToken.startsWith('srt_')) throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'رمز التجديد غير صالح.');
  const oldHash = sha256Hex(refreshToken);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT r.token_hash, r.mobile_session_id, r.generation, r.expires_at, r.used_at, r.rotation_request_id, s.user_id, s.refresh_expires_at, s.revoked_at, u.email, u.role, u.status, u.must_change_password FROM mobile_refresh_tokens r JOIN mobile_sessions s ON s.id=r.mobile_session_id JOIN users u ON u.id=s.user_id WHERE r.token_hash=$1 FOR UPDATE OF r,s`, [oldHash]);
    const row = found.rows[0];
    if (!row) { await client.query('ROLLBACK'); throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'رمز التجديد غير صالح أو منتهي.'); }
    const now = new Date();
    if (row.used_at) {
      if (row.rotation_request_id === requestId && row.revoked_at == null && row.status === 'ACTIVE') {
        await client.query('ROLLBACK');
        throw new ApiError(409, 'REFRESH_ALREADY_ROTATED', 'سبق تدوير هذا الرمز. أعد تسجيل الدخول إذا لم تستلم الرمز الجديد.');
      }
      await client.query(`UPDATE mobile_sessions SET revoked_at=$2, revocation_reason='refresh_replay' WHERE id=$1 AND revoked_at IS NULL`, [row.mobile_session_id, now]);
      await client.query('COMMIT');
      await writeAudit({ actorUserId: row.user_id, actorRole: 'PATIENT', action: 'MOBILE_REFRESH_REPLAY', targetType: 'mobile_session', targetId: row.mobile_session_id, ip });
      throw new ApiError(401, 'REFRESH_REPLAY_DETECTED', 'تم إلغاء جلسة الجهاز. سجّل الدخول مجددًا.');
    }
    if (row.revoked_at || row.status !== 'ACTIVE' || row.role !== 'PATIENT' || new Date(row.expires_at) <= now || new Date(row.refresh_expires_at) <= now) {
      await client.query(`UPDATE mobile_sessions SET revoked_at=$2, revocation_reason='refresh_invalid' WHERE id=$1 AND revoked_at IS NULL`, [row.mobile_session_id, now]);
      await client.query('COMMIT');
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'رمز التجديد غير صالح أو منتهي.');
    }
    const next = tokens();
    const accessExpiry = new Date(Math.min(now.getTime() + ACCESS_MS, new Date(row.refresh_expires_at).getTime()));
    await client.query('UPDATE mobile_refresh_tokens SET used_at=$2, rotation_request_id=$3 WHERE token_hash=$1', [oldHash, now, requestId]);
    await client.query('INSERT INTO mobile_refresh_tokens (token_hash,mobile_session_id,generation,expires_at) VALUES ($1,$2,$3,$4)', [sha256Hex(next.refreshToken), row.mobile_session_id, Number(row.generation) + 1, row.refresh_expires_at]);
    await client.query('UPDATE mobile_sessions SET access_token_hash=$2, access_expires_at=$3, last_used_at=$4 WHERE id=$1', [row.mobile_session_id, sha256Hex(next.accessToken), accessExpiry, now]);
    await client.query('COMMIT');
    return { ...tokenResult(next.accessToken, next.refreshToken, accessExpiry, new Date(row.refresh_expires_at)) };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction may already be committed */ }
    throw error;
  } finally { client.release(); }
}

export async function revokeMobileSession(id: string, reason = 'logout') {
  await db.update(mobileSessions).set({ revokedAt: new Date(), revocationReason: reason }).where(and(eq(mobileSessions.id, id), isNull(mobileSessions.revokedAt)));
}

export async function revokeAllMobileSessions(userId: string, reason = 'logout_all') {
  await db.update(mobileSessions).set({ revokedAt: new Date(), revocationReason: reason }).where(and(eq(mobileSessions.userId, userId), isNull(mobileSessions.revokedAt)));
}
