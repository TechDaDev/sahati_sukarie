/** صفحة يومياتي الصحية — وجبات، نشاط، نوم، أعراض، عوامل يومية */
import type { Metadata } from 'next';
import { requirePatientPage } from '@/server/page-guards';
import { listActivities, listFactors, listMeals, listSleep, listSymptoms } from '@/server/services/records';
import { DailyLogScreen } from './daily-log-screen';

export const metadata: Metadata = { title: 'يومياتي الصحية' };
export const dynamic = 'force-dynamic';

export default async function DailyLogPage() {
  const ctx = await requirePatientPage();
  const [meals, activities, sleep, symptoms, factors] = await Promise.all([
    listMeals(ctx.profileId),
    listActivities(ctx.profileId),
    listSleep(ctx.profileId),
    listSymptoms(ctx.profileId),
    listFactors(ctx.profileId),
  ]);

  return (
    <DailyLogScreen
      numeralSystem={ctx.numeralSystem}
      timezone={ctx.timezone}
      data={{
        meals: meals.map((m) => ({
          id: m.id, mealType: m.mealType, description: m.description,
          carbohydrateGrams: m.carbohydrateGrams ? Number(m.carbohydrateGrams) : null,
          mealDatetime: m.mealDatetime.toISOString(), notes: m.notes,
        })),
        activities: activities.map((a) => ({
          id: a.id, activityType: a.activityType, durationMinutes: a.durationMinutes,
          intensity: a.intensity, activityDatetime: a.activityDatetime.toISOString(), notes: a.notes,
        })),
        sleep: sleep.map((s) => ({
          id: s.id, durationMinutes: s.durationMinutes, quality: s.quality,
          sleepDate: s.sleepDate, notes: s.notes,
        })),
        symptoms: symptoms.map((s) => ({
          id: s.id, symptomType: s.symptomType, severity: s.severity,
          symptomDatetime: s.symptomDatetime.toISOString(), notes: s.notes,
        })),
        factors: factors.map((f) => ({
          id: f.id, factorType: f.factorType, description: f.description,
          recordedAt: f.recordedAt.toISOString(),
        })),
      }}
    />
  );
}
