/**
 * خدمات سجلات المريض (يوميات، وزن، تحاليل، أدوية، قياسات).
 * ---------------------------------------------------------------------------
 * كل الاستعلامات مفلترة بـ patientId المستخرج من الجلسة على الخادم،
 * لذلك لا يمكن لمريض الوصول إلى بيانات مريض آخر.
 */
import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db';
import {
  activityRecords, dailyFactors, glucoseReadings, labResults, mealRecords,
  medicationAdministrations, medications, patientConditions, sleepRecords,
  symptomRecords, weightRecords,
} from '../db/schema';
import { ApiError } from '../auth/session';
import { localInputToUtc, DEFAULT_TZ } from '../../lib/format';

export type RangeFilter = { from?: string; to?: string; tz?: string };

function dateRange(list: SQL | undefined, column: SQL | unknown, range: RangeFilter): SQL | undefined {
  const tz = range.tz ?? DEFAULT_TZ;
  const conditions: SQL[] = [];
  if (list) conditions.push(list);
  if (range.from) conditions.push(sql`${column} >= ${localInputToUtc(range.from, '00:00', tz)}`);
  if (range.to) {
    const end = new Date(localInputToUtc(range.to, '00:00', tz).getTime() + 86_400_000);
    conditions.push(sql`${column} < ${end}`);
  }
  if (!conditions.length) return undefined;
  return and(...conditions) as SQL;
}

/* ------------------------------------------------------------------ قياسات السكر */

export async function listGlucose(patientId: string, range: RangeFilter = {}) {
  const where = dateRange(eq(glucoseReadings.patientId, patientId), glucoseReadings.measurementDatetime, range);
  return db.select().from(glucoseReadings).where(where).orderBy(desc(glucoseReadings.measurementDatetime));
}

export async function getGlucose(patientId: string, id: string) {
  const rows = await db.select().from(glucoseReadings)
    .where(and(eq(glucoseReadings.patientId, patientId), eq(glucoseReadings.id, id))).limit(1);
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'لم يتم العثور على القياس المطلوب.');
  return rows[0];
}

/* ---------------------------------------------------------------- الوزن */

export async function listWeight(patientId: string, range: RangeFilter = {}) {
  const tz = range.tz ?? DEFAULT_TZ;
  const conditions = [eq(weightRecords.patientId, patientId)];
  if (range.from) conditions.push(sql`${weightRecords.measurementDate} >= ${range.from}::date`);
  if (range.to) conditions.push(sql`${weightRecords.measurementDate} <= ${range.to}::date`);
  void tz;
  return db.select().from(weightRecords).where(and(...conditions))
    .orderBy(desc(weightRecords.measurementDate), desc(weightRecords.createdAt));
}

/* -------------------------------------------------------------- التحاليل */

export async function listLabs(patientId: string, range: RangeFilter = {}) {
  const conditions = [eq(labResults.patientId, patientId)];
  if (range.from) conditions.push(sql`${labResults.testDate} >= ${range.from}::date`);
  if (range.to) conditions.push(sql`${labResults.testDate} <= ${range.to}::date`);
  return db.select().from(labResults).where(and(...conditions))
    .orderBy(desc(labResults.testDate), desc(labResults.createdAt));
}

/* ---------------------------------------------------------------- الأدوية */

export async function listMedications(patientId: string, status?: 'ACTIVE' | 'INACTIVE') {
  const conditions = [eq(medications.patientId, patientId)];
  if (status) conditions.push(eq(medications.status, status));
  return db.select().from(medications).where(and(...conditions)).orderBy(desc(medications.createdAt));
}

export async function getMedication(patientId: string, id: string) {
  const rows = await db.select().from(medications)
    .where(and(eq(medications.patientId, patientId), eq(medications.id, id))).limit(1);
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'لم يتم العثور على الدواء المطلوب.');
  return rows[0];
}

export async function listAdministrations(patientId: string, range: RangeFilter = {}) {
  const where = dateRange(eq(medicationAdministrations.patientId, patientId), medicationAdministrations.administrationDatetime, range);
  return db.select({
    administration: medicationAdministrations,
    medication: medications,
  })
    .from(medicationAdministrations)
    .innerJoin(medications, eq(medications.id, medicationAdministrations.medicationId))
    .where(where)
    .orderBy(desc(medicationAdministrations.administrationDatetime));
}

