/**
 * GET  /api/symptoms — الأعراض المسجّلة
 * POST /api/symptoms — تسجيل عرض (النوع، الشدة، الوقت)
 * لا تُقدَّم أي محاولة لتشخيص سبب العرض.
 */
import { db } from '@/server/db';
import { symptomRecords } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listSymptoms } from '@/server/services/records';
import { symptomSchema } from '@/server/validation/schemas';
import { localInputToUtc } from '@/lib/format';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const url = new URL(request.url);
    const rows = await listSymptoms(full.profile.id, {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      tz: full.profile.timezone,
    });
    return ok({ symptoms: rows });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, symptomSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const [row] = await db.insert(symptomRecords).values({
      patientId: full.profile.id,
      symptomType: data.symptomType,
      severity: data.severity,
      symptomDatetime: localInputToUtc(data.symptomDate, data.symptomTime, full.profile.timezone),
      notes: data.notes ?? null,
    }).returning();
    await writeAudit({ actorUserId: session.user.id, actorRole: 'PATIENT', action: 'SYMPTOM_CREATED', targetType: 'symptom_record', targetId: row!.id, metadata: { severity: data.severity }, ip });
    return ok({ id: row!.id });
  } catch (error) { return handleError(error); }
}
