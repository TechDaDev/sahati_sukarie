/**
 * GET  /api/sleep — سجل النوم
 * POST /api/sleep — تسجيل مدة النوم (بالدقائق داخليًا) وجودته
 */
import { db } from '@/server/db';
import { sleepRecords } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listSleep } from '@/server/services/records';
import { sleepSchema } from '@/server/validation/schemas';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const url = new URL(request.url);
    const rows = await listSleep(full.profile.id, {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    });
    return ok({ sleep: rows });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, sleepSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const [row] = await db.insert(sleepRecords).values({
      patientId: full.profile.id,
      durationMinutes: data.durationMinutes,
      quality: data.quality,
      sleepDate: data.sleepDate,
      notes: data.notes ?? null,
    }).returning();
    await writeAudit({ actorUserId: session.user.id, actorRole: 'PATIENT', action: 'SLEEP_CREATED', targetType: 'sleep_record', targetId: row!.id, ip });
    return ok({ id: row!.id });
  } catch (error) { return handleError(error); }
}
