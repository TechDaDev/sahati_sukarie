/**
 * GET  /api/labs — نتائج التحاليل المخبرية المُدخلة يدويًا
 * POST /api/labs — إضافة نتيجة تحليل
 *
 * لا تُضاف أي قيم مرجعية تلقائية ولا يُفسَّر أي تحليل كتشخيص.
 */
import { db } from '@/server/db';
import { labResults } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listLabs } from '@/server/services/records';
import { labResultSchema } from '@/server/validation/schemas';
import { z } from 'zod';

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const url = new URL(request.url);
    const params = querySchema.parse({
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    });
    const rows = await listLabs(full.profile.id, params);
    return ok({
      results: rows.map((r) => ({
        id: r.id,
        testType: r.testType,
        value: Number(r.value),
        valueSecondary: r.valueSecondary ? Number(r.valueSecondary) : null,
        unit: r.unit,
        testDate: r.testDate,
        referenceRange: r.referenceRange,
        notes: r.notes,
        enteredByPatient: r.enteredByPatient,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, labResultSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const [row] = await db.insert(labResults).values({
      patientId: full.profile.id,
      testType: data.testType,
      value: String(data.value),
      valueSecondary: data.valueSecondary != null ? String(data.valueSecondary) : null,
      unit: data.unit,
      testDate: data.testDate,
      referenceRange: data.referenceRange ?? null,
      notes: data.notes ?? null,
      enteredByPatient: true,
    }).returning();

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'LAB_RESULT_CREATED',
      targetType: 'lab_result', targetId: row!.id, metadata: { testType: data.testType }, ip,
    });
    return ok({ id: row!.id });
  } catch (error) {
    return handleError(error);
  }
}
