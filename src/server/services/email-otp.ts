import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '../db';
import { auditLogs, emailOtpChallenges, mobileSessions, passwordResetAuthorizations, sessions, users } from '../db/schema';
import { ApiError, assertRateLimit, hashPassword, writeAudit } from '../auth/session';
import { env } from '../env';
import { randomToken, sha256Hex } from '../lib/crypto';

export type EmailOtpPurpose = 'ACCOUNT_ACTIVATION' | 'PASSWORD_RESET';
const OTP_TTL_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const RESET_AUTH_TTL_MS = 10 * 60_000;
const INVALID_CODE = 'الرمز غير صحيح أو منتهي الصلاحية.';

export function isEmailOtpEnabled(): boolean {
  return env().EMAIL_OTP_ENABLED;
}

export function otpDigest(challengeId: string, purpose: EmailOtpPurpose, userId: string, code: string): string {
  const key = createHmac('sha256', env().SESSION_SECRET).update(`email-otp:${challengeId}`).digest();
  return createHmac('sha256', key).update(`${purpose}:${userId}:${code}`).digest('hex');
}

export function buildEmailOtpTemplate(code: string, purpose: EmailOtpPurpose): { subject: string; html: string } {
  const label = purpose === 'ACCOUNT_ACTIVATION' ? 'تفعيل الحساب' : 'إعادة تعيين كلمة المرور';
  return {
    subject: `صحتي وسكري | ${label}`,
    html: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#19352d"><main style="max-width:520px;margin:32px auto;padding:28px;background:#fff;border-radius:16px"><h1 style="font-size:22px">صحتي وسكري</h1><p>استخدم الرمز لإتمام ${label}:</p><p dir="ltr" style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;background:#edf6f1;padding:18px;border-radius:12px">${code}</p><p>تنتهي صلاحية الرمز خلال خمس دقائق. لا تشاركه مع أي شخص.</p><p style="font-size:13px;color:#60746c">إذا لم تطلب هذا الإجراء، فتجاهل هذه الرسالة.</p></main></body></html>`,
  };
}

function safeProviderCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'PROVIDER_ERROR';
  const candidate = 'name' in error ? String(error.name) : 'PROVIDER_ERROR';
  return /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : 'PROVIDER_ERROR';
}

async function deliver(challengeId: string, user: { id: string; email: string }, purpose: EmailOtpPurpose, code: string, ip: string) {
  const config = env();
  if (!config.EMAIL_OTP_ENABLED || !config.RESEND_API_KEY || !config.RESEND_FROM_EMAIL) {
    throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'خدمة البريد غير متاحة حاليًا. حاول لاحقًا.');
  }
  const resend = new Resend(config.RESEND_API_KEY);
  const template = buildEmailOtpTemplate(code, purpose);
  try {
    const { data, error } = await resend.emails.send({
      from: config.RESEND_FROM_EMAIL,
      to: [user.email],
      subject: template.subject,
      html: template.html,
      tags: [{ name: 'purpose', value: purpose.toLowerCase() }],
    });
    if (error) throw error;
    await db.update(emailOtpChallenges).set({ deliveryStatus: 'SENT', providerMessageId: data?.id ?? null })
      .where(eq(emailOtpChallenges.id, challengeId));
    await writeAudit({ actorRole: 'SYSTEM', action: 'EMAIL_OTP_SENT', targetType: 'email_otp_challenge', targetId: challengeId, metadata: { purpose }, ip });
  } catch (error) {
    const errorCode = safeProviderCode(error);
    await db.update(emailOtpChallenges).set({ deliveryStatus: 'FAILED', deliveryErrorCode: errorCode, consumedAt: new Date() })
      .where(eq(emailOtpChallenges.id, challengeId));
    await writeAudit({ actorUserId: user.id, actorRole: 'SYSTEM', action: 'EMAIL_OTP_DELIVERY_FAILED', targetType: 'email_otp_challenge', targetId: challengeId, metadata: { purpose, errorCode }, ip });
    throw new ApiError(503, 'EMAIL_DELIVERY_FAILED', 'تعذر إرسال البريد الآن. حاول لاحقًا.');
  }
}

