/**
 * خدمة استعادة كلمة المرور (تدفق يدوي بإشراف المدير).
 * ---------------------------------------------------------------------------
 * مبادئ الأمان المطبّقة:
 *  - رمز الاستعادة عشوائي تشفيريًا (8 أرقام) ويُخزَّن كتجزئة SHA-256 فقط.
 *  - صلاحية الرمز 15 دقيقة، ويُستخدم مرة واحدة فقط.
 *  - حد أقصى 5 محاولات تحقق لكل رمز.
 *  - محدّد معدل على طلبات الاستعادة وعلى محاولات إدخال الرمز.
 *  - لا يتم الكشف إطلاقًا عن وجود البريد في النظام من عدمه.
 *  - المدير لا يمكنه رؤية كلمة المرور القديمة ولا تعيين كلمة مرور دائمة يدويًا.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  auditLogs, passwordRecoveryRequests, passwordRecoveryTokens, patientProfiles, users,
} from '../db/schema';
import { ApiError, hashPassword, revokeAllUserSessions, writeAudit } from '../auth/session';
import { randomRecoveryCode, sha256Hex } from '../lib/crypto';

export const RECOVERY_TOKEN_TTL_MINUTES = 15;
export const RECOVERY_MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_EMAIL_PER_DAY = 3;
const MAX_REQUESTS_PER_IP_PER_HOUR = 5;

export const GENERIC_REQUEST_MESSAGE =
  'تم استلام طلبك. إذا كان البريد الإلكتروني مسجّلًا في المنصة، ستتواصل معك الإدارة لاستكمال التحقق من الهوية وتسليم رمز الاستعادة.';

/**
 * إنشاء طلب استعادة (أو إرجاع الطلب المعلّق القائم).
 * الرسالة المُعادة عامة دائمًا لتجنّب كشف وجود البريد.
 */
export async function createRecoveryRequest(email: string, ip: string): Promise<{ generic: true }> {
  const normalized = email.trim().toLowerCase();

  // محدّد معدل لكل بريد ولكل عنوان IP
  const sinceDay = new Date(Date.now() - 86_400_000);
  const sinceHour = new Date(Date.now() - 3_600_000);

  const user = await db.query.users.findFirst({
    where: (u, { sql: s }) => s`lower(${u.email}) = ${normalized}`,
  });

  if (!user || user.role !== 'PATIENT') {
    // لا نكشف الحالة — لكن لا نُنشئ طلبًا وهميًا
    await writeAudit({
      actorRole: 'SYSTEM', action: 'RECOVERY_REQUEST_UNKNOWN_EMAIL',
      targetType: 'user', targetId: null, metadata: { emailDomain: normalized.split('@')[1] ?? null }, ip,
    });
    return { generic: true };
  }

  const recentByEmail = await db.select({ c: sql<number>`count(*)` }).from(passwordRecoveryRequests)
    .where(and(eq(passwordRecoveryRequests.patientUserId, user.id),
      sql`${passwordRecoveryRequests.requestDate} >= ${sinceDay}`));
  if (Number(recentByEmail[0]?.c ?? 0) >= MAX_REQUESTS_PER_EMAIL_PER_DAY) {
    return { generic: true };
  }

  const recentByIp = await db.select({ c: sql<number>`count(*)` }).from(passwordRecoveryRequests)
    .where(sql`${passwordRecoveryRequests.requestIp} = ${ip} AND ${passwordRecoveryRequests.requestDate} >= ${sinceHour}`);
  if (Number(recentByIp[0]?.c ?? 0) >= MAX_REQUESTS_PER_IP_PER_HOUR) {
    return { generic: true };
  }

  // إن وُجد طلب معلّق حديث، لا نُنشئ آخر
  const pending = await db.select().from(passwordRecoveryRequests)
    .where(and(eq(passwordRecoveryRequests.patientUserId, user.id),
      sql`${passwordRecoveryRequests.status} IN ('PENDING','VERIFIED')`))
    .limit(1);
  if (pending[0]) return { generic: true };

  const profile = await db.query.patientProfiles.findFirst({
    where: (p, { eq: e }) => e(p.userId, user.id),
    columns: { id: true },
  });

  const [request] = await db.insert(passwordRecoveryRequests).values({
    patientUserId: user.id,
    patientProfileId: profile?.id ?? null,
    requestIp: ip,
    status: 'PENDING',
  }).returning();

  await writeAudit({
    actorUserId: user.id, actorRole: 'PATIENT', action: 'RECOVERY_REQUEST_CREATED',
    targetType: 'password_recovery_request', targetId: request!.id, ip,
  });

  return { generic: true };
}

