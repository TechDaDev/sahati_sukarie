/**
 * GET  /api/medications — خطة الأدوية الموصوفة (المسجّلة من المريض)
 * POST /api/medications — إضافة دواء إلى الخطة
 *
 * تنبيه: هذه الخطة منفصلة تمامًا عن سجل الجرعات الفعلية في /api/administrations.
 * لا تُقترح الجرعات تلقائيًا؛ الحقول تُسجَّل كما ذكرها المستخدم.
 */
import { db } from '@/server/db';
import { medications } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listMedications } from '@/server/services/records';
import { medicationSchema } from '@/server/validation/schemas';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const status = new URL(request.url).searchParams.get('status');
    const list = await listMedications(
      full.profile.id,
      status === 'ACTIVE' || status === 'INACTIVE' ? status : undefined,
    );
    return ok({ medications: list });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, medicationSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const [row] = await db.insert(medications).values({
      patientId: full.profile.id,
      medicationName: data.medicationName,
      category: data.category,
      strength: data.strength != null ? String(data.strength) : null,
      strengthUnit: data.strengthUnit ?? null,
      prescribedDose: data.prescribedDose != null ? String(data.prescribedDose) : null,
      doseUnit: data.doseUnit ?? null,
      route: data.route,
      frequency: data.frequency,
      usualTime: data.usualTime ? `${data.usualTime}:00` : null,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      prescriberName: data.prescriberName ?? null,
      insulinFormulation: data.insulinFormulation ?? null,
      notes: data.notes ?? null,
      status: data.status ?? 'ACTIVE',
    }).returning();

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'MEDICATION_CREATED',
      targetType: 'medication', targetId: row!.id, metadata: { category: data.category }, ip,
    });
    return ok({ id: row!.id });
  } catch (error) {
    return handleError(error);
  }
}