export async function sendEmailOtp(args: { userId: string; purpose: EmailOtpPurpose; ip: string }): Promise<void> {
  const config = env();
  if (!config.EMAIL_OTP_ENABLED) throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'خدمة البريد غير متاحة حاليًا.');
  const [user] = await db.select({ id: users.id, email: users.email, status: users.status, role: users.role })
    .from(users).where(eq(users.id, args.userId)).limit(1);
  if (!user || user.status !== 'ACTIVE' || (args.purpose === 'PASSWORD_RESET' && user.role !== 'PATIENT')) return;

  const ipHash = createHmac('sha256', config.SESSION_SECRET).update(args.ip).digest('hex');
  const emailKey = createHmac('sha256', config.SESSION_SECRET).update(user.email.toLowerCase()).digest('hex');
  await assertRateLimit({ key: `email-otp-ip:${ipHash}`, limit: 8, windowSeconds: 3600 }, 'طلبات كثيرة. حاول بعد ساعة.');
  await assertRateLimit({ key: `email-otp-account:${user.id}`, limit: 5, windowSeconds: 86400 }, 'طلبات كثيرة. حاول غدًا.');
  await assertRateLimit({ key: `email-otp-email:${emailKey}`, limit: 5, windowSeconds: 86400 }, 'طلبات كثيرة. حاول غدًا.');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  const challenge = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
    const latest = await tx.select({ resendAvailableAt: emailOtpChallenges.resendAvailableAt })
      .from(emailOtpChallenges)
      .where(and(eq(emailOtpChallenges.userId, user.id), eq(emailOtpChallenges.purpose, args.purpose)))
      .orderBy(desc(emailOtpChallenges.createdAt)).limit(1);
    if (latest[0] && latest[0].resendAvailableAt > now) {
      throw new ApiError(429, 'RESEND_COOLDOWN', 'انتظر دقيقة قبل طلب رمز جديد.');
    }
    await tx.update(emailOtpChallenges).set({ consumedAt: now })
      .where(and(eq(emailOtpChallenges.userId, user.id), eq(emailOtpChallenges.purpose, args.purpose), isNull(emailOtpChallenges.consumedAt)));
    const [created] = await tx.insert(emailOtpChallenges).values({
      userId: user.id,
      purpose: args.purpose,
      codeHash: 'pending',
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      ipHash,
    }).returning({ id: emailOtpChallenges.id });
    const codeHash = otpDigest(created!.id, args.purpose, user.id, code);
    await tx.update(emailOtpChallenges).set({ codeHash }).where(eq(emailOtpChallenges.id, created!.id));
    return created!;
  });
  await deliver(challenge.id, user, args.purpose, code, args.ip);
}

export async function requestActivationOtp(email: string, ip: string): Promise<void> {
  const config = env();
  const normalized = email.trim().toLowerCase();
  if (!config.EMAIL_OTP_ENABLED || !config.EMAIL_ACTIVATION_REQUIRED) return;
  const ipHash = createHmac('sha256', config.SESSION_SECRET).update(ip).digest('hex');
  const emailHash = createHmac('sha256', config.SESSION_SECRET).update(normalized).digest('hex');
  await assertRateLimit({ key: `activation-resend-ip:${ipHash}`, limit: 8, windowSeconds: 3600 }, 'طلبات كثيرة. حاول لاحقًا.');
  await assertRateLimit({ key: `activation-resend-email:${emailHash}`, limit: 5, windowSeconds: 86400 }, 'طلبات كثيرة. حاول غدًا.');
  const [user] = await db.select({ id: users.id, emailActivationRequired: users.emailActivationRequired, emailVerifiedAt: users.emailVerifiedAt, status: users.status })
    .from(users).where(sql`lower(${users.email}) = ${normalized}`).limit(1);
  if (!user || !user.emailActivationRequired || user.emailVerifiedAt || user.status !== 'ACTIVE') return;
  await sendEmailOtp({ userId: user.id, purpose: 'ACCOUNT_ACTIVATION', ip });
}

