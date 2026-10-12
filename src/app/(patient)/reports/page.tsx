/** صفحة التقارير والمتابعة */
import type { Metadata } from 'next';
import { requirePatientPage } from '@/server/page-guards';
import { buildReportData } from '@/server/services/reports';
import { localInputToUtc, todayISO } from '@/lib/format';
import { ReportsScreen } from './reports-screen';

export const metadata: Metadata = { title: 'التقارير والمتابعة' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const ctx = await requirePatientPage();
  const to = todayISO(ctx.timezone);
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const from = start.toISOString().slice(0, 10);

  const rangeStart = localInputToUtc(from, '00:00', ctx.timezone);
  const rangeEnd = new Date(localInputToUtc(to, '00:00', ctx.timezone).getTime() + 86_400_000 - 1);

  const data = await buildReportData(ctx.userId, { from: rangeStart, to: rangeEnd }, ctx.preferredUnit);

  // تحويل التواريخ إلى ISO نصوص لتُمرَّر إلى مكوّن العميل
  return (
    <ReportsScreen
      initialFrom={from}
      initialTo={to}
      unit={ctx.preferredUnit}
      numeralSystem={ctx.numeralSystem}
      timezone={ctx.timezone}
      initialSummary={{
        range: { from: data.range.from.toISOString(), to: data.range.to.toISOString() },
        glucose: data.glucose,
        glucoseSeries: data.glucoseSeries.map((p) => ({
          id: p.id, at: p.at.toISOString(), valueMgdl: p.valueMgdl, context: p.context,
        })),
        adherence: data.adherence,
        administrations: data.administrations.map((a) => ({
          id: a.id, at: a.at.toISOString(), status: a.status, medicationName: a.medicationName, dose: a.dose,
        })),
        activities: {
          count: data.activities.count,
          totalMinutes: data.activities.totalMinutes,
          averageMinutes: data.activities.averageMinutes,
          byIntensity: data.activities.byIntensity,
          items: data.activities.items.map((i) => ({
            id: i.id, at: i.at.toISOString(), type: i.type, minutes: i.minutes, intensity: i.intensity,
          })),
        },
        meals: { count: data.meals.count, totalCarbs: data.meals.totalCarbs },
        sleep: data.sleep,
        symptoms: data.symptoms.map((s) => ({
          id: s.id, at: s.at.toISOString(), type: s.type, severity: s.severity,
        })),
        weights: data.weights,
        hba1c: data.hba1c,
        labs: data.labs,
        emptyStates: data.emptyStates,
      }}
    />
  );
}
