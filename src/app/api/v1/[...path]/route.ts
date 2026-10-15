import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { mobileSessions, patientProfiles, sessions, users } from '@/server/db/schema';
import { ApiError, assertRateLimit, clientIp, hashPassword, verifyPassword, withMobileSession, writeAudit } from '@/server/auth/session';
import { blindIndex, encryptField } from '@/server/lib/crypto';
import { handleError, noStore, ok, parseBody } from '@/server/http';
import { changePasswordSchema, loginSchema, registerSchema } from '@/server/validation/schemas';
import { authenticateBearer, loginMobile, refreshMobile, revokeMobileSession } from '@/server/services/mobile-auth';
import { dispatchPatientRoute } from '@/server/mobile/dispatch';
import { getProfileByUserId, getProfileSummary } from '@/server/services/patient';
import { getPatientDashboard } from '@/server/services/dashboard';

type Context = { params: Promise<{ path: string[] }> };
async function run(request: Request, context: Context): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams;
    if (['token', 'access_token', 'refresh_token'].some((key) => query.has(key))) throw new ApiError(400, 'TOKEN_IN_URL', 'لا تُرسل الرموز ضمن عنوان الطلب.');
    const { path } = await context.params;
    if (path[0] === 'config' && path.length === 1 && request.method === 'GET') {
      return ok({ apiVersion: 'v1', supportedGlucoseUnits: ['MG_DL', 'MMOL_L'], supportedLanguages: ['ar-IQ'], defaultTimezone: 'Asia/Baghdad', capabilities: ['patient-profile', 'dashboard', 'glucose', 'medications', 'daily-records', 'reports', 'contact-settings'] }, { headers: noStore });
    }
    if (path[0] === 'auth') return await authRoute(request, path.slice(1));

    const { session } = await authenticateBearer(request);
    const response = await withMobileSession(session, async () => {
      if (path.length === 1 && path[0] === 'dashboard' && request.method === 'GET') {
        const profile = await getProfileByUserId(session.user.id);
        if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'لم يتم العثور على الملف الصحي.');
        const [profileSummary, dashboard] = await Promise.all([
          getProfileSummary(session.user.id),
          getPatientDashboard(profile.profile.id, profile.profile.timezone ?? 'Asia/Baghdad', profile.profile.preferredGlucoseUnit),
        ]);
        return ok({ profile: profileSummary, age: profile.age, bmi: profile.bmi, diabetes: profile.diabetes, conditions: profile.conditions, reproductive: profile.reproductive, dashboard }, { headers: noStore });
      }
      return dispatchPatientRoute(request, path);
    });
    return response;
  } catch (error) { return withNoStore(handleError(error)); }
}

