/**
 * GET/PUT /api/profile/diabetes — معلومات السكري (المجموعة أ).
 * لا يتم استنتاج نوع السكري تلقائيًا؛ الحقل يُسجَّل كما يذكره المستخدم فقط.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { diabetesProfiles } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { diabetesProfileSchema } from '@/server/validation/schemas';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    return ok({ diabetes: full.diabetes });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, diabetesProfileSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    await db.insert(diabetesProfiles).values({
      patientId: full.profile.id,
      diabetesType: data.diabetesType ?? 'UNKNOWN',
      diagnosisDate: data.diagnosisDate ?? null,
      diagnosisYear: data.diagnosisYear ?? null,
      monitoringMethod: data.monitoringMethod ?? 'NOT_SPECIFIED',
      hypoglycemiaHistory: data.hypoglycemiaHistory ?? 'UNSURE',
      hypoglycemiaAwareness: data.hypoglycemiaAwareness ?? 'NOT_SPECIFIED',
      treatmentApproach: data.treatmentApproach ?? 'NOT_SPECIFIED',
      notes: data.notes ?? null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: diabetesProfiles.patientId,
      set: {
        diabetesType: data.diabetesType ?? 'UNKNOWN',
        diagnosisDate: data.diagnosisDate ?? null,
        diagnosisYear: data.diagnosisYear ?? null,
        monitoringMethod: data.monitoringMethod ?? 'NOT_SPECIFIED',
        hypoglycemiaHistory: data.hypoglycemiaHistory ?? 'UNSURE',
        hypoglycemiaAwareness: data.hypoglycemiaAwareness ?? 'NOT_SPECIFIED',
        treatmentApproach: data.treatmentApproach ?? 'NOT_SPECIFIED',
        notes: data.notes ?? null,
        updatedAt: new Date(),
      },
    });

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'DIABETES_PROFILE_UPDATED',
      targetType: 'diabetes_profile', targetId: full.profile.id, ip,
    });
    return ok({ saved: true });
  } catch (error) {
    return handleError(error);
  }
}
