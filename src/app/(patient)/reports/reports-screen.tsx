'use client';
/**
 * التقارير والمتابعة: نطاقات زمنية جاهزة ومخصّصة، إحصاءات ورسوم مبنية
 * على البيانات المسجّلة فعلًا فقط، وإمكانية تنزيل تقرير PDF عربي.
 *
 * قيود مقصودة ومعلنة للمستخدم:
 *  - لا تُختلق أي نقطة بيانات لملء الفراغات.
 *  - لا تُستنتج HbA1c من قراءات السكر المنزلية.
 *  - لا يُحسب "الوقت داخل النطاق" بشكل سريري من قراءات متباعدة.
 *  - لا تُعرض نطاقات علاجية شخصية، وتُعرض القراءات بحياد.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, downloadPdf } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, Field, Icons, SectionTitle, Spinner, StatCard } from '@/components/ui';
import {
  ActivityBarsChart, ContextAverageChart, GlucoseTrendChart, GlucoseWithEventsChart, LabHistoryChart, WeightChart,
} from '@/components/charts';
import { formatDate, formatDuration, formatNumber, formatShortDay, todayISO, type NumeralSystem } from '@/lib/format';
import { labelOf } from '@/lib/labels';

export type ReportSummary = {
  range: { from: string; to: string };
  glucose: {
    count: number;
    averageMgdl: number | null;
    minMgdl: number | null;
    maxMgdl: number | null;
    averageDisplay: string | null;
    minDisplay: string | null;
    maxDisplay: string | null;
    byContext: Array<{ context: string; count: number; averageMgdl: number }>;
  };
  glucoseSeries: Array<{ id: string; at: string; valueMgdl: number; context: string }>;
  adherence: { taken: number; missed: number; delayed: number; note: string };
  administrations: Array<{ id: string; at: string; status: string; medicationName: string; dose: string | null }>;
  activities: {
    count: number; totalMinutes: number; averageMinutes: number | null;
    byIntensity: Array<{ intensity: string; count: number; minutes: number }>;
    items: Array<{ id: string; at: string; type: string; minutes: number; intensity: string }>;
  };
  meals: { count: number; totalCarbs: number | null };
  sleep: { count: number; averageMinutes: number | null };
  symptoms: Array<{ id: string; at: string; type: string; severity: string }>;
  weights: Array<{ id: string; date: string; weightKg: number; bmi: number | null }>;
  hba1c: Array<{ id: string; date: string; value: number; unit: string }>;
  labs: Array<{ id: string; date: string; testType: string; value: number; valueSecondary: number | null; unit: string }>;
  emptyStates: string[];
};

export function ReportsScreen({
  initialSummary, initialFrom, initialTo, unit, numeralSystem, timezone,
}: {
  initialSummary: ReportSummary;
  initialFrom: string;
  initialTo: string;
  unit: 'MG_DL' | 'MMOL_L';
  numeralSystem: NumeralSystem;
  timezone: string;
}) {
  const router = useRouter();
  const today = todayISO(timezone);
  const [summary, setSummary] = useState(initialSummary);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function preset(days: number) {
    const endDate = today;
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return { from: start.toISOString().slice(0, 10), to: endDate };
  }

  async function load(nextFrom: string, nextTo: string) {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const data = await api.get<ReportSummary>(`/api/reports/summary?from=${nextFrom}&to=${nextTo}`);
      setSummary(data);
      setFrom(nextFrom);
      setTo(nextTo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport() {
    setPdfLoading(true);
    setError(null);
    setInfo(null);
    try {
      await downloadPdf(`/api/reports/pdf?from=${from}&to=${to}`, `sahati-report-${from}-${to}.pdf`);
      setInfo('تم إنشاء التقرير وتنزيله. يمكنك مشاركته مع طبيبك.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPdfLoading(false);
    }
  }

  const glucoseChartData = summary.glucoseSeries.map((p) => ({
    at: p.at,
    value: unit === 'MG_DL' ? p.valueMgdl : p.valueMgdl / 18.0182,
  }));

  const markers = [
    ...summary.administrations.map((a) => ({ at: a.at, kind: 'medication', label: `دواء: ${a.medicationName}` })),
    ...summary.activities.items.map((a) => ({ at: a.at, kind: 'activity', label: `نشاط: ${a.type}` })),
  ];

  const activityByDay = Object.values(
    summary.activities.items.reduce<Record<string, { date: string; label: string; minutes: number }>>((acc, a) => {
      const key = a.at.slice(0, 10);
      acc[key] = acc[key] ?? { date: key, label: formatShortDay(a.at, timezone, numeralSystem), minutes: 0 };
      acc[key].minutes += a.minutes;
      return acc;
    }, {}),
  ).sort((a, b) => (a.date < b.date ? -1 : 1));

  const noData = summary.glucose.count === 0 && summary.activities.count === 0
    && summary.weights.length === 0 && summary.hba1c.length === 0 && summary.administrations.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">التقارير والمتابعة</h1>
          <p className="mt-1 text-sm text-ink-muted">
            جميع الأرقام والرسوم مشتقّة من سجلاتك فقط خلال الفترة المحددة.
          </p>
        </div>
        <button type="button" className="btn-primary btn-sm" onClick={downloadReport} disabled={pdfLoading}>
          {pdfLoading ? <Spinner /> : Icons.download} تنزيل تقرير PDF عربي
        </button>
      </div>

      {info ? <Alert tone="ok">{info}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <SectionTitle>الفترة الزمنية</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {[
            { d: 7, l: 'آخر 7 أيام' },
            { d: 30, l: 'آخر 30 يومًا' },
            { d: 90, l: 'آخر 90 يومًا' },
          ].map((p) => (
            <button key={p.d} type="button" className="btn-outline btn-sm"
              onClick={() => { const range = preset(p.d); load(range.from, range.to); }}>
              {p.l}
            </button>
          ))}
          <button type="button" className="btn-outline btn-sm" onClick={() => load(today, today)}>اليوم</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Field label="من تاريخ" htmlFor="from">
            <input id="from" type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ" htmlFor="to">
            <input id="to" type="date" className="field" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button type="button" className="btn-teal" onClick={() => load(from, to)} disabled={loading}>
              {loading ? <Spinner /> : null} تطبيق الفترة
            </button>
          </div>
          <div className="flex items-end text-xs text-ink-muted">
            أقصى مدى: سنة واحدة — الفترة الحالية: <span className="num">{formatDate(from, timezone, numeralSystem)}</span> إلى <span className="num">{formatDate(to, timezone, numeralSystem)}</span>
          </div>
        </div>
      </Card>

      {noData ? (
        <EmptyState
          title="لا توجد بيانات كافية لعرض التقرير خلال الفترة المحددة."
          description="جرّب توسيع الفترة الزمنية، أو ابدأ بتسجيل قياس سكر أو نشاط بدني."
          actionHref="/glucose"
          actionLabel="إضافة أول قياس"
        />
      ) : null}

      {summary.emptyStates.length ? (
        <Alert tone="warn" title="ملاحظة حول البيانات">
          <ul className="space-y-1">
            {summary.emptyStates.map((e) => <li key={e}>• {e}</li>)}
          </ul>
        </Alert>
      ) : null}

      {/* إحصاءات السكر */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="عدد قراءات السكر" value={<span className="num">{formatNumber(summary.glucose.count, 0, numeralSystem)}</span>} tone="teal" icon={Icons.drop} />
        <StatCard label="متوسط القراءات" value={summary.glucose.averageDisplay ?? '—'} sub="متوسط حسابي للقراءات المسجّلة" />
        <StatCard label="أقل قراءة مسجّلة" value={summary.glucose.minDisplay ?? '—'} />
        <StatCard label="أعلى قراءة مسجّلة" value={summary.glucose.maxDisplay ?? '—'} />
      </div>

      <Card>
        <SectionTitle>مخطط قراءات السكر</SectionTitle>
        {glucoseChartData.length >= 2 ? (
          <GlucoseTrendChart data={glucoseChartData} unit={unit} timezone={timezone} numeralSystem={numeralSystem} height={280} />
        ) : (
          <EmptyState
            title="لا توجد قراءات كافية لعرض المخطط"
            description="يلزم تسجيل قراءتين على الأقل خلال الفترة المحددة."
            actionHref="/glucose"
            actionLabel="إضافة قياس"
          />
        )}
      </Card>

      {summary.glucose.byContext.length ? (
        <Card>
          <SectionTitle>متوسط القراءات حسب سياق القياس</SectionTitle>
          <ContextAverageChart
            data={summary.glucose.byContext.map((c) => ({
              context: c.context,
              averageMgdl: c.averageMgdl,
              count: c.count,
              label: labelOf('context', c.context),
            }))}
            unit={unit}
            numeralSystem={numeralSystem}
          />
          <p className="mt-2 text-xs leading-6 text-ink-muted">
            هذه المتوسطات وصفية لما تم تسجيله، ولا تمثل نطاقات مستهدفة للعلاج. حدّد أهدافك مع طبيبك.
          </p>
        </Card>
      ) : null}

      {glucoseChartData.length >= 2 && markers.length ? (
        <Card>
          <SectionTitle>القراءات مع الأحداث المسجّلة</SectionTitle>
          <GlucoseWithEventsChart
            glucose={glucoseChartData}
            markers={markers}
            unit={unit}
            timezone={timezone}
            numeralSystem={numeralSystem}
          />
        </Card>
      ) : null}

      {/* الأدوية */}
      <Card>
        <SectionTitle>ملخص سجل الأدوية والجرعات</SectionTitle>
        {summary.administrations.length === 0 ? (
          <EmptyState
            title="لا توجد جرعات مسجّلة خلال الفترة المحددة."
            description="تُسجَّل الجرعات الفعلية من صفحة أدويتي، وهي منفصلة عن خطة الدواء الموصوف."
            actionHref="/medications"
            actionLabel="تسجيل جرعة"
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="جرعات تم تناولها" value={<span className="num">{formatNumber(summary.adherence.taken, 0, numeralSystem)}</span>} tone="teal" />
              <StatCard label="جرعات فائتة (مسجّلة)" value={<span className="num">{formatNumber(summary.adherence.missed, 0, numeralSystem)}</span>} tone={summary.adherence.missed ? 'danger' : 'neutral'} />
              <StatCard label="جرعات مؤجّلة" value={<span className="num">{formatNumber(summary.adherence.delayed, 0, numeralSystem)}</span>} tone={summary.adherence.delayed ? 'warn' : 'neutral'} />
            </div>
            <p className="mt-3 text-xs leading-6 text-ink-muted">{summary.adherence.note}</p>
            <div className="mt-3 max-h-64 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-brand-100 text-right text-xs text-ink-muted">
                    <th className="px-2 py-2 font-semibold">الوقت</th>
                    <th className="px-2 py-2 font-semibold">الدواء</th>
                    <th className="px-2 py-2 font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.administrations.slice(0, 50).map((a) => (
                    <tr key={a.id} className="border-b border-brand-50">
                      <td className="px-2 py-2 text-xs num">{formatDate(a.at, timezone, numeralSystem)}</td>
                      <td className="px-2 py-2">{a.medicationName}</td>
                      <td className="px-2 py-2">
                        <Badge tone={a.status === 'TAKEN' ? 'ok' : a.status === 'MISSED' ? 'danger' : 'warn'}>
                          {labelOf('administrationStatus', a.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* النشاط البدني */}
      <Card>
        <SectionTitle>ملخص النشاط البدني</SectionTitle>
        {summary.activities.count === 0 ? (
          <EmptyState
            title="لا يوجد نشاط بدني مسجّل خلال الفترة المحددة."
            actionHref="/daily-log"
            actionLabel="تسجيل نشاط بدني"
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="عدد الأنشطة" value={<span className="num">{formatNumber(summary.activities.count, 0, numeralSystem)}</span>} />
              <StatCard label="إجمالي المدة" value={formatDuration(summary.activities.totalMinutes, numeralSystem)} tone="teal" />
              <StatCard label="متوسط مدة النشاط"
                value={summary.activities.averageMinutes != null ? formatDuration(summary.activities.averageMinutes, numeralSystem) : '—'} />
            </div>
            {activityByDay.length >= 2 ? (
              <div className="mt-4">
                <ActivityBarsChart data={activityByDay} numeralSystem={numeralSystem} />
              </div>
            ) : null}
            <ul className="mt-3 flex flex-wrap gap-2">
              {summary.activities.byIntensity.map((i) => (
                <li key={i.intensity}>
                  <Badge tone="teal">
                    {labelOf('intensity', i.intensity)}: <span className="num">{formatNumber(i.count, 0, numeralSystem)}</span> نشاط — <span className="num">{formatNumber(i.minutes, 0, numeralSystem)}</span> دقيقة
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* الوزن */}
      <Card>
        <SectionTitle>اتجاه الوزن</SectionTitle>
        {summary.weights.length >= 2 ? (
          <WeightChart data={summary.weights.map((w) => ({ date: w.date, weightKg: w.weightKg }))} numeralSystem={numeralSystem} />
        ) : (
          <EmptyState
            title="لا توجد قياسات وزن كافية خلال الفترة المحددة."
            description="سجّل قياسين على الأقل لعرض الاتجاه."
            actionHref="/profile"
            actionLabel="إضافة وزن"
          />
        )}
      </Card>

      {/* HbA1c */}
      <Card>
        <SectionTitle>تاريخ السكر التراكمي (HbA1c)</SectionTitle>
        <p className="mb-3 text-xs leading-6 text-ink-muted">
          القيم المعروضة نتائج مخبرية أُدخلت يدويًا. لا تُحسب هذه النسبة من قراءات السكر المنزلية.
        </p>
        {summary.hba1c.length ? (
          <>
            {summary.hba1c.length >= 2 ? (
              <LabHistoryChart
                data={[...summary.hba1c].sort((a, b) => (a.date < b.date ? -1 : 1)).map((h) => ({ date: h.date, value: h.value, unit: h.unit }))}
                unit="%"
                numeralSystem={numeralSystem}
              />
            ) : null}
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-right text-xs text-ink-muted">
                  <th className="px-2 py-2 font-semibold">تاريخ التحليل</th>
                  <th className="px-2 py-2 font-semibold">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {summary.hba1c.map((h) => (
                  <tr key={h.id} className="border-b border-brand-50">
                    <td className="px-2 py-2 num">{formatDate(h.date, timezone, numeralSystem)}</td>
                    <td className="px-2 py-2 num">{formatNumber(h.value, 1, numeralSystem)} {h.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <EmptyState title="لا توجد نتائج HbA1c مسجّلة خلال الفترة المحددة." actionHref="/profile" actionLabel="إضافة تحليل" />
        )}
      </Card>

      {/* ملخصات أخرى */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="الوجبات المسجّلة" value={<span className="num">{formatNumber(summary.meals.count, 0, numeralSystem)}</span>}
          sub={summary.meals.totalCarbs != null
            ? `مجموع الكربوهيدرات المقدّرة: ${formatNumber(summary.meals.totalCarbs, 0, numeralSystem)} غرام`
            : 'لم تُسجَّل كميات كربوهيدرات'} />
        <StatCard label="سجلات النوم"
          value={<span className="num">{formatNumber(summary.sleep.count, 0, numeralSystem)}</span>}
          sub={summary.sleep.averageMinutes != null ? `متوسط المدة: ${formatDuration(summary.sleep.averageMinutes, numeralSystem)}` : 'لا توجد بيانات'} />
        <StatCard label="الأعراض المسجّلة" value={<span className="num">{formatNumber(summary.symptoms.length, 0, numeralSystem)}</span>}
          sub="تُعرض للتتبع فقط دون أي تفسير طبي" tone={summary.symptoms.some((s) => s.severity === 'SEVERE') ? 'warn' : 'neutral'} />
      </div>

      <div className="rounded-xl border border-brand-100 bg-white/70 px-4 py-3 text-xs leading-6 text-ink-muted">
        <p className="font-semibold text-ink-soft">حدود هذا التقرير</p>
        <ul className="mt-1 space-y-1">
          <li>• لا تُختلق أي بيانات لملء الفراغات؛ ما لا يوجد سجل له لا يظهر في الرسوم.</li>
          <li>• لا تُستنتج نسبة HbA1c من قراءات السكر، ولا يُحسب «الوقت داخل النطاق» من قراءات متباعدة.</li>
          <li>• لا تُعرض نطاقات علاجية مستهدفة عند غياب أهداف معتمدة من طبيبك.</li>
          <li>• ربط التوقيتات يُعرض كمرجع زمني فقط، دون أي استنتاج سببي.</li>
        </ul>
        <div className="mt-3">
          <button type="button" className="btn-outline btn-sm" onClick={() => router.refresh()}>تحديث البيانات</button>
        </div>
      </div>
    </div>
  );
}
