/**
 * GET  /api/activities — سجل النشاط البدني
 * POST /api/activities — تسجيل نشاط (النوع، المدة، الشدة)
 */
import { db } from '@/server/db';
import { activityRecords } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listActivities } from '@/server/services/records';
import { activitySchema } from '@/server/validation/schemas';
import { localInputToUtc } from '@/lib/format';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const url = new URL(request.url);
    const rows = await listActivities(full.profile.id, {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      tz: full.profile.timezone,
    });
    return ok({
      activities: rows,
      totalMinutes: rows.reduce((sum, r) => sum + r.durationMinutes, 0),
    });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, activitySchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const [row] = await db.insert(activityRecords).values({
      patientId: full.profile.id,
      activityType: data.activityType,
      durationMinutes: data.durationMinutes,
      intensity: data.intensity,
      activityDatetime: localInputToUtc(data.activityDate, data.activityTime, full.profile.timezone),
      notes: data.notes ?? null,
    }).returning();
    await writeAudit({ actorUserId: session.user.id, actorRole: 'PATIENT', action: 'ACTIVITY_CREATED', targetType: 'activity_record', targetId: row!.id, ip });
    return ok({ id: row!.id });
  } catch (error) { return handleError(error); }
}