/** للوحة المدير: قائمة الطلبات مع الحد الأدنى من بيانات التعريف */
export async function listRecoveryRequests() {
  const rows = await db
    .select({
      id: passwordRecoveryRequests.id,
      status: passwordRecoveryRequests.status,
      requestDate: passwordRecoveryRequests.requestDate,
      verifiedAt: passwordRecoveryRequests.verifiedAt,
      completedAt: passwordRecoveryRequests.completedAt,
      rejectedAt: passwordRecoveryRequests.rejectedAt,
      rejectionReason: passwordRecoveryRequests.rejectionReason,
      userEmail: users.email,
      userStatus: users.status,
      fullName: patientProfiles.fullName,
      phoneNumber: patientProfiles.phoneNumber,
      phoneVerified: patientProfiles.phoneVerified,
      nationalIdLast4: patientProfiles.nationalIdLast4,
    })
    .from(passwordRecoveryRequests)
    .innerJoin(users, eq(users.id, passwordRecoveryRequests.patientUserId))
    .leftJoin(patientProfiles, eq(patientProfiles.userId, users.id))
    .orderBy(desc(passwordRecoveryRequests.requestDate))
    .limit(200);
  return rows;
}

/** سجل تدقيق خاص بطلب معيّن (يُعرض للمدير) */
export async function recoveryRequestAudit(requestId: string) {
  return db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    actorRole: auditLogs.actorRole,
    actorUserId: auditLogs.actorUserId,
    metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt,
  })
    .from(auditLogs)
    .where(and(eq(auditLogs.targetType, 'password_recovery_request'), eq(auditLogs.targetId, requestId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);
}

/**
 * تأكيد التحقق اليدوي من هوية المريض (خطوة إلزامية قبل توليد الرمز).
 */
export async function verifyRequest(adminId: string, requestId: string, note: string | null, ip: string) {
  const request = await getRequest(requestId);
  if (request.status !== 'PENDING') {
    throw new ApiError(409, 'INVALID_STATUS', 'لا يمكن التحقق من هذا الطلب في حالته الحالية.');
  }
  await db.update(passwordRecoveryRequests).set({
    status: 'VERIFIED',
    verifiedBy: adminId,
    verifiedAt: new Date(),
  }).where(eq(passwordRecoveryRequests.id, requestId));

  await writeAudit({
    actorUserId: adminId, actorRole: 'ADMIN', action: 'RECOVERY_REQUEST_VERIFIED',
    targetType: 'password_recovery_request', targetId: requestId,
    metadata: { note: note ?? null }, ip,
  });
}

/**
 * توليد رمز استعادة لمرة واحدة.
 * الرمز الصريح يُعاد مرة واحدة فقط للعرض ولا يُخزَّن ولا يُسجَّل في أي مكان.
 */
export async function generateRecoveryCode(adminId: string, requestId: string, ip: string): Promise<{
  code: string;
  expiresAt: Date;
}> {
  const request = await getRequest(requestId);
  if (request.status !== 'VERIFIED') {
    throw new ApiError(409, 'NOT_VERIFIED',
      'يجب تأكيد التحقق اليدوي من هوية المريض قبل توليد رمز الاستعادة.');
  }

  // إبطال أي رموز سابقة غير مستخدمة لنفس الطلب
  await db.update(passwordRecoveryTokens).set({ usedAt: new Date() })
    .where(and(eq(passwordRecoveryTokens.requestId, requestId), isNull(passwordRecoveryTokens.usedAt)));

  const code = randomRecoveryCode(8);
  const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MINUTES * 60_000);

  await db.insert(passwordRecoveryTokens).values({
    requestId,
    tokenHash: sha256Hex(code),
    expiresAt,
    maxAttempts: RECOVERY_MAX_ATTEMPTS,
    createdByUserId: adminId,
  });

  await writeAudit({
    actorUserId: adminId, actorRole: 'ADMIN', action: 'RECOVERY_CODE_GENERATED',
    targetType: 'password_recovery_request', targetId: requestId,
    metadata: { expiresAt, ttlMinutes: RECOVERY_TOKEN_TTL_MINUTES }, ip,
  });

  return { code, expiresAt };
}

export async function rejectRequest(adminId: string, requestId: string, reason: string | null, ip: string) {
  const request = await getRequest(requestId);
  if (request.status === 'COMPLETED') {
    throw new ApiError(409, 'INVALID_STATUS', 'لا يمكن رفض طلب مكتمل.');
  }
  await db.update(passwordRecoveryRequests).set({
    status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason ?? null,
  }).where(eq(passwordRecoveryRequests.id, requestId));

  await db.update(passwordRecoveryTokens).set({ usedAt: new Date() })
    .where(and(eq(passwordRecoveryTokens.requestId, requestId), isNull(passwordRecoveryTokens.usedAt)));

  await writeAudit({
    actorUserId: adminId, actorRole: 'ADMIN', action: 'RECOVERY_REQUEST_REJECTED',
    targetType: 'password_recovery_request', targetId: requestId, metadata: { reason: reason ?? null }, ip,
  });
}

