/**
 * GET  /api/factors — العوامل اليومية (مرض، ضغط نفسي، سفر...)
 * POST /api/factors — تسجيل عامل يومي
 */
import { db } from '@/server/db';
import { dailyFactors } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listFactors } from '@/server/services/records';
import { dailyFactorSchema } from '@/server/validation/schemas';
import { localInputToUtc, todayISO } from '@/lib/format';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const url = new URL(request.url);
    const rows = await listFactors(full.profile.id, {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      tz: full.profile.timezone,
    });
    return ok({ factors: rows });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, dailyFactorSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const [row] = await db.insert(dailyFactors).values({
      patientId: full.profile.id,
      factorType: data.factorType,
      description: data.description ?? null,
      recordedAt: localInputToUtc(data.factorDate || todayISO(full.profile.timezone), data.factorTime || '12:00', full.profile.timezone),
    }).returning();
    await writeAudit({ actorUserId: session.user.id, actorRole: 'PATIENT', action: 'DAILY_FACTOR_CREATED', targetType: 'daily_factor', targetId: row!.id, ip });
    return ok({ id: row!.id });
  } catch (error) { return handleError(error); }
}
