/**
 * لوحة المتابعة الصحية — جميع الأرقام مشتقّة من قاعدة البيانات فعليًا.
 * لا تُعرض أي قيمة وهمية؛ وعند غياب البيانات تظهر حالات فراغ واضحة.
 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePatientPage } from '@/server/page-guards';
import { getPatientDashboard } from '@/server/services/dashboard';
import {
  formatDate, formatDateTime, formatDuration, formatGlucose, formatNumber, formatTime,
} from '@/lib/format';
import { LABELS, labelOf } from '@/lib/labels';
import { Alert, Badge, Card, EmptyState, Icons, SectionTitle, StatCard } from '@/components/ui';
import { GlucoseTrendChart } from '@/components/charts';
import { windowAverageDelta } from '@/lib/glucose-analysis';
import { QuickActions } from '@/components/quick-actions';
import { SAFETY_DISCLAIMER, glucoseInfoMessage } from '@/lib/safety';

export const metadata: Metadata = { title: 'لوحة المتابعة الصحية' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await requirePatientPage();
  const { latestGlucose, todayReadings, lastAdministration, todayActivities, mealsToday, lastSleep, todaySymptoms,
    recentGlucose, latestWeight, latestHba1c, completion, activeMedications, recentAdministrations, recentMeals,
    activityMinutes, trendData } = await getPatientDashboard(ctx.profileId, ctx.timezone, ctx.preferredUnit);
  const infoMessage = latestGlucose ? glucoseInfoMessage(Number(latestGlucose.standardizedValueMgdl), ctx.numeralSystem) : null;
  const showOnboarding = completion.percent < 100;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">لوحة المتابعة الصحية</h1>
          <p className="mt-1 text-sm text-ink-muted">
            مرحبًا {ctx.fullName} — اليوم <span className="num">{formatDate(new Date(), ctx.timezone, ctx.numeralSystem)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/glucose" className="btn-teal btn-sm">{Icons.plus} إضافة قياس سكر</Link>
          <Link href="/reports" className="btn-outline btn-sm">التقارير</Link>
        </div>
      </div>

      {infoMessage ? <Alert tone="warn" title="ملاحظة حول آخر قراءة">{infoMessage}</Alert> : null}

      {showOnboarding ? (
        <Card className="border-teal-100 bg-teal-50/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">أكمل ملفك الصحي لتحصل على متابعة أدق</p>
              <p className="mt-1 text-xs text-ink-soft">
                نسبة الاكتمال الحالية <span className="num">{formatNumber(completion.percent, 0, ctx.numeralSystem)}%</span>
                {completion.missing.length ? ` — المتبقي: ${completion.missing.slice(0, 4).join('، ')}` : ''}
              </p>
            </div>
            <Link href="/profile" className="btn-teal btn-sm">إكمال الملف الصحي</Link>
          </div>
        </Card>
      ) : null}

      {/* البطاقات الرئيسية */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="آخر قراءة سكر"
          value={latestGlucose
            ? formatGlucose(Number(latestGlucose.standardizedValueMgdl), ctx.preferredUnit, ctx.numeralSystem)
            : '—'}
          sub={latestGlucose ? (
            <span>
              {labelOf('context', latestGlucose.measurementContext)} — <span className="num">{formatDateTime(latestGlucose.measurementDatetime, ctx.timezone, ctx.numeralSystem)}</span>
            </span>
          ) : 'لم تسجل أي قراءة بعد'}
          tone={latestGlucose ? 'teal' : 'neutral'}
          icon={Icons.drop}
        />
        <StatCard
          label="قياسات اليوم"
          value={<span className="num">{formatNumber(todayReadings, 0, ctx.numeralSystem)}</span>}
          sub={todayReadings === 0 ? 'لم تسجل أي قراءة اليوم' : 'قراءات مسجّلة اليوم'}
          icon={Icons.chart}
        />
        <StatCard
          label="آخر جرعة دواء مسجّلة"
          value={lastAdministration ? labelOf('administrationStatus', lastAdministration.administration.status) : '—'}
          sub={lastAdministration ? (
            <span>
              {lastAdministration.medication.medicationName} — <span className="num">{formatDateTime(lastAdministration.administration.administrationDatetime, ctx.timezone, ctx.numeralSystem)}</span>
            </span>
          ) : 'لا توجد جرعات مسجّلة'}
          icon={Icons.pill}
        />
        <StatCard
          label="نشاط اليوم"
          value={activityMinutes > 0
            ? <span className="text-lg">{formatDuration(activityMinutes, ctx.numeralSystem)}</span>
            : '—'}
          sub={todayActivities.length
            ? `${todayActivities.length} نشاط — ${todayActivities[0]!.activityType}`
            : 'لا يوجد نشاط مسجّل اليوم'}
          icon={Icons.journal}
        />
      </div>

      {/* إجراءات سريعة */}
      <Card>
        <SectionTitle>إضافة سريعة</SectionTitle>
        <QuickActions
          medications={activeMedications.map((m) => ({
            id: m.id,
            name: m.medicationName,
            doseUnit: m.doseUnit,
            prescribedDose: m.prescribedDose ? Number(m.prescribedDose) : null,
          }))}
        />
      </Card>

      {/* المخطط + اليوم */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle action={<Link href="/glucose" className="text-xs font-semibold text-brand-600 hover:underline">كل القياسات</Link>}>
            اتجاه قراءات السكر (آخر 14 يومًا)
          </SectionTitle>
          {trendData.length >= 2 ? (
            <GlucoseTrendChart
              data={trendData}
              unit={ctx.preferredUnit}
              timezone={ctx.timezone}
              numeralSystem={ctx.numeralSystem}
            />
          ) : (
            <EmptyState
              title="لا توجد بيانات كافية لعرض المخطط"
              description="يظهر المخطط بعد تسجيل قراءتين على الأقل خلال آخر 14 يومًا."
              actionHref="/glucose"
              actionLabel="إضافة قياس سكر"
            />
          )}
        </Card>

        <Card>
          <SectionTitle>ملخص اليوم</SectionTitle>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-ink-soft">الوجبات المسجّلة</span>
              <span className="font-bold"><span className="num">{formatNumber(mealsToday, 0, ctx.numeralSystem)}</span></span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink-soft">الأعراض المسجّلة</span>
              <span className="font-bold"><span className="num">{formatNumber(todaySymptoms.length, 0, ctx.numeralSystem)}</span></span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink-soft">آخر نوم مسجّل</span>
              <span className="font-bold">
                {lastSleep[0]
                  ? formatDuration(lastSleep[0].durationMinutes, ctx.numeralSystem)
                  : '—'}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink-soft">الوزن الأخير</span>
              <span className="font-bold">
                {latestWeight[0]
                  ? <span><span className="num">{formatNumber(Number(latestWeight[0].weightKg), 1, ctx.numeralSystem)}</span> كغم</span>
                  : '—'}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink-soft">آخر HbA1c مسجّل</span>
              <span className="font-bold">
                {latestHba1c[0]
                  ? <span><span className="num">{formatNumber(Number(latestHba1c[0].value), 1, ctx.numeralSystem)}%</span></span>
                  : '—'}
              </span>
            </li>
          </ul>
          <div className="divider" />
          <p className="text-xs leading-6 text-ink-muted">
            جميع الأرقام أعلاه مشتقّة من سجلاتك المسجّلة فقط. غياب تسجيل لا يعني بالضرورة عدم حدوث الشيء.
          </p>
        </Card>
      </div>

      {/* ملخص الفروق حول الأحداث (وصفي فقط، دون أي استنتاج سببي) */}
      {trendData.length >= 2 && (recentAdministrations.length || recentMeals.length) ? (
        <Card>
          <SectionTitle>فروق متوسط القراءات حول الأحداث المسجّلة (آخر 14 يومًا)</SectionTitle>
          <p className="mb-3 text-xs leading-6 text-ink-muted">
            يُحسب الفرق بين متوسط القراءات قبل الحدث بـ3 ساعات ومتوسطها بعده بـ3 ساعات، اعتمادًا على القراءات المسجّلة فقط.
            هذا عرض وصفي محايد ولا يعني أن الحدث سبب التغيّر.
          </p>
          <div className="space-y-2">
            {[...recentAdministrations.slice(0, 3).map((a) => ({
              at: a.administration.administrationDatetime.toISOString(),
              label: `دواء: ${a.medication.medicationName}`,
            })), ...recentMeals.slice(0, 2).map((m) => ({
              at: m.mealDatetime.toISOString(),
              label: `وجبة: ${labelOf('mealType', m.mealType)}`,
            }))].map((event) => {
              const delta = windowAverageDelta(trendData, event.at);
              return (
                <div key={`${event.label}-${event.at}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50/30 px-3.5 py-2.5 text-sm">
                  <span className="font-semibold text-ink">{event.label}</span>
                  <span className="text-xs text-ink-muted num">{formatDateTime(event.at, ctx.timezone, ctx.numeralSystem)}</span>
                  <span className="text-xs text-ink-soft">
                    {delta.delta === null
                      ? 'لا توجد قراءات كافية قبل الحدث وبعده لعرض الفرق'
                      : `متوسط قبل: ${formatGlucose(delta.before, ctx.preferredUnit, ctx.numeralSystem)} — بعد: ${formatGlucose(delta.after, ctx.preferredUnit, ctx.numeralSystem)} — الفرق: ${delta.delta > 0 ? '+' : ''}${formatGlucose(Math.abs(delta.delta), ctx.preferredUnit, ctx.numeralSystem)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* آخر الأحداث */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle action={<Link href="/glucose" className="text-xs font-semibold text-brand-600 hover:underline">إدارة</Link>}>
            أحدث قراءات السكر
          </SectionTitle>
          {recentGlucose.length === 0 ? (
            <EmptyState
              title="لم تسجل أي قراءة للسكر بعد."
              description="ابدأ بتسجيل أول قراءة لتظهر لك الاتجاهات والملخصات."
              actionHref="/glucose"
              actionLabel="إضافة أول قياس"
            />
          ) : (
            <ul className="space-y-2">
              {[...recentGlucose].reverse().slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/30 px-3.5 py-2.5">
                  <span className="text-sm">
                    <span className="font-bold">
                      {formatGlucose(Number(r.standardizedValueMgdl), ctx.preferredUnit, ctx.numeralSystem)}
                    </span>
                    <span className="block text-xs text-ink-muted">{labelOf('context', r.measurementContext)}</span>
                  </span>
                  <span className="text-xs text-ink-muted num">
                    {formatDate(r.measurementDatetime, ctx.timezone, ctx.numeralSystem)} — {formatTime(r.measurementDatetime, ctx.timezone, ctx.numeralSystem)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle action={<Link href="/daily-log" className="text-xs font-semibold text-brand-600 hover:underline">يومياتي</Link>}>
            نشاطات اليوم
          </SectionTitle>
          {todayActivities.length === 0 ? (
            <EmptyState
              title="لا يوجد نشاط بدني مسجّل اليوم."
              description="تسجيل النشاط يساعدك على رؤية يومك كاملًا في التقارير."
              actionHref="/daily-log"
              actionLabel="تسجيل نشاط بدني"
            />
          ) : (
            <ul className="space-y-2">
              {todayActivities.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/30 px-3.5 py-2.5">
                  <span className="text-sm">
                    <span className="font-bold">{a.activityType}</span>
                    <span className="block text-xs text-ink-muted">
                      <Badge tone="teal">{labelOf('intensity', a.intensity)}</Badge>
                    </span>
                  </span>
                  <span className="text-xs text-ink-muted">
                    {formatDuration(a.durationMinutes, ctx.numeralSystem)} — {formatTime(a.activityDatetime, ctx.timezone, ctx.numeralSystem)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="rounded-xl border border-brand-100 bg-white/70 px-4 py-3 text-xs leading-6 text-ink-muted">
        <p className="font-semibold text-ink-soft">قيود مهمة على ما تعرضه هذه اللوحة</p>
        <p className="mt-1">
          {SAFETY_DISCLAIMER} لا تُجري المنصة أي استنتاج تشخيصي، ولا تحسب جرعات، ولا تُنشئ بيانات لم تُسجَّل.
          راجع قائمة الأدوية كاملة من <Link href="/medications" className="font-semibold text-brand-600 hover:underline">أدويتي</Link>.
        </p>
        <p className="mt-1">
          التصنيفات المتاحة: {Object.keys(LABELS).length > 0 ? 'صائم، بعد الأكل، قبل النوم وغيرها' : ''} — يمكنك دائمًا تعديل أي قياس من صفحة القياسات.
        </p>
      </div>
    </div>
  );
}
