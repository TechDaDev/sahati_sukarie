'use client';
/**
 * شاشة قياسات السكر:
 *  - إدخال سريع (القيمة، الوحدة، التاريخ، الوقت، السياق) ثم حفظ.
 *  - تحويل الوحدات وعرض موحّد مع الحفاظ على القيمة الأصلية.
 *  - تأكيد إلزامي للقيم غير المعتادة (بدون أي تعديل تلقائي للقيمة).
 *  - سجل زمني مع بحث بالتاريخ، تصفية بالسياق، وتعديل/حذف بتأكيد.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, Field, Icons, SectionTitle, Spinner, StatCard } from '@/components/ui';
import {
  formatDate, formatGlucose, formatNumber, formatTime,
  toArabicIndic, toMgdl, utcToLocalInput, type NumeralSystem,
} from '@/lib/format';
import { GLUCOSE_SOURCES, GLUCOSE_UNITS, MEASUREMENT_CONTEXTS, labelOf } from '@/lib/labels';
import { GLUCOSE_ENTRY_LIMITS, glucoseInfoMessage, SYMPTOM_SAFETY_NOTE } from '@/lib/safety';

export type Reading = {
  id: string;
  value: number;
  unit: 'MG_DL' | 'MMOL_L';
  standardizedValueMgdl: number;
  measurementDatetime: string;
  measurementContext: string;
  minutesAfterMeal: number | null;
  source: string;
  symptomsText: string | null;
  notes: string | null;
  updatedAt: string;
};

type Props = {
  preferredUnit: 'MG_DL' | 'MMOL_L';
  numeralSystem: NumeralSystem;
  timezone: string;
  initialReadings: Reading[];
};

type FormState = {
  id: string | null;
  value: string;
  unit: 'MG_DL' | 'MMOL_L';
  date: string;
  time: string;
  context: string;
  minutesAfterMeal: string;
  source: string;
  symptoms: string;
  notes: string;
};

const AFTER_MEAL = new Set(['AFTER_BREAKFAST', 'AFTER_LUNCH', 'AFTER_DINNER']);

export function GlucoseScreen({ preferredUnit, numeralSystem, timezone, initialReadings }: Props) {
  const router = useRouter();
  const now = utcToLocalInput(new Date());
  const emptyForm: FormState = {
    id: null, value: '', unit: preferredUnit, date: now.date, time: now.time,
    context: 'FASTING', minutesAfterMeal: '', source: 'NOT_SPECIFIED', symptoms: '', notes: '',
  };

  const [readings, setReadings] = useState<Reading[]>(initialReadings);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [filterContext, setFilterContext] = useState('ALL');

  const displayed = useMemo(() => {
    return readings.filter((r) => {
      const localDate = utcToLocalInput(new Date(r.measurementDatetime), timezone).date;
      if (filterDate && localDate !== filterDate) return false;
      if (filterContext !== 'ALL' && r.measurementContext !== filterContext) return false;
      return true;
    });
  }, [readings, filterDate, filterContext, timezone]);

  const stats = useMemo(() => {
    const pool = displayed.map((r) => r.standardizedValueMgdl);
    if (!pool.length) return null;
    return {
      count: pool.length,
      average: pool.reduce((a, b) => a + b, 0) / pool.length,
      min: Math.min(...pool),
      max: Math.max(...pool),
    };
  }, [displayed]);

  function resetForm() {
    const current = utcToLocalInput(new Date());
    setForm({ ...emptyForm, date: current.date, time: current.time, unit: preferredUnit });
    setNeedsConfirm(false);
    setError(null);
    setFields({});
  }

  function startEdit(r: Reading) {
    const local = utcToLocalInput(new Date(r.measurementDatetime), timezone);
    setForm({
      id: r.id,
      value: String(r.value),
      unit: r.unit,
      date: local.date,
      time: local.time,
      context: r.measurementContext,
      minutesAfterMeal: r.minutesAfterMeal != null ? String(r.minutesAfterMeal) : '',
      source: r.source,
      symptoms: r.symptomsText ?? '',
      notes: r.notes ?? '',
    });
    setShowForm(true);
    setNeedsConfirm(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setFields({});

    const value = Number(form.value);
    if (!Number.isFinite(value) || value <= 0) {
      setFields({ glucoseValue: 'أدخل قيمة رقمية أكبر من صفر' });
      setError('الرجاء إدخال قيمة صحيحة للقياس.');
      return;
    }

    const payload = {
      glucoseValue: value,
      glucoseUnit: form.unit,
      measurementDate: form.date,
      measurementTime: form.time,
      measurementContext: form.context,
      minutesAfterMeal: AFTER_MEAL.has(form.context) && form.minutesAfterMeal !== '' ? Number(form.minutesAfterMeal) : null,
      source: form.source,
      symptoms: form.symptoms || null,
      notes: form.notes || null,
      confirmedUnusual: needsConfirm,
    };

    setSaving(true);
    try {
      const result = form.id
        ? await api.patch<{ updated: boolean; infoMessage: string | null }>(`/api/glucose/${form.id}`, payload)
        : await api.post<{ id: string; displayValue: string; infoMessage: string | null }>('/api/glucose', payload);

      setInfo(
        form.id
          ? 'تم تحديث القياس بنجاح، وأُضيف أثر التعديل إلى سجل التدقيق.'
          : 'تم حفظ القياس بنجاح.',
      );
      if ('infoMessage' in result && result.infoMessage) setInfo(result.infoMessage);
      resetForm();
      router.refresh();
      // تحديث فوري للقائمة من الخادم
      const fresh = await api.get<{ readings: Array<Reading & { measurementDatetime: string; updatedAt: string }> }>('/api/glucose');
      setReadings(fresh.readings);
    } catch (err) {
      const e = err as { message?: string; code?: string; fields?: Record<string, string> };
      if (e.code === 'CONFIRM_REQUIRED') {
        setNeedsConfirm(true);
        setError(e.message ?? null);
      } else {
        setError(e.message ?? 'تعذّر حفظ القياس.');
      }
      setFields(e.fields ?? {});
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await api.del(`/api/glucose/${deleteId}`);
      setReadings((prev) => prev.filter((r) => r.id !== deleteId));
      setDeleteId(null);
      setInfo('تم حذف القياس مع الاحتفاظ بأثر التدقيق على العملية.');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeleteId(null);
    }
  }

  const previewMgdl = Number.isFinite(Number(form.value)) && Number(form.value) > 0
    ? toMgdl(Number(form.value), form.unit)
    : null;
  const previewInfo = previewMgdl ? glucoseInfoMessage(previewMgdl, numeralSystem) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">قياسات السكر</h1>
          <p className="mt-1 text-sm text-ink-muted">
            سجّل قراءاتك بوحدة <span className="num">mg/dL</span> أو <span className="num">mmol/L</span> — تُخزَّن القيمة الأصلية كما أدخلتها مع تمثيل موحّد داخلي.
          </p>
        </div>
        <Link href="/reports" className="btn-outline btn-sm">{Icons.chart} التقارير والرسوم</Link>
      </div>

      {info ? <Alert tone="ok">{info}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* نموذج الإدخال */}
      <Card>
        <SectionTitle
          action={form.id ? (
            <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>إلغاء التعديل</button>
          ) : (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'إخفاء النموذج' : 'إظهار النموذج'}
            </button>
          )}
        >
          {form.id ? 'تعديل قياس' : 'إضافة قياس سريع'}
        </SectionTitle>

        {showForm ? (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {needsConfirm ? (
              <Alert tone="warn" title="تأكيد إلزامي">
                {error ?? 'القيمة المدخلة غير معتادة. تأكد من صحة الرقم والوحدة قبل الحفظ.'}
                {' '}لن تُعدَّل القيمة أو تُحذف تلقائيًا — القرار لك.
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="قيمة السكر" htmlFor="value" required error={fields.glucoseValue}>
                <input id="value" className={`field num text-lg font-bold ${fields.glucoseValue ? 'field-error' : ''}`}
                  inputMode="decimal" dir="ltr" placeholder="120" value={form.value}
                  onChange={(e) => { setForm({ ...form, value: e.target.value }); setNeedsConfirm(false); }} required />
              </Field>

              <Field label="الوحدة" htmlFor="unit" required>
                <select id="unit" className="field" value={form.unit}
                  onChange={(e) => { setForm({ ...form, unit: e.target.value as 'MG_DL' | 'MMOL_L' }); setNeedsConfirm(false); }}>
                  {GLUCOSE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </Field>

              <Field label="سياق القياس" htmlFor="context" required>
                <select id="context" className="field" value={form.context}
                  onChange={(e) => setForm({ ...form, context: e.target.value })}>
                  {MEASUREMENT_CONTEXTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>

              <Field label="التاريخ" htmlFor="date" required>
                <input id="date" type="date" className="field" value={form.date}
                  max={utcToLocalInput(new Date()).date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </Field>

              <Field label="الوقت" htmlFor="time" required>
                <input id="time" type="time" className="field" value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })} required />
              </Field>

              {AFTER_MEAL.has(form.context) ? (
                <Field label="الوقت المنقضي منذ الأكل (دقيقة)" htmlFor="minutesAfterMeal"
                  hint="اختياري — إن كنت تعرف المدة التقريبية.">
                  <input id="minutesAfterMeal" type="number" min={0} max={480} dir="ltr" className="field num"
                    value={form.minutesAfterMeal} onChange={(e) => setForm({ ...form, minutesAfterMeal: e.target.value })} />
                </Field>
              ) : null}

              <Field label="مصدر القياس / الجهاز" htmlFor="source">
                <select id="source" className="field" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  {GLUCOSE_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="أعراض مصاحبة (اختياري)" htmlFor="symptoms"
                hint="مثال: دوخة، تعرّق، رجفة. تُسجَّل كما هي دون تفسير طبي.">
                <input id="symptoms" className="field" value={form.symptoms}
                  onChange={(e) => setForm({ ...form, symptoms: e.target.value })} />
              </Field>

              <Field label="ملاحظات (اختياري)" htmlFor="notes">
                <textarea id="notes" rows={2} className="field" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>

            {previewMgdl ? (
              <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-2.5 text-xs leading-6 text-ink-soft">
                <p>
                  المعادلة المستخدمة: <span className="num">mmol/L = mg/dL ÷ 18.0182</span> — القيمة المعادلة تقريبًا:{' '}
                  <span className="font-bold num">
                    {formatNumber(previewMgdl / 18.0182, 1, numeralSystem)} mmol/L
                  </span>{' '}
                  ({formatNumber(previewMgdl, 0, numeralSystem)} mg/dL).
                </p>
                {previewInfo ? <p className="mt-1 text-[#8A5A11]">{previewInfo}</p> : null}
                {form.symptoms ? <p className="mt-1 text-[#8A5A11]">{SYMPTOM_SAFETY_NOTE}</p> : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-teal" disabled={saving}>
                {saving ? <Spinner /> : null}
                {needsConfirm ? 'تأكيد وحفظ القياس' : form.id ? 'حفظ التعديل' : 'حفظ القياس'}
              </button>
              <span className="text-xs text-ink-muted">
                تُقبل القيم بين <span className="num">{GLUCOSE_ENTRY_LIMITS.absoluteMinMgdl}</span> و
                <span className="num"> {GLUCOSE_ENTRY_LIMITS.absoluteMaxMgdl}</span> mg/dL، ويُطلب تأكيد إضافي خارج
                <span className="num"> {GLUCOSE_ENTRY_LIMITS.lowConfirmMgdl}</span>–
                <span className="num">{GLUCOSE_ENTRY_LIMITS.highConfirmMgdl}</span> mg/dL.
              </span>
            </div>
          </form>
        ) : null}
      </Card>

      {/* ملخص الفترة المعروضة */}
      {stats ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="عدد القراءات" value={<span className="num">{formatNumber(stats.count, 0, numeralSystem)}</span>} />
          <StatCard label="المتوسط" value={formatGlucose(stats.average, preferredUnit, numeralSystem)} tone="teal" />
          <StatCard label="أقل قراءة" value={formatGlucose(stats.min, preferredUnit, numeralSystem)} />
          <StatCard label="أعلى قراءة" value={formatGlucose(stats.max, preferredUnit, numeralSystem)} />
        </div>
      ) : null}

      {/* السجل */}
      <Card>
        <SectionTitle>سجل القياسات</SectionTitle>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Field label="تصفية بالتاريخ" htmlFor="filterDate">
            <input id="filterDate" type="date" className="field" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </Field>
          <Field label="تصفية بالسياق" htmlFor="filterContext">
            <select id="filterContext" className="field" value={filterContext} onChange={(e) => setFilterContext(e.target.value)}>
              <option value="ALL">كل السياقات</option>
              {MEASUREMENT_CONTEXTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <div className="flex items-end">
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setFilterDate(''); setFilterContext('ALL'); }}>
              إعادة ضبط الفلاتر
            </button>
          </div>
        </div>

        {displayed.length === 0 ? (
          <EmptyState
            title={readings.length === 0 ? 'لم تسجل أي قراءة للسكر بعد.' : 'لا توجد قراءات مطابقة للفلاتر المحددة.'}
            description={readings.length === 0
              ? 'سجّل أول قراءة من النموذج أعلاه لتظهر هنا وفي المخططات والتقارير.'
              : 'جرّب تغيير التاريخ أو سياق القياس.'}
            actionLabel={readings.length === 0 ? 'إضافة أول قياس' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-right text-xs text-ink-muted">
                  <th className="px-2 py-2 font-semibold">القيمة</th>
                  <th className="px-2 py-2 font-semibold">السياق</th>
                  <th className="px-2 py-2 font-semibold">التاريخ والوقت</th>
                  <th className="px-2 py-2 font-semibold">ملاحظات</th>
                  <th className="px-2 py-2 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.id} className="border-b border-brand-50 align-top">
                    <td className="px-2 py-2.5">
                      <span className="font-bold">{formatGlucose(r.standardizedValueMgdl, preferredUnit, numeralSystem)}</span>
                      {r.unit !== preferredUnit ? (
                        <span className="mt-0.5 block text-[11px] text-ink-muted">
                          كما أُدخلت: <span className="num">{formatNumber(r.value, r.unit === 'MG_DL' ? 0 : 1, numeralSystem)} {r.unit === 'MG_DL' ? 'mg/dL' : 'mmol/L'}</span>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge tone="blue">{labelOf('context', r.measurementContext)}</Badge>
                      {r.minutesAfterMeal != null ? (
                        <span className="mt-1 block text-[11px] text-ink-muted">
                          بعد الأكل بـ <span className="num">{toArabicIndic(String(r.minutesAfterMeal))}</span> دقيقة
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-ink-soft">
                      <span className="num">{formatDate(r.measurementDatetime, timezone, numeralSystem)}</span>
                      <span className="block num text-ink-muted">{formatTime(r.measurementDatetime, timezone, numeralSystem)}</span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-ink-soft">
                      {r.symptomsText ? <span className="block">أعراض: {r.symptomsText}</span> : null}
                      {r.notes ? <span className="block text-ink-muted">{r.notes}</span> : null}
                      {!r.symptomsText && !r.notes ? <span className="text-ink-muted">—</span> : null}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex gap-2">
                        <button type="button" className="btn-outline btn-sm" onClick={() => startEdit(r)}>تعديل</button>
                        <button type="button" className="btn-ghost btn-sm text-alert" onClick={() => setDeleteId(r.id)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-muted">
              كل تعديل أو حذف يُسجَّل في سجل تدقيق داخلي يحتوي القيم السابقة والجديدة، ولا يحتوي أي بيانات هوية.
            </p>
          </div>
        )}
      </Card>

      {deleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-pop">
            <h3 className="text-base">تأكيد الحذف</h3>
            <p className="mt-2 text-sm leading-7 text-ink-soft">
              هل أنت متأكد من حذف هذا القياس؟ لا يمكن التراجع عن الحذف، وسيُحفظ أثر العملية في سجل التدقيق.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setDeleteId(null)}>إلغاء</button>
              <button type="button" className="btn-danger btn-sm" onClick={confirmDelete}>نعم، احذف القياس</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