async function authRoute(request: Request, path: string[]): Promise<Response> {
  const endpoint = path.join('/');
  if (endpoint === 'login' && request.method === 'POST') {
    const body = await parseBody(request, loginSchema.extend({ deviceLabel: (await import('zod')).z.string().trim().max(120).optional() }));
    const result = await loginMobile(body.email, body.password, { ip: clientIp(request), userAgent: request.headers.get('user-agent'), deviceLabel: body.deviceLabel });
    return ok(result, { status: 201, headers: noStore });
  }
  if (endpoint === 'register' && request.method === 'POST') {
    await assertRateLimit({ key: `mobile-register:${clientIp(request)}`, limit: 8, windowSeconds: 3600 }, 'تم تجاوز عدد محاولات إنشاء الحساب المسموح بها.');
    const data = await parseBody(request, registerSchema);
    const email = data.email;
    const nationalIdHash = blindIndex(data.nationalId);
    const existing = await db.query.users.findFirst({ where: (u, { sql }) => sql`lower(${u.email}) = ${email}`, columns: { id: true } });
    const existingId = await db.query.patientProfiles.findFirst({ where: (p, { eq }) => eq(p.nationalIdHash, nationalIdHash), columns: { id: true } });
    if (existing || existingId) throw new ApiError(409, 'REGISTRATION_UNAVAILABLE', 'تعذر إنشاء الحساب بهذه البيانات.');
    const passwordHash = await hashPassword(data.password);
    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email, passwordHash, role: 'PATIENT', status: 'ACTIVE' }).returning();
      const [profile] = await tx.insert(patientProfiles).values({ userId: user!.id, fullName: data.fullName, gender: data.gender, dateOfBirth: data.dateOfBirth, heightCm: String(data.heightCm), nationalIdProtected: encryptField(data.nationalId), nationalIdHash, nationalIdLast4: data.nationalId.slice(-4), phoneNumber: data.phone, phoneNorm: data.phone }).returning();
      return { user: user!, profile: profile! };
    });
    await writeAudit({ actorUserId: created.user.id, actorRole: 'PATIENT', action: 'ACCOUNT_REGISTERED', targetType: 'user', targetId: created.user.id, metadata: { emailVerified: false, channel: 'mobile' }, ip: clientIp(request) });
    const tokens = await loginMobile(email, data.password, { ip: clientIp(request), userAgent: request.headers.get('user-agent') });
    return ok({ ...tokens, profileId: created.profile.id, notices: { emailVerified: false, phoneVerified: false } }, { status: 201, headers: noStore });
  }
  if (endpoint === 'refresh' && request.method === 'POST') {
    const z = await import('zod');
    const body = await parseBody(request, z.z.object({ refreshToken: z.z.string().min(20).max(512) }));
    const requestId = request.headers.get('x-refresh-request-id') ?? '';
    if (!z.z.string().uuid().safeParse(requestId).success) throw new ApiError(400, 'REFRESH_REQUEST_ID_REQUIRED', 'أرسل معرّف طلب UUID في ترويسة X-Refresh-Request-ID.');
    return ok(await refreshMobile(body.refreshToken, requestId, clientIp(request)), { headers: noStore });
  }
  if (endpoint === 'forgot-password' && request.method === 'POST') {
    const module = await import('../../forgot-password/route');
    return withNoStore(await module.POST(request));
  }
  if (endpoint === 'redeem-recovery' && request.method === 'POST') {
    const module = await import('../../redeem-recovery/route');
    return withNoStore(await module.POST(request));
  }
  const { session, mobileSessionId } = await authenticateBearer(request);
  if (endpoint === 'me' && request.method === 'GET') return ok({ user: session.user }, { headers: noStore });
  if (endpoint === 'logout' && request.method === 'POST') {
    await revokeMobileSession(mobileSessionId);
    await writeAudit({ actorUserId: session.user.id, actorRole: 'PATIENT', action: 'MOBILE_LOGOUT', targetType: 'mobile_session', targetId: mobileSessionId, ip: clientIp(request) });
    return ok({ loggedOut: true }, { headers: noStore });
  }
  if (endpoint === 'logout-all' && request.method === 'POST') {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(mobileSessions).set({ revokedAt: now, revocationReason: 'logout_all' }).where(and(eq(mobileSessions.userId, session.user.id), isNull(mobileSessions.revokedAt)));
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, session.user.id), isNull(sessions.revokedAt)));
    });
    await writeAudit({ actorUserId: session.user.id, actorRole: 'PATIENT', action: 'MOBILE_LOGOUT_ALL', targetType: 'user', targetId: session.user.id, ip: clientIp(request) });
    return ok({ loggedOut: true }, { headers: noStore });
  }
  if (endpoint === 'change-password' && request.method === 'POST') {
    await assertRateLimit({ key: `mobile-pwchange:${session.user.id}`, limit: 10, windowSeconds: 3600 }, 'تم تجاوز عدد محاولات تغيير كلمة المرور المسموح بها.');
    const body = await parseBody(request, changePasswordSchema);
    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) throw new ApiError(400, 'CURRENT_PASSWORD_INVALID', 'كلمة المرور الحالية غير صحيحة.');
    if (await verifyPassword(body.newPassword, user.passwordHash)) throw new ApiError(400, 'SAME_PASSWORD', 'كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية.');
    const now = new Date();
    const passwordHash = await hashPassword(body.newPassword);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, passwordChangedAt: now, mustChangePassword: false, updatedAt: now }).where(eq(users.id, session.user.id));
      await tx.update(mobileSessions).set({ revokedAt: now, revocationReason: 'password_changed' }).where(and(eq(mobileSessions.userId, session.user.id), isNull(mobileSessions.revokedAt)));
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, session.user.id), isNull(sessions.revokedAt)));
    });
    await writeAudit({ actorUserId: session.user.id, actorRole: 'PATIENT', action: 'PASSWORD_CHANGED', targetType: 'user', targetId: session.user.id, ip: clientIp(request) });
    return ok({ passwordChanged: true, loggedOut: true }, { headers: noStore });
  }
  if (endpoint === 'sessions' && request.method === 'GET') {
    const rows = await db.select({ id: mobileSessions.id, deviceLabel: mobileSessions.deviceLabel, createdAt: mobileSessions.createdAt, lastUsedAt: mobileSessions.lastUsedAt, refreshExpiresAt: mobileSessions.refreshExpiresAt }).from(mobileSessions).where(and(eq(mobileSessions.userId, session.user.id), isNull(mobileSessions.revokedAt))).orderBy(desc(mobileSessions.lastUsedAt));
    return ok({ sessions: rows }, { headers: noStore });
  }
  if (path[0] === 'sessions' && path.length === 2 && request.method === 'DELETE') {
    const id = path[1]!;
    const owned = await db.select({ id: mobileSessions.id }).from(mobileSessions).where(and(eq(mobileSessions.id, id), eq(mobileSessions.userId, session.user.id), isNull(mobileSessions.revokedAt))).limit(1);
    if (!owned.length) throw new ApiError(404, 'NOT_FOUND', 'لم يتم العثور على الجلسة.');
    await revokeMobileSession(id, 'device_revoked');
    return ok({ revoked: true }, { headers: noStore });
  }
  throw new ApiError(404, 'NOT_FOUND', 'المسار المطلوب غير متاح.');
}

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const GET = run;
export const POST = run;
export const PATCH = run;
export const PUT = run;
export const DELETE = run;
