/** صفحة قياسات السكر — إدخال سريع + سجل كامل مع تعديل وحذف */
import type { Metadata } from 'next';
import { requirePatientPage } from '@/server/page-guards';
import { listGlucose } from '@/server/services/records';
import { GlucoseScreen } from './glucose-screen';

export const metadata: Metadata = { title: 'قياسات السكر' };
export const dynamic = 'force-dynamic';

export default async function GlucosePage() {
  const ctx = await requirePatientPage();
  const readings = await listGlucose(ctx.profileId);

  return (
    <GlucoseScreen
      preferredUnit={ctx.preferredUnit}
      numeralSystem={ctx.numeralSystem}
      timezone={ctx.timezone}
      initialReadings={readings.map((r) => ({
        id: r.id,
        value: Number(r.glucoseValue),
        unit: r.glucoseUnit,
        standardizedValueMgdl: Number(r.standardizedValueMgdl),
        measurementDatetime: r.measurementDatetime.toISOString(),
        measurementContext: r.measurementContext,
        minutesAfterMeal: r.minutesAfterMeal,
        source: r.source,
        symptomsText: r.symptomsText,
        notes: r.notes,
        updatedAt: r.updatedAt.toISOString(),
      }))}
    />
  );
}
