/**
 * GET /api/admin/users — البحث عن حسابات المرضى.
 * ---------------------------------------------------------------------------
 * صلاحيات المدير محدودة: بيانات تعريفية أساسية فقط.
 * لا يُعيد هذا المسار أي بيانات صحية على الإطلاق (لا قياسات، لا أدوية،
 * لا تشخيصات، لا تحاليل). الرقم الوطني يُعرض مقنّعًا بآخر 4 أرقام،
 * والبحث بالرقم الوطني الكامل يتم عبر فهرس التجزئة فقط.
 */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { patientProfiles, users } from '@/server/db/schema';
import { assertRateLimit, clientIp, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';
import { blindIndex, formatPhone, maskNationalId, normalizeIraqiPhone, normalizeNationalId } from '@/server/lib/crypto';
import { adminUserSearchSchema } from '@/server/validation/schemas';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['ADMIN'], csrf: false });
    await assertRateLimit({ key: `adminsearch:${session.user.id}`, limit: 120, windowSeconds: 3600 },
      'تم تجاوز عدد عمليات البحث المسموح بها.');

    const url = new URL(request.url);
    const parsed = adminUserSearchSchema.safeParse({
      q: url.searchParams.get('q') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      page: url.searchParams.get('page') ?? '1',
    });
    if (!parsed.success) return ok({ users: [], total: 0 });
    const { q, status, page } = parsed.data;
    const perPage = 20;

    const conditions = [eq(users.role, 'PATIENT')];
    if (status) conditions.push(eq(users.status, status));

    let nationalIdLookup = false;
    if (q && q.trim().length > 0) {
      const term = q.trim();
      const selectorParam = url.searchParams.get('selector') ?? 'auto';
      const digits = normalizeNationalId(term);
      const looksLikeNationalId = selectorParam === 'national_id'
        || (selectorParam === 'auto' && /^\d{12}$/.test(digits));

      if (looksLikeNationalId) {
        // بحث محمي: يُقارن فهرس HMAC فقط، ولا يُخزَّن الرقم نصًا صريحًا
        nationalIdLookup = true;
        conditions.push(eq(patientProfiles.nationalIdHash, blindIndex(digits)));
      } else {
        const searchConditions = [
          ilike(patientProfiles.fullName, `%${term}%`),
          ilike(users.email, `%${term}%`),
        ];
        const phoneNorm = normalizeIraqiPhone(term);
        if (phoneNorm) searchConditions.push(eq(patientProfiles.phoneNorm, phoneNorm));
        if (selectorParam === 'phone' && !phoneNorm) {
          // رقم غير صالح: أرجِع نتيجة فارغة بدل نتائج عامة مضللة
          return ok({ users: [], total: 0, page, perPage, nationalIdLookup: false });
        }
        conditions.push(or(...searchConditions)!);
      }

      if (nationalIdLookup) {
        // تدقيق عمليات البحث بالرقم الوطني (بدون تخزين الرقم نفسه)
        await writeAudit({
          actorUserId: session.user.id, actorRole: 'ADMIN', action: 'ADMIN_NATIONAL_ID_LOOKUP',
          targetType: 'patient_lookup', targetId: null,
          metadata: { matched: null, method: 'hmac_index' }, ip: clientIp(request),
        });
      }
    }

    const rows = await db.select({
      id: users.id,
      email: users.email,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      fullName: patientProfiles.fullName,
      phoneNumber: patientProfiles.phoneNumber,
      nationalIdLast4: patientProfiles.nationalIdLast4,
      mustChangePassword: users.mustChangePassword,
      emailActivationRequired: users.emailActivationRequired,
      emailVerifiedAt: users.emailVerifiedAt,
    })
      .from(users)
      .leftJoin(patientProfiles, eq(patientProfiles.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const totalRows = await db.select({ c: sql<number>`count(*)` })
      .from(users)
      .leftJoin(patientProfiles, eq(patientProfiles.userId, users.id))
      .where(and(...conditions));

    return ok({
      users: rows.map((r) => ({
        id: r.id,
        fullName: r.fullName ?? '—',
        email: r.email,
        /** الرقم الوطني مقنّع — لا يُعرض كاملًا بعد التسجيل */
        nationalIdMasked: r.nationalIdLast4 ? maskNationalId(r.nationalIdLast4) : '—',
        phoneNumber: r.phoneNumber ? formatPhone(r.phoneNumber) : '—',
        phoneVerified: false,
        status: r.status,
        emailActivationRequired: r.emailActivationRequired,
        emailVerifiedAt: r.emailVerifiedAt,
        createdAt: r.createdAt,
        lastLoginAt: r.lastLoginAt,
      })),
      total: Number(totalRows[0]?.c ?? 0),
      page,
      perPage,
      nationalIdLookup,
    });
  } catch (error) {
    return handleError(error);
  }
}
