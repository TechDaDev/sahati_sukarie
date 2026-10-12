/**
 * GET  /api/profile — الملف الصحي الكامل للمريض الحالي + مؤشر الاكتمال
 * PATCH /api/profile — تحديث المعلومات الأساسية غير الطبية (الطول، وحدة العرض، الأرقام)
 *
 * ملاحظة أمنية: الرقم الوطني لا يمكن تعديله من هنا. أي تغيير في بيانات
 * الهوية يمر عبر عملية تصحيح مضبوطة لدى الإدارة (راجع /settings).
 */
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { patientProfiles } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { formatPhone, maskNationalId } from '@/server/lib/crypto';
import { getProfileByUserId, getProfileCompletion, getLatestWeight } from '@/server/services/patient';
import { profileExtrasSchema } from '@/server/validation/schemas';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const [completion, latestWeight] = await Promise.all([
      getProfileCompletion(full.profile.id),
      getLatestWeight(full.profile.id),
    ]);

    return ok({
      fullName: full.profile.fullName,
      gender: full.profile.gender,
      dateOfBirth: full.profile.dateOfBirth,
      age: full.age,
      heightCm: Number(full.profile.heightCm),
      /** الرقم الوطني يُعرض مقنّعًا فقط (آخر 4 أرقام) */
      nationalIdMasked: maskNationalId(full.profile.nationalIdLast4),
      phoneNumber: formatPhone(full.profile.phoneNumber),
      phoneVerified: full.profile.phoneVerified,
      email: full.user.email,
      emailVerified: false,
      preferredGlucoseUnit: full.profile.preferredGlucoseUnit,
      numeralSystem: full.profile.numeralSystem,
      timezone: full.profile.timezone,
      currentWeightKg: latestWeight,
      bmi: full.bmi,
      diabetes: full.diabetes,
      conditions: full.conditions,
      reproductive: full.reproductive,
      allergies: full.profile.allergies,
      smokingStatus: full.profile.smokingStatus,
      familyHistoryDiabetes: full.profile.familyHistoryDiabetes,
      healthNotes: full.profile.healthNotes,
      completion,
      createdAt: full.profile.createdAt,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, profileExtrasSchema);

    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (data.heightCm !== undefined) update.heightCm = String(data.heightCm);
    if (data.preferredGlucoseUnit !== undefined) update.preferredGlucoseUnit = data.preferredGlucoseUnit;
    if (data.numeralSystem !== undefined) update.numeralSystem = data.numeralSystem;

    await db.update(patientProfiles).set(update).where(eq(patientProfiles.id, full.profile.id));
    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'PROFILE_UPDATED',
      targetType: 'patient_profile', targetId: full.profile.id,
      metadata: { fields: Object.keys(update).filter((k) => k !== 'updatedAt') }, ip,
    });

    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}
