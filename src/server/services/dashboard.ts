import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { activityRecords, glucoseReadings, labResults, mealRecords, sleepRecords, symptomRecords, weightRecords } from '../db/schema';
import { localInputToUtc } from '../../lib/format';
import { getProfileCompletion, getLatestGlucose } from './patient';
import { latestAdministration, listAdministrations, listMedications } from './records';

/** Dashboard data shared by the website and the versioned mobile API. */
export async function getPatientDashboard(patientId: string, timezone: string, preferredUnit: 'MG_DL' | 'MMOL_L') {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const dayFrom = localInputToUtc(today, '00:00', timezone);
  const dayTo = new Date(dayFrom.getTime() + 86_400_000);
  const trendFrom = new Date(dayTo.getTime() - 14 * 86_400_000);
  const [latestGlucose, todayGlucoseCount, lastAdministration, todayActivities, todayMeals, lastSleep, todaySymptoms, recentGlucose, latestWeight, latestHba1c, completion, activeMedications, recentAdministrations, recentMeals] = await Promise.all([
    getLatestGlucose(patientId),
    db.select({ c: sql<number>`count(*)` }).from(glucoseReadings).where(and(eq(glucoseReadings.patientId, patientId), gte(glucoseReadings.measurementDatetime, dayFrom), lt(glucoseReadings.measurementDatetime, dayTo))),
    latestAdministration(patientId),
    db.select().from(activityRecords).where(and(eq(activityRecords.patientId, patientId), gte(activityRecords.activityDatetime, dayFrom), lt(activityRecords.activityDatetime, dayTo))).orderBy(desc(activityRecords.activityDatetime), desc(activityRecords.id)),
    db.select({ c: sql<number>`count(*)` }).from(mealRecords).where(and(eq(mealRecords.patientId, patientId), gte(mealRecords.mealDatetime, dayFrom), lt(mealRecords.mealDatetime, dayTo))),
    db.select().from(sleepRecords).where(and(eq(sleepRecords.patientId, patientId), gte(sleepRecords.sleepDate, new Date(dayTo.getTime() - 3 * 86_400_000).toISOString().slice(0, 10)))).orderBy(desc(sleepRecords.sleepDate), desc(sleepRecords.id)).limit(1),
    db.select().from(symptomRecords).where(and(eq(symptomRecords.patientId, patientId), gte(symptomRecords.symptomDatetime, dayFrom), lt(symptomRecords.symptomDatetime, dayTo))).orderBy(desc(symptomRecords.symptomDatetime), desc(symptomRecords.id)),
    db.select().from(glucoseReadings).where(and(eq(glucoseReadings.patientId, patientId), gte(glucoseReadings.measurementDatetime, trendFrom))).orderBy(glucoseReadings.measurementDatetime, glucoseReadings.id),
    db.select().from(weightRecords).where(eq(weightRecords.patientId, patientId)).orderBy(desc(weightRecords.measurementDate), desc(weightRecords.createdAt), desc(weightRecords.id)).limit(1),
    db.select().from(labResults).where(and(eq(labResults.patientId, patientId), eq(labResults.testType, 'HBA1C'))).orderBy(desc(labResults.testDate), desc(labResults.createdAt), desc(labResults.id)).limit(1),
    getProfileCompletion(patientId),
    listMedications(patientId, 'ACTIVE'),
    listAdministrations(patientId, { from: trendFrom.toISOString().slice(0, 10), tz: timezone }),
    db.select().from(mealRecords).where(and(eq(mealRecords.patientId, patientId), gte(mealRecords.mealDatetime, trendFrom))).orderBy(desc(mealRecords.mealDatetime), desc(mealRecords.id)).limit(5),
  ]);
  const unitFactor = preferredUnit === 'MG_DL' ? 1 : 18.0182;
  const trendData = recentGlucose.map((r) => ({ at: r.measurementDatetime.toISOString(), value: Number(r.standardizedValueMgdl) / unitFactor }));
  return {
    latestGlucose,
    todayReadings: Number(todayGlucoseCount[0]?.c ?? 0),
    lastAdministration,
    todayActivities,
    mealsToday: Number(todayMeals[0]?.c ?? 0),
    lastSleep,
    todaySymptoms,
    recentGlucose,
    latestWeight,
    latestHba1c,
    completion,
    activeMedications,
    recentAdministrations,
    recentMeals,
    activityMinutes: todayActivities.reduce((sum, row) => sum + row.durationMinutes, 0),
    trendData,
    generatedAt: new Date().toISOString(),
  };
}
