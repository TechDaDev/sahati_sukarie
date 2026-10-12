/**
 * خدمات المريض: قراءة/إنشاء الملف الصحي، حساب درجة اكتمال الملف، ومعايير BMI.
 * كل دالة هنا تعمل على بيانات المريض الحالي فقط (patientProfileId).
 */
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  activityRecords, diabetesProfiles, glucoseReadings, labResults, mealRecords,
  medications, patientConditions, patientProfiles, reproductiveHistory, sleepRecords,
  symptomRecords, weightRecords, users,
} from '../db/schema';
import { calculateAge, calculateBmi } from '../../lib/format';

export type FullProfile = {
  profile: typeof patientProfiles.$inferSelect;
  diabetes: typeof diabetesProfiles.$inferSelect | null;
  conditions: (typeof patientConditions.$inferSelect)[];
  reproductive: typeof reproductiveHistory.$inferSelect | null;
  user: { email: string; createdAt: Date };
  age: number;
  bmi: number | null;
};

export async function getProfileByUserId(userId: string): Promise<FullProfile | null> {
  const rows = await db
    .select({ profile: patientProfiles, user: users })
    .from(patientProfiles)
    .innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(eq(patientProfiles.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [diabetes] = await db.select().from(diabetesProfiles).where(eq(diabetesProfiles.patientId, row.profile.id)).limit(1);
  const conditions = await db.select().from(patientConditions).where(eq(patientConditions.patientId, row.profile.id));
  const [reproductive] = await db.select().from(reproductiveHistory).where(eq(reproductiveHistory.patientId, row.profile.id)).limit(1);

  const latestWeight = await getLatestWeight(row.profile.id);
  const bmi = latestWeight ? calculateBmi(latestWeight, row.profile.heightCm) : null;

  return {
    profile: row.profile,
    diabetes: diabetes ?? null,
    conditions,
    reproductive: reproductive ?? null,
    user: { email: row.user.email, createdAt: row.user.createdAt },
    age: calculateAge(row.profile.dateOfBirth),
    bmi,
  };
}

/** ملف المريض المختصر (يُستخدم في الواجهة والتنقل) */
export async function getProfileSummary(userId: string) {
  const rows = await db
    .select({
      id: patientProfiles.id,
      fullName: patientProfiles.fullName,
      gender: patientProfiles.gender,
      dateOfBirth: patientProfiles.dateOfBirth,
      heightCm: patientProfiles.heightCm,
      phoneNumber: patientProfiles.phoneNumber,
      preferredGlucoseUnit: patientProfiles.preferredGlucoseUnit,
      numeralSystem: patientProfiles.numeralSystem,
      timezone: patientProfiles.timezone,
      npLast4: patientProfiles.nationalIdLast4,
      onboardingCompletedAt: patientProfiles.onboardingCompletedAt,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(patientProfiles)
    .innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(eq(patientProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** أحدث وزن مسجّل (الوزن الحالي في الملف الطبي) */
export async function getLatestWeight(patientId: string): Promise<number | null> {
  const rows = await db
    .select({ weightKg: weightRecords.weightKg })
    .from(weightRecords)
    .where(eq(weightRecords.patientId, patientId))
    .orderBy(desc(weightRecords.measurementDate), desc(weightRecords.createdAt))
    .limit(1);
  return rows[0] ? Number(rows[0].weightKg) : null;
}

export async function getLatestGlucose(patientId: string) {
  const rows = await db
    .select()
    .from(glucoseReadings)
    .where(eq(glucoseReadings.patientId, patientId))
    .orderBy(desc(glucoseReadings.measurementDatetime))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * نسبة اكتمال الملف الصحي — معلوماتي فقط ولا يمنع تسجيل القياسات.
 */
export async function getProfileCompletion(patientId: string): Promise<{
  percent: number;
  missing: string[];
}> {
  const missing: string[] = [];
  let score = 0;
  const total = 10;

  const rows = await db.select({
    height: patientProfiles.heightCm,
    allergies: patientProfiles.allergies,
    smoking: patientProfiles.smokingStatus,
    family: patientProfiles.familyHistoryDiabetes,
    notes: patientProfiles.healthNotes,
  }).from(patientProfiles).where(eq(patientProfiles.id, patientId)).limit(1);
  const p = rows[0];

  if (p?.height) score += 1; else missing.push('الطول');

  const [diabetes] = await db.select().from(diabetesProfiles).where(eq(diabetesProfiles.patientId, patientId)).limit(1);
  if (diabetes?.diabetesType && diabetes.diabetesType !== 'UNKNOWN') score += 1; else missing.push('نوع السكري');
  if (diabetes?.diagnosisDate || diabetes?.diagnosisYear) score += 1; else missing.push('سنة التشخيص');
  if (diabetes?.monitoringMethod && diabetes.monitoringMethod !== 'NOT_SPECIFIED') score += 1; else missing.push('طريقة مراقبة السكر');
  if (diabetes?.treatmentApproach && diabetes.treatmentApproach !== 'NOT_SPECIFIED') score += 1; else missing.push('أسلوب العلاج');

  const conditions = await db.select({ c: sql<number>`count(*)` }).from(patientConditions).where(eq(patientConditions.patientId, patientId));
  if (Number(conditions[0]?.c ?? 0) > 0) score += 1; else missing.push('الأمراض المصاحبة');

  const meds = await db.select({ c: sql<number>`count(*)` }).from(medications)
    .where(and(eq(medications.patientId, patientId), eq(medications.status, 'ACTIVE')));
  if (Number(meds[0]?.c ?? 0) > 0) score += 1; else missing.push('الأدوية الحالية');

  const weights = await db.select({ c: sql<number>`count(*)` }).from(weightRecords).where(eq(weightRecords.patientId, patientId));
  if (Number(weights[0]?.c ?? 0) > 0) score += 1; else missing.push('قياس الوزن');

  const labs = await db.select({ c: sql<number>`count(*)` }).from(labResults).where(eq(labResults.patientId, patientId));
  if (Number(labs[0]?.c ?? 0) > 0) score += 1; else missing.push('نتائج التحاليل');

  if (p?.smoking && p.smoking !== 'NOT_SPECIFIED') score += 1; else missing.push('حالة التدخين');

  return { percent: Math.round((score / total) * 100), missing };
}

/** ملخص يوم كامل — يُستخدم في لوحة المتابعة */
export async function getDaySummary(patientId: string, startUtc: Date, endUtc: Date) {
  const [glucose, meals, activities, sleep, symptoms, administrations] = await Promise.all([
    db.select().from(glucoseReadings)
      .where(and(eq(glucoseReadings.patientId, patientId), sql`${glucoseReadings.measurementDatetime} >= ${startUtc}`, sql`${glucoseReadings.measurementDatetime} < ${endUtc}`))
      .orderBy(desc(glucoseReadings.measurementDatetime)),
    db.select().from(mealRecords)
      .where(and(eq(mealRecords.patientId, patientId), sql`${mealRecords.mealDatetime} >= ${startUtc}`, sql`${mealRecords.mealDatetime} < ${endUtc}`)),
    db.select().from(activityRecords)
      .where(and(eq(activityRecords.patientId, patientId), sql`${activityRecords.activityDatetime} >= ${startUtc}`, sql`${activityRecords.activityDatetime} < ${endUtc}`)),
    db.select().from(sleepRecords)
      .where(and(
        eq(sleepRecords.patientId, patientId),
        gte(sleepRecords.sleepDate, startUtc.toISOString().slice(0, 10)),
        lte(sleepRecords.sleepDate, endUtc.toISOString().slice(0, 10)),
      )),
    db.select().from(symptomRecords)
      .where(and(eq(symptomRecords.patientId, patientId), sql`${symptomRecords.symptomDatetime} >= ${startUtc}`, sql`${symptomRecords.symptomDatetime} < ${endUtc}`)),
    db.select().from(medications)
      .where(and(eq(medications.patientId, patientId), eq(medications.status, 'ACTIVE'))),
  ]);

  return { glucose, meals, activities, sleep, symptoms, activeMedications: administrations };
}