export async function requestPasswordResetOtp(email: string, ip: string): Promise<void> {
  const config = env();
  const normalized = email.trim().toLowerCase();
  const ipHash = createHmac('sha256', config.SESSION_SECRET).update(ip).digest('hex');
  const emailHash = createHmac('sha256', config.SESSION_SECRET).update(normalized).digest('hex');
  await assertRateLimit({ key: `password-reset-ip:${ipHash}`, limit: 10, windowSeconds: 3600 }, 'طلبات كثيرة. حاول لاحقًا.');
  await assertRateLimit({ key: `password-reset-email:${emailHash}`, limit: 5, windowSeconds: 86400 }, 'طلبات كثيرة. حاول غدًا.');
  if (!config.EMAIL_OTP_ENABLED || !config.EMAIL_PASSWORD_RECOVERY_ENABLED) return;
  const user = await db.query.users.findFirst({ where: (u, { sql: s }) => s`lower(${u.email}) = ${normalized}` });
  if (!user || user.role !== 'PATIENT' || user.status !== 'ACTIVE') return;
  await sendEmailOtp({ userId: user.id, purpose: 'PASSWORD_RESET', ip });
}

export async function verifyEmailOtp(args: { email: string; code: string; purpose: EmailOtpPurpose; ip: string }): Promise<{ resetAuthorization?: string }> {
  const config = env();
  if (!config.EMAIL_OTP_ENABLED || (args.purpose === 'PASSWORD_RESET' && !config.EMAIL_PASSWORD_RECOVERY_ENABLED)) {
    throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'خدمة البريد غير متاحة حاليًا.');
  }
  const normalized = args.email.trim().toLowerCase();
  const ipHash = createHmac('sha256', config.SESSION_SECRET).update(args.ip).digest('hex');
  await assertRateLimit({ key: `email-otp-verify-ip:${ipHash}`, limit: 30, windowSeconds: 900 }, 'محاولات كثيرة. حاول لاحقًا.');
  const user = await db.query.users.findFirst({ where: (u, { sql }) => sql`lower(${u.email}) = ${normalized}` });
  if (!user || (args.purpose === 'ACCOUNT_ACTIVATION' && !user.emailActivationRequired)
      || (args.purpose === 'PASSWORD_RESET' && (user.role !== 'PATIENT' || user.status !== 'ACTIVE'))
      || !/^\d{6}$/.test(args.code)) {
    await writeAudit({ actorUserId: user?.id ?? null, actorRole: 'SYSTEM', action: 'EMAIL_OTP_VERIFY_FAILED', targetType: user ? 'user' : null, targetId: user?.id ?? null, metadata: { purpose: args.purpose, reason: 'NO_ELIGIBLE_CHALLENGE' }, ip: args.ip });
    throw new ApiError(400, 'INVALID_CODE', INVALID_CODE);
  }

  const resetAuthorization = args.purpose === 'PASSWORD_RESET' ? randomToken(32) : undefined;
  const result = await db.transaction(async (tx) => {
    const rows = await tx.select().from(emailOtpChallenges)
      .where(and(eq(emailOtpChallenges.userId, user.id), eq(emailOtpChallenges.purpose, args.purpose), isNull(emailOtpChallenges.consumedAt)))
      .orderBy(desc(emailOtpChallenges.createdAt)).limit(1).for('update');
    const challenge = rows[0];
    const now = new Date();
    if (!challenge) return { success: false, reason: 'NO_ACTIVE_CHALLENGE', challengeId: null, attempts: 0 };
    if (challenge.deliveryStatus !== 'SENT') return { success: false, reason: 'NOT_SENT', challengeId: challenge.id, attempts: challenge.attemptCount };
    if (challenge.expiresAt <= now || challenge.attemptCount >= 5) {
      await tx.update(emailOtpChallenges).set({ consumedAt: now }).where(and(eq(emailOtpChallenges.id, challenge.id), isNull(emailOtpChallenges.consumedAt)));
      return { success: false, reason: challenge.expiresAt <= now ? 'EXPIRED' : 'ATTEMPTS_EXHAUSTED', challengeId: challenge.id, attempts: challenge.attemptCount };
    }
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const supplied = Buffer.from(otpDigest(challenge.id, args.purpose, user.id, args.code), 'hex');
    const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);
    if (!valid) {
      await tx.update(emailOtpChallenges).set({ attemptCount: challenge.attemptCount + 1, consumedAt: challenge.attemptCount + 1 >= 5 ? now : null })
        .where(and(eq(emailOtpChallenges.id, challenge.id), isNull(emailOtpChallenges.consumedAt)));
      return { success: false, reason: 'INVALID_CODE', challengeId: challenge.id, attempts: challenge.attemptCount + 1 };
    }
    const [consumed] = await tx.update(emailOtpChallenges).set({ consumedAt: now })
      .where(and(eq(emailOtpChallenges.id, challenge.id), isNull(emailOtpChallenges.consumedAt))).returning({ id: emailOtpChallenges.id });
    if (!consumed) return { success: false, reason: 'REPLAY', challengeId: challenge.id, attempts: challenge.attemptCount };
    if (args.purpose === 'ACCOUNT_ACTIVATION') {
      await tx.update(users).set({ emailVerifiedAt: now, emailActivationExemption: null, updatedAt: now }).where(eq(users.id, user.id));
      await tx.insert(auditLogs).values({ actorUserId: user.id, actorRole: 'PATIENT', action: 'ACCOUNT_ACTIVATED', targetType: 'user', targetId: user.id, metadata: { emailVerified: true } });
    } else {
      await tx.update(passwordResetAuthorizations).set({ consumedAt: now })
        .where(and(eq(passwordResetAuthorizations.userId, user.id), isNull(passwordResetAuthorizations.consumedAt)));
      await tx.insert(passwordResetAuthorizations).values({ userId: user.id, tokenHash: sha256Hex(resetAuthorization!), expiresAt: new Date(now.getTime() + RESET_AUTH_TTL_MS) });
      await tx.insert(auditLogs).values({ actorUserId: user.id, actorRole: 'PATIENT', action: 'PASSWORD_RESET_OTP_VERIFIED', targetType: 'user', targetId: user.id });
    }
    return { success: true as const, reason: 'SUCCESS', challengeId: challenge.id, attempts: challenge.attemptCount };
  });
  if (!result.success) {
    await writeAudit({ actorUserId: user.id, actorRole: 'SYSTEM', action: 'EMAIL_OTP_VERIFY_FAILED', targetType: 'email_otp_challenge', targetId: result.challengeId, metadata: { purpose: args.purpose, reason: result.reason, attempts: result.attempts }, ip: args.ip });
    throw new ApiError(400, 'INVALID_CODE', INVALID_CODE);
  }
  return resetAuthorization ? { resetAuthorization } : {};
}

