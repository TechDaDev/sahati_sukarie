/**
 * خدمة التقارير: تُجمّع الإحصاءات من السجلات الفعلية فقط.
 * ---------------------------------------------------------------------------
 * قيود مقصودة:
 *  - لا يتم اختلاق أي نقطة بيانات أو تعبئة فراغات.
 *  - لا تُستنتج نسبة HbA1c من قراءات السكر.
 *  - لا يتم حساب "الوقت داخل النطاق" بشكل سريري من قراءات متباعدة.
 *  - لا تُقدَّم أي نطاقات علاجية شخصية؛ فروق القراءات تُعرض بحياد.
 *  - غياب سجل جرعة لا يُفسَّر تلقائيًا على أنه جرعة فائتة.
 */
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { db } from '../db';
import {
  activityRecords, glucoseReadings, labResults, mealRecords,
  medicationAdministrations, medications, sleepRecords, symptomRecords, weightRecords,
} from '../db/schema';
import { getProfileByUserId } from './patient';
import { fromMgdl } from '../../lib/format';

export type ReportRange = { from: Date; to: Date; fromISO: string; toISO: string };

export type GlucoseStats = {
  count: number;
  averageMgdl: number | null;
  minMgdl: number | null;
  maxMgdl: number | null;
  averageDisplay: string | null;
  minDisplay: string | null;
  maxDisplay: string | null;
  byContext: Array<{ context: string; count: number; averageMgdl: number }>;
};

export type ReportData = Awaited<ReturnType<typeof buildReportData>>;

