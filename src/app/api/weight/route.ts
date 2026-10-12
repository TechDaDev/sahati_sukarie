/**
 * GET  /api/weight — سجل قياسات الوزن (تاريخي كامل، لا يُستبدل)
 * POST /api/weight — إضافة قياس وزن
 */
import { db } from '@/server/db';
import { weightRecords } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId, getLatestWeight } from '@/server/services/patient';
import { listWeight } from '@/server/services/records';
import { weightRecordSchema } from '@/server/validation/schemas';
import { calculateBmi } from '@/lib/format';
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
    const rows = await listWeight(full.profile.id, params);
    return ok({
      heightCm: Number(full.profile.heightCm),
      records: rows.map((r) => ({
        id: r.id,
        weightKg: Number(r.weightKg),
        measurementDate: r.measurementDate,
        notes: r.notes,
        bmi: calculateBmi(Number(r.weightKg), full.profile.heightCm),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, weightRecordSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const [row] = await db.insert(weightRecords).values({
      patientId: full.profile.id,
      weightKg: String(data.weightKg),
      measurementDate: data.measurementDate,
      notes: data.notes ?? null,
    }).returning();

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'WEIGHT_CREATED',
      targetType: 'weight_record', targetId: row!.id, ip,
    });
    const bmi = calculateBmi(data.weightKg, full.profile.heightCm);
    return ok({ id: row!.id, bmi, currentWeightKg: await getLatestWeight(full.profile.id) });
  } catch (error) {
    return handleError(error);
  }
}
