/**
 * PUT /api/profile/additional — معلومات إضافية (المجموعة د):
 * الحساسية الدوائية، التدخين، التاريخ العائلي، ملاحظات صحية.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { patientProfiles } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { additionalInfoSchema } from '@/server/validation/schemas';

export async function PUT(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, additionalInfoSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    await db.update(patientProfiles).set({
      allergies: data.allergies ?? null,
      smokingStatus: data.smokingStatus ?? full.profile.smokingStatus,
      familyHistoryDiabetes: data.familyHistoryDiabetes ?? full.profile.familyHistoryDiabetes,
      healthNotes: data.healthNotes ?? null,
      updatedAt: new Date(),
    }).where(eq(patientProfiles.id, full.profile.id));

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'ADDITIONAL_INFO_UPDATED',
      targetType: 'patient_profile', targetId: full.profile.id, ip,
    });
    return ok({ saved: true });
  } catch (error) {
    return handleError(error);
  }
}