function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export async function buildReportData(
  userId: string,
  range: { from: Date; to: Date },
  displayUnit: 'MG_DL' | 'MMOL_L',
): Promise<{
  patient: {
    fullName: string;
    age: number;
    gender: string;
    heightCm: number;
    diabetesType: string | null;
    treatmentApproach: string | null;
    monitoringMethod: string | null;
    diagnosisDate: string | null;
    diagnosisYear: number | null;
  };
  range: { from: Date; to: Date };
  glucose: GlucoseStats;
  glucoseSeries: Array<{ id: string; at: Date; valueMgdl: number; context: string }>;
  administrations: Array<{ id: string; at: Date; status: string; medicationName: string; dose: string | null }>;
  adherence: {
    taken: number;
    missed: number;
    delayed: number;
    note: string;
  };
  medications: Array<{
    id: string; name: string; category: string; strength: string | null; dose: string | null;
    unit: string | null; frequency: string; route: string; status: string;
  }>;
  activities: {
    count: number;
    totalMinutes: number;
    averageMinutes: number | null;
    byIntensity: Array<{ intensity: string; count: number; minutes: number }>;
    items: Array<{ id: string; at: Date; type: string; minutes: number; intensity: string }>;
  };
  meals: { count: number; totalCarbs: number | null; items: Array<{ id: string; at: Date; type: string; carbs: number | null }> };
  sleep: { count: number; averageMinutes: number | null };
  symptoms: Array<{ id: string; at: Date; type: string; severity: string; notes: string | null }>;
  weights: Array<{ id: string; date: string; weightKg: number; bmi: number | null }>;
  hba1c: Array<{ id: string; date: string; value: number; unit: string }>;
  labs: Array<{ id: string; date: string; testType: string; value: number; valueSecondary: number | null; unit: string }>;
  notes: { healthNotes: string | null; diabetesNotes: string | null };
  emptyStates: string[];
}> {
  const full = await getProfileByUserId(userId);
  if (!full) throw new Error('الملف الصحي غير موجود');
  const patientId = full.profile.id;

  const [glucoseRows, adminRows, medRows, activityRows, mealRows, sleepRows, symptomRows, weightRows, labRows] =
    await Promise.all([
      db.select().from(glucoseReadings)
        .where(and(eq(glucoseReadings.patientId, patientId),
          gte(glucoseReadings.measurementDatetime, range.from),
          lt(glucoseReadings.measurementDatetime, range.to)))
        .orderBy(asc(glucoseReadings.measurementDatetime)),
      db.select({ a: medicationAdministrations, m: medications })
        .from(medicationAdministrations)
        .innerJoin(medications, eq(medications.id, medicationAdministrations.medicationId))
        .where(and(eq(medicationAdministrations.patientId, patientId),
          gte(medicationAdministrations.administrationDatetime, range.from),
          lt(medicationAdministrations.administrationDatetime, range.to)))
        .orderBy(asc(medicationAdministrations.administrationDatetime)),
      db.select().from(medications).where(eq(medications.patientId, patientId))
        .orderBy(asc(medications.status), asc(medications.medicationName)),
      db.select().from(activityRecords)
        .where(and(eq(activityRecords.patientId, patientId),
          gte(activityRecords.activityDatetime, range.from),
          lt(activityRecords.activityDatetime, range.to)))
        .orderBy(asc(activityRecords.activityDatetime)),
      db.select().from(mealRecords)
        .where(and(eq(mealRecords.patientId, patientId),
          gte(mealRecords.mealDatetime, range.from),
          lt(mealRecords.mealDatetime, range.to)))
        .orderBy(asc(mealRecords.mealDatetime)),
      db.select().from(sleepRecords)
        .where(and(eq(sleepRecords.patientId, patientId),
          gte(sleepRecords.sleepDate, range.from.toISOString().slice(0, 10)),
          lt(sleepRecords.sleepDate, range.to.toISOString().slice(0, 10))))
        .orderBy(asc(sleepRecords.sleepDate)),
      db.select().from(symptomRecords)
        .where(and(eq(symptomRecords.patientId, patientId),
          gte(symptomRecords.symptomDatetime, range.from),
          lt(symptomRecords.symptomDatetime, range.to)))
        .orderBy(asc(symptomRecords.symptomDatetime)),
      db.select().from(weightRecords)
        .where(and(eq(weightRecords.patientId, patientId),
          gte(weightRecords.measurementDate, range.from.toISOString().slice(0, 10)),
          lt(weightRecords.measurementDate, range.to.toISOString().slice(0, 10))))
        .orderBy(asc(weightRecords.measurementDate)),
      db.select().from(labResults)
        .where(and(eq(labResults.patientId, patientId),
          gte(labResults.testDate, range.from.toISOString().slice(0, 10)),
          lt(labResults.testDate, range.to.toISOString().slice(0, 10))))
        .orderBy(asc(labResults.testDate)),
    ]);

  const fmt = (mgdl: number) =>
    displayUnit === 'MG_DL'
      ? `${Math.round(mgdl)} mg/dL`
      : `${round(fromMgdl(mgdl, 'MMOL_L'), 1)} mmol/L`;

  const valuesMgdl = glucoseRows.map((r) => Number(r.standardizedValueMgdl));
  const sum = valuesMgdl.reduce((a, b) => a + b, 0);
  const averageMgdl = valuesMgdl.length ? sum / valuesMgdl.length : null;

  const contextMap = new Map<string, number[]>();
  for (const r of glucoseRows) {
    const list = contextMap.get(r.measurementContext) ?? [];
    list.push(Number(r.standardizedValueMgdl));
    contextMap.set(r.measurementContext, list);
  }

  const taken = adminRows.filter((r) => r.a.status === 'TAKEN').length;
  const missed = adminRows.filter((r) => r.a.status === 'MISSED').length;
  const delayed = adminRows.filter((r) => r.a.status === 'DELAYED').length;

  const activityByIntensity = new Map<string, { count: number; minutes: number }>();
  for (const a of activityRows) {
    const cur = activityByIntensity.get(a.intensity) ?? { count: 0, minutes: 0 };
    cur.count += 1;
    cur.minutes += a.durationMinutes;
    activityByIntensity.set(a.intensity, cur);
  }

  const carbValues = mealRows.map((m) => (m.carbohydrateGrams == null ? null : Number(m.carbohydrateGrams)))
    .filter((v): v is number => v !== null);

  const averageSleep = sleepRows.length
    ? sleepRows.reduce((s, r) => s + r.durationMinutes, 0) / sleepRows.length
    : null;

  const emptyStates: string[] = [];
  if (!glucoseRows.length) emptyStates.push('لا توجد قراءات سكر مسجّلة خلال الفترة المحددة.');
  if (!medRows.length) emptyStates.push('لا توجد أدوية مسجّلة.');
  if (!adminRows.length) emptyStates.push('لا توجد جرعات فعلية مسجّلة خلال الفترة المحددة.');
  if (!activityRows.length) emptyStates.push('لا يوجد نشاط بدني مسجّل خلال الفترة المحددة.');
  if (!weightRows.length) emptyStates.push('لا توجد قياسات وزن خلال الفترة المحددة.');
  if (!labRows.length) emptyStates.push('لا توجد نتائج تحاليل خلال الفترة المحددة.');
  // رسالة عامة عندما لا توجد أي بيانات على الإطلاق خلال الفترة المحددة
  const noDataAtAll = !glucoseRows.length && !adminRows.length && !activityRows.length
    && !mealRows.length && !weightRows.length && !labRows.length && !sleepRows.length && !symptomRows.length;
  if (noDataAtAll) emptyStates.unshift('لا توجد بيانات كافية لعرض التقرير خلال الفترة المحددة.');

  return {
    patient: {
      fullName: full.profile.fullName,
      age: full.age,
      gender: full.profile.gender,
      heightCm: Number(full.profile.heightCm),
      diabetesType: full.diabetes?.diabetesType ?? null,
      treatmentApproach: full.diabetes?.treatmentApproach ?? null,
      monitoringMethod: full.diabetes?.monitoringMethod ?? null,
      diagnosisDate: full.diabetes?.diagnosisDate ?? null,
      diagnosisYear: full.diabetes?.diagnosisYear ?? null,
    },
    range,
    glucose: {
      count: glucoseRows.length,
      averageMgdl: averageMgdl === null ? null : round(averageMgdl, 1),
      minMgdl: valuesMgdl.length ? round(Math.min(...valuesMgdl), 1) : null,
      maxMgdl: valuesMgdl.length ? round(Math.max(...valuesMgdl), 1) : null,
      averageDisplay: averageMgdl === null ? null : fmt(averageMgdl),
      minDisplay: valuesMgdl.length ? fmt(Math.min(...valuesMgdl)) : null,
      maxDisplay: valuesMgdl.length ? fmt(Math.max(...valuesMgdl)) : null,
      byContext: [...contextMap.entries()].map(([context, values]) => ({
        context,
        count: values.length,
        averageMgdl: round(values.reduce((a, b) => a + b, 0) / values.length, 1),
      })).sort((a, b) => b.count - a.count),
    },
    glucoseSeries: glucoseRows.map((r) => ({
      id: r.id,
      at: r.measurementDatetime,
      valueMgdl: Number(r.standardizedValueMgdl),
      context: r.measurementContext,
    })),
    administrations: adminRows.map((r) => ({
      id: r.a.id,
      at: r.a.administrationDatetime,
      status: r.a.status,
      medicationName: r.m.medicationName,
      dose: r.a.actualDose ? `${Number(r.a.actualDose)}${r.a.doseUnit ? ` ${r.a.doseUnit}` : ''}` : null,
    })),
    adherence: {
      taken,
      missed,
      delayed,
      note: 'الأرقام أعلاه تعكس ما سجّله المريض فعليًا. غياب تسجيل الجرعة لا يعني بالضرورة أنها لم تؤخذ.',
    },
    medications: medRows.map((m) => ({
      id: m.id,
      name: m.medicationName,
      category: m.category,
      strength: m.strength ? `${Number(m.strength)}${m.strengthUnit ? ` ${m.strengthUnit}` : ''}` : null,
      dose: m.prescribedDose ? String(Number(m.prescribedDose)) : null,
      unit: m.doseUnit ?? null,
      frequency: m.frequency,
      route: m.route,
      status: m.status,
    })),
    activities: {
      count: activityRows.length,
      totalMinutes: activityRows.reduce((s, a) => s + a.durationMinutes, 0),
      averageMinutes: activityRows.length ? round(activityRows.reduce((s, a) => s + a.durationMinutes, 0) / activityRows.length, 0) : null,
      byIntensity: [...activityByIntensity.entries()].map(([intensity, v]) => ({ intensity, ...v })),
      items: activityRows.map((a) => ({
        id: a.id, at: a.activityDatetime, type: a.activityType, minutes: a.durationMinutes, intensity: a.intensity,
      })),
    },
    meals: {
      count: mealRows.length,
      totalCarbs: carbValues.length ? round(carbValues.reduce((a, b) => a + b, 0), 1) : null,
      items: mealRows.map((m) => ({
        id: m.id, at: m.mealDatetime, type: m.mealType,
        carbs: m.carbohydrateGrams == null ? null : Number(m.carbohydrateGrams),
      })),
    },
    sleep: { count: sleepRows.length, averageMinutes: averageSleep === null ? null : round(averageSleep, 0) },
    symptoms: symptomRows.map((s) => ({
      id: s.id, at: s.symptomDatetime, type: s.symptomType, severity: s.severity, notes: s.notes,
    })),
    weights: weightRows.map((w) => ({
      id: w.id,
      date: w.measurementDate,
      weightKg: Number(w.weightKg),
      bmi: full.profile.heightCm
        ? round(Number(w.weightKg) / ((Number(full.profile.heightCm) / 100) ** 2), 1)
        : null,
    })),
    hba1c: labRows.filter((l) => l.testType === 'HBA1C').map((l) => ({
      id: l.id, date: l.testDate, value: Number(l.value), unit: l.unit,
    })),
    labs: labRows.map((l) => ({
      id: l.id, date: l.testDate, testType: l.testType, value: Number(l.value),
      valueSecondary: l.valueSecondary ? Number(l.valueSecondary) : null, unit: l.unit,
    })),
    notes: {
      healthNotes: full.profile.healthNotes,
      diabetesNotes: full.diabetes?.notes ?? null,
    },
    emptyStates,
  };
}
