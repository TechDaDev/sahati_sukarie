/**
 * GET  /api/administrations — سجل الجرعات الفعلية (تاريخي، مستقل عن الخطة)
 * POST /api/administrations — تسجيل جرعة فعلية (تم تناوله / فائت / مؤجّل)
 *
 * الهدف: منع الخلط بين "الجرعة الموصوفة" و"الجرعة التي تناولها المريض فعلًا".
 */
import { db } from '@/server/db';
import { medicationAdministrations } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { getMedication, listAdministrations } from '@/server/services/records';
import { administrationSchema } from '@/server/validation/schemas';
import { localInputToUtc } from '@/lib/format';
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
    const rows = await listAdministrations(full.profile.id, { ...params, tz: full.profile.timezone });
    return ok({
      administrations: rows.map((r) => ({
        id: r.administration.id,
        medicationId: r.administration.medicationId,
        medicationName: r.medication.medicationName,
        medicationCategory: r.medication.category,
        actualDose: r.administration.actualDose ? Number(r.administration.actualDose) : null,
        doseUnit: r.administration.doseUnit,
        administrationDatetime: r.administration.administrationDatetime,
        status: r.administration.status,
        notes: r.administration.notes,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, administrationSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    // التحقق من أن الدواء يخص هذا المريض
    const medication = await getMedication(full.profile.id, data.medicationId);

    const [row] = await db.insert(medicationAdministrations).values({
      patientId: full.profile.id,
      medicationId: medication.id,
      actualDose: data.actualDose != null ? String(data.actualDose) : null,
      doseUnit: data.doseUnit ?? medication.doseUnit ?? null,
      administrationDatetime: localInputToUtc(data.administrationDate, data.administrationTime, full.profile.timezone),
      status: data.status,
      notes: data.notes ?? null,
    }).returning();

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'MEDICATION_ADMINISTRATION_CREATED',
      targetType: 'medication_administration', targetId: row!.id,
      metadata: { medicationId: medication.id, status: data.status }, ip,
    });
    return ok({ id: row!.id });
  } catch (error) {
    return handleError(error);
  }
}