export async function completePasswordReset(args: { authorization: string; newPassword: string; ip: string }): Promise<void> {
  const tokenHash = sha256Hex(args.authorization);
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const rows = await tx.select().from(passwordResetAuthorizations)
      .where(and(eq(passwordResetAuthorizations.tokenHash, tokenHash), isNull(passwordResetAuthorizations.consumedAt)))
      .limit(1).for('update');
    const authorization = rows[0];
    if (!authorization || authorization.expiresAt <= now) return null;
    const [consumed] = await tx.update(passwordResetAuthorizations).set({ consumedAt: now })
      .where(and(eq(passwordResetAuthorizations.id, authorization.id), isNull(passwordResetAuthorizations.consumedAt)))
      .returning({ userId: passwordResetAuthorizations.userId });
    if (!consumed) return null;
    await tx.update(users).set({ passwordHash: await hashPassword(args.newPassword), passwordChangedAt: now, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, updatedAt: now }).where(eq(users.id, consumed.userId));
    await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, consumed.userId), isNull(sessions.revokedAt)));
    await tx.update(mobileSessions).set({ revokedAt: now, revocationReason: 'password_recovered' }).where(and(eq(mobileSessions.userId, consumed.userId), isNull(mobileSessions.revokedAt)));
    await tx.insert(auditLogs).values({ actorUserId: consumed.userId, actorRole: 'PATIENT', action: 'PASSWORD_RESET_COMPLETED', targetType: 'user', targetId: consumed.userId, metadata: { sessionsRevoked: true }, ipAddress: args.ip });
    return consumed.userId;
  });
  if (!result) throw new ApiError(400, 'RESET_AUTHORIZATION_INVALID', 'صلاحية إعادة التعيين غير صالحة أو منتهية.');
}
