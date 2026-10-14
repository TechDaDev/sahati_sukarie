/**
 * POST /api/auth/register — إنشاء حساب مريض جديد.
 * - لا يوجد تفعيل بالبريد: الحساب يُفعّل فورًا.
 * - الرقم الوطني يُخزَّن مشفَّرًا مع فهرس HMAC لمنع التكرار.
 */
import { db } from '@/server/db';
import { patientProfiles, users } from '@/server/db/schema';
import { ApiError, assertRateLimit, clientIp, createSession, hashPassword, setSessionCookie, writeAudit } from '@/server/auth/session';
import { blindIndex, encryptField } from '@/server/lib/crypto';
import { fail, handleError, ok, parseBody } from '@/server/http';
import { registerSchema } from '@/server/validation/schemas';

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    await assertRateLimit(
      { key: `register:${ip}`, limit: 10, windowSeconds: 3600 },
      'تم تجاوز عدد محاولات إنشاء الحساب المسموح بها. حاول لاحقًا.',
    );

    const data = await parseBody(request, registerSchema);
    const email = data.email;
    const nationalIdHash = blindIndex(data.nationalId);

    const existingEmail = await db.query.users.findFirst({
      where: (u, { sql }) => sql`lower(${u.email}) = ${email}`,
      columns: { id: true },
    });
    if (existingEmail) {
      throw new ApiError(409, 'REGISTRATION_UNAVAILABLE', 'تعذر إنشاء الحساب بهذه البيانات. تحقق من البيانات أو تواصل مع الإدارة.');
    }

    const existingId = await db.query.patientProfiles.findFirst({
      where: (p, { eq }) => eq(p.nationalIdHash, nationalIdHash),
      columns: { id: true },
    });
    if (existingId) {
      throw new ApiError(409, 'REGISTRATION_UNAVAILABLE', 'تعذر إنشاء الحساب بهذه البيانات. تحقق من البيانات أو تواصل مع الإدارة.');
    }

    const passwordHash = await hashPassword(data.password);

    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        email,
        passwordHash,
        role: 'PATIENT',
        status: 'ACTIVE',
      }).returning();

      const [profile] = await tx.insert(patientProfiles).values({
        userId: user!.id,
        fullName: data.fullName,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
        heightCm: String(data.heightCm),
        nationalIdProtected: encryptField(data.nationalId),
        nationalIdHash,
        nationalIdLast4: data.nationalId.slice(-4),
        phoneNumber: data.phone, // صيغة دولية موحّدة +9647XXXXXXXXX
        phoneNorm: data.phone,
      }).returning();

      return { user: user!, profile: profile! };
    });

    const session = await createSession(created.user.id, {
      ip,
      userAgent: request.headers.get('user-agent'),
    });
    await setSessionCookie(session.token, session.expiresAt, session.csrfToken);

    await writeAudit({
      actorUserId: created.user.id,
      actorRole: 'PATIENT',
      action: 'ACCOUNT_REGISTERED',
      targetType: 'user',
      targetId: created.user.id,
      metadata: { emailVerified: false },
      ip,
    });

    return ok({
      user: { id: created.user.id, email: created.user.email, role: created.user.role },
      profileId: created.profile.id,
      csrfToken: session.csrfToken,
      /** تنبيه واضح: لا يوجد تحقق إلكتروني للبريد أو الهاتف في هذه النسخة */
      notices: {
        emailVerified: false,
        phoneVerified: false,
        message: 'تم إنشاء الحساب وتفعيله مباشرة. لم يتم التحقق الإلكتروني من البريد الإلكتروني أو رقم الهاتف في هذه النسخة.',
      },
    });
  } catch (error) {
    const databaseError = error instanceof Error ? error as Error & { cause?: { code?: string; message?: string } } : null;
    if (databaseError && (databaseError.cause?.code === '23505'
      || /duplicate key|unique constraint/i.test(`${databaseError.message} ${databaseError.cause?.message ?? ''}`))) {
      return fail(409, 'تعذر إنشاء الحساب بهذه البيانات. تحقق من البيانات أو تواصل مع الإدارة.', 'REGISTRATION_UNAVAILABLE');
    }
    return handleError(error);
  }
}