export async function latestAdministration(patientId: string) {
  const rows = await db.select({
    administration: medicationAdministrations,
    medication: medications,
  })
    .from(medicationAdministrations)
    .innerJoin(medications, eq(medications.id, medicationAdministrations.medicationId))
    .where(eq(medicationAdministrations.patientId, patientId))
    .orderBy(desc(medicationAdministrations.administrationDatetime))
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------ اليوميات (سجلات عامة) */

export type JournalKind = 'meals' | 'activities' | 'sleep' | 'symptoms' | 'factors';

type JournalDef = {
  table: PgTable;
  /** العمود الزمني المستخدم للترتيب والفلترة */
  ordering: string;
  label: string;
};

export const JOURNAL_DEFS: Record<JournalKind, JournalDef> = {
  meals: { table: mealRecords, ordering: 'mealDatetime', label: 'الوجبات' },
  activities: { table: activityRecords, ordering: 'activityDatetime', label: 'الأنشطة' },
  sleep: { table: sleepRecords, ordering: 'sleepDate', label: 'النوم' },
  symptoms: { table: symptomRecords, ordering: 'symptomDatetime', label: 'الأعراض' },
  factors: { table: dailyFactors, ordering: 'recordedAt', label: 'العوامل اليومية' },
};

export async function listMeals(patientId: string, range: RangeFilter = {}) {
  const where = dateRange(eq(mealRecords.patientId, patientId), mealRecords.mealDatetime, range);
  return db.select().from(mealRecords).where(where).orderBy(desc(mealRecords.mealDatetime));
}

export async function listActivities(patientId: string, range: RangeFilter = {}) {
  const where = dateRange(eq(activityRecords.patientId, patientId), activityRecords.activityDatetime, range);
  return db.select().from(activityRecords).where(where).orderBy(desc(activityRecords.activityDatetime));
}

export async function listSleep(patientId: string, range: RangeFilter = {}) {
  const conditions = [eq(sleepRecords.patientId, patientId)];
  if (range.from) conditions.push(sql`${sleepRecords.sleepDate} >= ${range.from}::date`);
  if (range.to) conditions.push(sql`${sleepRecords.sleepDate} <= ${range.to}::date`);
  return db.select().from(sleepRecords).where(and(...conditions)).orderBy(desc(sleepRecords.sleepDate));
}

export async function listSymptoms(patientId: string, range: RangeFilter = {}) {
  const where = dateRange(eq(symptomRecords.patientId, patientId), symptomRecords.symptomDatetime, range);
  return db.select().from(symptomRecords).where(where).orderBy(desc(symptomRecords.symptomDatetime));
}

export async function listFactors(patientId: string, range: RangeFilter = {}) {
  const where = dateRange(eq(dailyFactors.patientId, patientId), dailyFactors.recordedAt, range);
  return db.select().from(dailyFactors).where(where).orderBy(desc(dailyFactors.recordedAt));
}

export async function listConditions(patientId: string) {
  return db.select().from(patientConditions).where(eq(patientConditions.patientId, patientId))
    .orderBy(patientConditions.conditionType);
}

/* ------------------------------------------------------------ دوال مساعدة */

/** حذف سجل مع التحقق من ملكيته للمريض الحالي */
export async function deleteOwnedRecord(
  table: PgTable & { id: unknown; patientId: unknown },
  patientId: string,
  recordId: string,
): Promise<void> {
  const result = await db.delete(table as never)
    .where(and(eq(table.patientId as never, patientId), eq(table.id as never, recordId)))
    .returning({ id: table.id as never });
  if (!result.length) {
    throw new ApiError(404, 'NOT_FOUND', 'لم يتم العثور على السجل أو أنه لا يخص حسابك.');
  }
}

/** عدّ القراءات في نطاق زمني */
export async function countGlucose(patientId: string, from: Date, to: Date): Promise<number> {
  const rows = await db.select({ c: sql<number>`count(*)` }).from(glucoseReadings)
    .where(and(
      eq(glucoseReadings.patientId, patientId),
      gte(glucoseReadings.measurementDatetime, from),
      lt(glucoseReadings.measurementDatetime, to),
    ));
  return Number(rows[0]?.c ?? 0);
}