export async function markCompleted(adminId: string, requestId: string, ip: string) {
  await db.update(passwordRecoveryRequests).set({ status: 'COMPLETED', completedAt: new Date() })
    .where(eq(passwordRecoveryRequests.id, requestId));
  await writeAudit({
    actorUserId: adminId, actorRole: 'ADMIN', action: 'RECOVERY_REQUEST_COMPLETED',
    targetType: 'password_recovery_request', targetId: requestId, ip,
  });
}

async function getRequest(requestId: string) {
  const rows = await db.select().from(passwordRecoveryRequests)
    .where(eq(passwordRecoveryRequests.id, requestId)).limit(1);
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'لم يتم العثور على طلب الاستعادة.');
  return rows[0];
}

/**
 * إتمام الاستعادة: التحقق من الرمز وتعيين كلمة مرور جديدة.
 * - يُلغي الرمز بعد الاستخدام (مرة واحدة فقط).
 * - يُلغي جميع الجلسات القائمة للمستخدم.
 */
export async function redeemRecoveryCode(args: {
  email: string;
  code: string;
  newPassword: string;
  ip: string;
}): Promise<void> {
  const normalized = args.email.trim().toLowerCase();
  const invalidMessage = 'الرمز غير صحيح أو منتهي الصلاحية. يرجى التحقق من الرمز أو طلب رمز جديد.';

  const user = await db.query.users.findFirst({
    where: (u, { sql: s }) => s`lower(${u.email}) = ${normalized}`,
  });
  if (!user) throw new ApiError(400, 'INVALID_CODE', invalidMessage);

  // أحدث رمز غير مستخدم مرتبط بطلب لهذا المستخدم
  const rows = await db.select({ token: passwordRecoveryTokens, request: passwordRecoveryRequests })
    .from(passwordRecoveryTokens)
    .innerJoin(passwordRecoveryRequests, eq(passwordRecoveryRequests.id, passwordRecoveryTokens.requestId))
    .where(and(eq(passwordRecoveryRequests.patientUserId, user.id), isNull(passwordRecoveryTokens.usedAt)))
    .orderBy(desc(passwordRecoveryTokens.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) throw new ApiError(400, 'INVALID_CODE', invalidMessage);

  const token = row.token;

  if (token.attemptCount >= token.maxAttempts) {
    await db.update(passwordRecoveryTokens).set({ usedAt: new Date() }).where(eq(passwordRecoveryTokens.id, token.id));
    await db.update(passwordRecoveryRequests).set({ status: 'EXPIRED' }).where(eq(passwordRecoveryRequests.id, row.request.id));
    throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'تم تجاوز عدد المحاولات المسموح بها لهذا الرمز. يرجى طلب رمز جديد.');
  }

  if (token.expiresAt <= new Date()) {
    await db.update(passwordRecoveryTokens).set({ usedAt: new Date() }).where(eq(passwordRecoveryTokens.id, token.id));
    await db.update(passwordRecoveryRequests).set({ status: 'EXPIRED' }).where(eq(passwordRecoveryRequests.id, row.request.id));
    throw new ApiError(400, 'CODE_EXPIRED', 'انتهت صلاحية الرمز (15 دقيقة). يرجى طلب رمز استعادة جديد.');
  }

  const candidate = sha256Hex(args.code.trim());
  if (candidate !== token.tokenHash) {
    const attempts = token.attemptCount + 1;
    await db.update(passwordRecoveryTokens).set({
      attemptCount: attempts,
      usedAt: attempts >= token.maxAttempts ? new Date() : null,
    }).where(eq(passwordRecoveryTokens.id, token.id));
    await writeAudit({
      actorUserId: user.id, actorRole: 'SYSTEM', action: 'RECOVERY_CODE_FAILED',
      targetType: 'password_recovery_request', targetId: row.request.id,
      metadata: { attempts }, ip: args.ip,
    });
    throw new ApiError(400, 'INVALID_CODE', invalidMessage);
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      passwordHash: await hashPassword(args.newPassword),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));

    // الرمز صالح لمرة واحدة فقط
    await tx.update(passwordRecoveryTokens).set({ usedAt: new Date() }).where(eq(passwordRecoveryTokens.id, token.id));

    await tx.update(passwordRecoveryRequests).set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(passwordRecoveryRequests.id, row.request.id));
  });

  // إلغاء جميع الجلسات القائمة بعد تغيير كلمة المرور
  await revokeAllUserSessions(user.id);

  await writeAudit({
    actorUserId: user.id, actorRole: 'PATIENT', action: 'PASSWORD_RESET_VIA_RECOVERY_CODE',
    targetType: 'password_recovery_request', targetId: row.request.id,
    metadata: { sessionsRevoked: true }, ip: args.ip,
  });
}
