/** صفحة ملفي الصحي — بيانات الملف، الأمراض المصاحبة، الوزن، التحاليل */
import type { Metadata } from 'next';
import { requirePatientPage } from '@/server/page-guards';
import { getProfileByUserId, getProfileCompletion, getLatestWeight } from '@/server/services/patient';
import { listLabs, listWeight } from '@/server/services/records';
import { formatPhone, maskNationalId } from '@/server/lib/crypto';
import { calculateBmi } from '@/lib/format';
import { ProfileScreen } from './profile-screen';

export const metadata: Metadata = { title: 'ملفي الصحي' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const ctx = await requirePatientPage();
  const full = await getProfileByUserId(ctx.userId);
  if (!full) return null;

  const [completion, weights, labs, latestWeight] = await Promise.all([
    getProfileCompletion(ctx.profileId),
    listWeight(ctx.profileId),
    listLabs(ctx.profileId),
    getLatestWeight(ctx.profileId),
  ]);

  return (
    <ProfileScreen
      data={{
        fullName: full.profile.fullName,
        gender: full.profile.gender,
        dateOfBirth: full.profile.dateOfBirth,
        age: full.age,
        heightCm: Number(full.profile.heightCm),
        nationalIdMasked: maskNationalId(full.profile.nationalIdLast4),
        phoneNumber: formatPhone(full.profile.phoneNumber),
        phoneVerified: full.profile.phoneVerified,
        email: full.user.email,
        preferredGlucoseUnit: full.profile.preferredGlucoseUnit,
        numeralSystem: full.profile.numeralSystem,
        currentWeightKg: latestWeight,
        bmi: latestWeight ? calculateBmi(latestWeight, full.profile.heightCm) : null,
        completion,
        diabetes: full.diabetes
          ? {
              diabetesType: full.diabetes.diabetesType,
              diagnosisDate: full.diabetes.diagnosisDate,
              diagnosisYear: full.diabetes.diagnosisYear,
              monitoringMethod: full.diabetes.monitoringMethod,
              hypoglycemiaHistory: full.diabetes.hypoglycemiaHistory,
              hypoglycemiaAwareness: full.diabetes.hypoglycemiaAwareness,
              treatmentApproach: full.diabetes.treatmentApproach,
              notes: full.diabetes.notes,
            }
          : null,
        conditions: full.conditions.map((c) => ({
          conditionType: c.conditionType, status: c.status, notes: c.notes,
        })),
        reproductive: full.reproductive
          ? {
              pregnancyStatus: full.reproductive.pregnancyStatus,
              gestationalDiabetesHistory: full.reproductive.gestationalDiabetesHistory,
              notes: full.reproductive.notes,
            }
          : null,
        allergies: full.profile.allergies,
        smokingStatus: full.profile.smokingStatus,
        familyHistoryDiabetes: full.profile.familyHistoryDiabetes,
        healthNotes: full.profile.healthNotes,
        weights: weights.map((w) => ({
          id: w.id,
          weightKg: Number(w.weightKg),
          measurementDate: w.measurementDate,
          bmi: calculateBmi(Number(w.weightKg), full.profile.heightCm),
        })),
        labs: labs.map((l) => ({
          id: l.id,
          testType: l.testType,
          value: Number(l.value),
          valueSecondary: l.valueSecondary ? Number(l.valueSecondary) : null,
          unit: l.unit,
          testDate: l.testDate,
          referenceRange: l.referenceRange,
          notes: l.notes,
        })),
      }}
    />
  );
}
