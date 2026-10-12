'use client';
/**
 * ملفي الصحي — أربع مجموعات:
 *   أ) معلومات السكري   ب) الأمراض المصاحبة   ج) الأدوية (رابط)   د) معلومات إضافية
 * بالإضافة إلى قياسات الوزن والتحاليل المخبرية.
 * جميع الحقول الطبية اختيارية، ولا تُعيق تسجيل قياسات السكر.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, Field, ProgressBar, SectionTitle, Spinner, StatCard } from '@/components/ui';
import { WeightChart, LabHistoryChart } from '@/components/charts';
import {
  bmiCategory, calculateBmi, formatDate, formatNumber, type NumeralSystem,
} from '@/lib/format';
import {
  CONDITIONS, CONDITION_STATUSES, DIABETES_TYPES, HYPO_AWARENESS, LAB_TESTS, MONITORING_METHODS,
  PREGNANCY_STATUSES, SMOKING_STATUSES, TREATMENT_APPROACHES, YES_NO_UNSURE, labTestMeta, labelOf,
} from '@/lib/labels';

export type ProfileData = {
  fullName: string;
  gender: string;
  dateOfBirth: string;
  age: number;
  heightCm: number;
  nationalIdMasked: string;
  phoneNumber: string;
  phoneVerified: boolean;
  email: string;
  preferredGlucoseUnit: 'MG_DL' | 'MMOL_L';
  numeralSystem: NumeralSystem;
  currentWeightKg: number | null;
  bmi: number | null;
  completion: { percent: number; missing: string[] };
  diabetes: {
    diabetesType: string; diagnosisDate: string | null; diagnosisYear: number | null;
    monitoringMethod: string; hypoglycemiaHistory: string; hypoglycemiaAwareness: string;
    treatmentApproach: string; notes: string | null;
  } | null;
  conditions: Array<{ conditionType: string; status: string; notes: string | null }>;
  reproductive: { pregnancyStatus: string; gestationalDiabetesHistory: string; notes: string | null } | null;
  allergies: string | null;
  smokingStatus: string;
  familyHistoryDiabetes: string;
  healthNotes: string | null;
  weights: Array<{ id: string; weightKg: number; measurementDate: string; bmi: number | null }>;
  labs: Array<{ id: string; testType: string; value: number; valueSecondary: number | null; unit: string; testDate: string; referenceRange: string | null; notes: string | null }>;
};

export function ProfileScreen({ data }: { data: ProfileData }) {
  const router = useRouter();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [diabetes, setDiabetes] = useState({
    diabetesType: data.diabetes?.diabetesType ?? 'UNKNOWN',
    diagnosisDate: data.diabetes?.diagnosisDate ?? '',
    diagnosisYear: data.diabetes?.diagnosisYear ? String(data.diabetes.diagnosisYear) : '',
    monitoringMethod: data.diabetes?.monitoringMethod ?? 'NOT_SPECIFIED',
    hypoglycemiaHistory: data.diabetes?.hypoglycemiaHistory ?? 'UNSURE',
    hypoglycemiaAwareness: data.diabetes?.hypoglycemiaAwareness ?? 'NOT_SPECIFIED',
    treatmentApproach: data.diabetes?.treatmentApproach ?? 'NOT_SPECIFIED',
    notes: data.diabetes?.notes ?? '',
  });

  const [conditions, setConditions] = useState<Record<string, { status: string; notes: string }>>(() => {
    const map: Record<string, { status: string; notes: string }> = {};
    for (const c of CONDITIONS) {
      const found = data.conditions.find((x) => x.conditionType === c.value);
      map[c.value] = { status: found?.status ?? 'UNKNOWN', notes: found?.notes ?? '' };
    }
    return map;
  });

  const [additional, setAdditional] = useState({
    allergies: data.allergies ?? '',
    smokingStatus: data.smokingStatus,
    familyHistoryDiabetes: data.familyHistoryDiabetes,
    healthNotes: data.healthNotes ?? '',
  });

  const [reproductive, setReproductive] = useState({
    pregnancyStatus: data.reproductive?.pregnancyStatus ?? 'NOT_SPECIFIED',
    gestationalDiabetesHistory: data.reproductive?.gestationalDiabetesHistory ?? 'UNSURE',
    notes: data.reproductive?.notes ?? '',
  });

  const [weightForm, setWeightForm] = useState({ weightKg: '', measurementDate: new Date().toISOString().slice(0, 10) });
  const [labForm, setLabForm] = useState({
    testType: 'HBA1C', value: '', valueSecondary: '', unit: '%', testDate: new Date().toISOString().slice(0, 10),
    referenceRange: '', notes: '',
  });
  const [heightForm, setHeightForm] = useState(String(data.heightCm));

  async function save(kind: string, path: string, method: 'PUT' | 'PATCH' | 'POST', body: unknown, message: string) {
    setSaving(kind);
    setInfo(null);
    setError(null);
    try {
      if (method === 'PUT') await api.put(path, body);
      else if (method === 'PATCH') await api.patch(path, body);
      else await api.post(path, body);
      setInfo(message);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const previewBmi = calculateBmi(weightForm.weightKg || null, data.heightCm);
  const weightSeries = [...data.weights]
    .sort((a, b) => (a.measurementDate < b.measurementDate ? -1 : 1))
    .map((w) => ({ date: w.measurementDate, weightKg: w.weightKg }));
  const hba1cSeries = data.labs
    .filter((l) => l.testType === 'HBA1C')
    .sort((a, b) => (a.testDate < b.testDate ? -1 : 1))
    .map((l) => ({ date: l.testDate, value: l.value, unit: l.unit }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">ملفي الصحي</h1>
        <p className="mt-1 text-sm text-ink-muted">
          كل الحقول الطبية اختيارية. يمكنك تسجيل قياسات السكر في أي وقت حتى لو لم يكتمل الملف.
        </p>
      </div>

      {info ? <Alert tone="ok">{info}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* ملخص + مؤشر الاكتمال */}
      <Card>
        <SectionTitle>الملخص الأساسي</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="الاسم" value={<span className="text-base">{data.fullName}</span>}
            sub={labelOf('gender', data.gender)} />
          <StatCard label="العمر" value={<span><span className="num">{formatNumber(data.age, 0, data.numeralSystem)}</span> سنة</span>}
            sub={`تاريخ الميلاد: ${formatDate(data.dateOfBirth, 'Asia/Baghdad', data.numeralSystem)}`} />
          <StatCard label="الوزن الحالي"
            value={data.currentWeightKg != null
              ? <span><span className="num">{formatNumber(data.currentWeightKg, 1, data.numeralSystem)}</span> كغم</span>
              : '—'}
            sub={data.bmi != null ? `مؤشر كتلة الجسم: ${formatNumber(data.bmi, 1, data.numeralSystem)} — ${bmiCategory(data.bmi)}` : 'لم يُسجَّل وزن بعد'} />
          <StatCard label="الطول" value={<span><span className="num">{formatNumber(data.heightCm, 0, data.numeralSystem)}</span> سم</span>}
            sub="يمكن تعديله أدناه" />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-ink-soft">نسبة اكتمال الملف الصحي</span>
            <span className="num font-bold text-teal-700">{formatNumber(data.completion.percent, 0, data.numeralSystem)}%</span>
          </div>
          <ProgressBar percent={data.completion.percent} />
          {data.completion.missing.length ? (
            <p className="mt-2 text-xs text-ink-muted">
              حقول ناقصة: {data.completion.missing.join('، ')} — إكمالها يحسّن دقة التقارير، لكنه غير إلزامي.
            </p>
          ) : (
            <p className="mt-2 text-xs text-ok">ملفك مكتمل — يمكنك تحديثه في أي وقت.</p>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-3 text-xs leading-6 text-ink-soft">
            <p className="font-semibold text-ink">بيانات الهوية والتواصل</p>
            <p>البريد الإلكتروني: <span className="num">{data.email}</span> — <Badge tone="neutral">لم يُتحقق إلكترونيًا</Badge></p>
            <p>الرقم الوطني: <span className="num">{data.nationalIdMasked}</span> (مقنّع — لا يظهر كاملًا بعد التسجيل)</p>
            <p>رقم الهاتف: <span className="num">{data.phoneNumber}</span> — <Badge tone="warn">غير مُتحقَّق إلكترونيًا</Badge></p>
          </div>
          <div className="rounded-xl border border-brand-100 bg-white px-3.5 py-3 text-xs leading-6 text-ink-soft">
            <p className="font-semibold text-ink">تعديل الطول</p>
            <div className="mt-2 flex items-end gap-2">
              <input className="field num w-28" inputMode="decimal" dir="ltr" value={heightForm}
                onChange={(e) => setHeightForm(e.target.value)} />
              <button
                type="button"
                className="btn-outline btn-sm"
                disabled={saving === 'height'}
                onClick={() => save('height', '/api/profile', 'PATCH', { heightCm: Number(heightForm) }, 'تم تحديث الطول.')}
              >
                {saving === 'height' ? <Spinner /> : null} حفظ
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* المجموعة (أ) */}
      <Card>
        <SectionTitle>أ — معلومات السكري</SectionTitle>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save('diabetes', '/api/profile/diabetes', 'PUT', {
              diabetesType: diabetes.diabetesType,
              diagnosisDate: diabetes.diagnosisDate || null,
              diagnosisYear: diabetes.diagnosisYear ? Number(diabetes.diagnosisYear) : null,
              monitoringMethod: diabetes.monitoringMethod,
              hypoglycemiaHistory: diabetes.hypoglycemiaHistory,
              hypoglycemiaAwareness: diabetes.hypoglycemiaAwareness,
              treatmentApproach: diabetes.treatmentApproach,
              notes: diabetes.notes || null,
            }, 'تم حفظ معلومات السكري.');
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="نوع السكري" hint="لا تحدد المنصة النوع تلقائيًا — اختر ما ذكره طبيبك.">
              <select className="field" value={diabetes.diabetesType} onChange={(e) => setDiabetes({ ...diabetes, diabetesType: e.target.value })}>
                {DIABETES_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="سنة التشخيص">
              <input className="field num" type="number" min={1900} max={new Date().getFullYear()} dir="ltr"
                value={diabetes.diagnosisYear} onChange={(e) => setDiabetes({ ...diabetes, diagnosisYear: e.target.value })} />
            </Field>
            <Field label="تاريخ التشخيص (إن كنت تعرفه بدقة)">
              <input className="field" type="date" value={diabetes.diagnosisDate ?? ''}
                onChange={(e) => setDiabetes({ ...diabetes, diagnosisDate: e.target.value })} />
            </Field>
            <Field label="طريقة مراقبة السكر">
              <select className="field" value={diabetes.monitoringMethod} onChange={(e) => setDiabetes({ ...diabetes, monitoringMethod: e.target.value })}>
                {MONITORING_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="أسلوب العلاج الحالي">
              <select className="field" value={diabetes.treatmentApproach} onChange={(e) => setDiabetes({ ...diabetes, treatmentApproach: e.target.value })}>
                {TREATMENT_APPROACHES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="هل حدثت لك حالات هبوط شديد سابقًا؟">
              <select className="field" value={diabetes.hypoglycemiaHistory} onChange={(e) => setDiabetes({ ...diabetes, hypoglycemiaHistory: e.target.value })}>
                {YES_NO_UNSURE.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </Field>
            <Field label="مدى إحساسك بأعراض هبوط السكر">
              <select className="field" value={diabetes.hypoglycemiaAwareness} onChange={(e) => setDiabetes({ ...diabetes, hypoglycemiaAwareness: e.target.value })}>
                {HYPO_AWARENESS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="ملاحظات حول السكري">
                <textarea rows={2} className="field" value={diabetes.notes} onChange={(e) => setDiabetes({ ...diabetes, notes: e.target.value })} />
              </Field>
            </div>
          </div>
          <button type="submit" className="btn-teal" disabled={saving === 'diabetes'}>
            {saving === 'diabetes' ? <Spinner /> : null} حفظ معلومات السكري
          </button>
        </form>
      </Card>

      {/* المجموعة (ب) */}
      <Card>
        <SectionTitle>ب — الأمراض والحالات المصاحبة</SectionTitle>
        <p className="mb-3 text-xs text-ink-muted">
          سجّل ما تم تشخيصه من طبيب فقط. «غير معروف» تعني أنك لا تعرف حالتك بخصوص هذا المرض.
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const payload = {
              conditions: Object.entries(conditions).map(([conditionType, v]) => ({
                conditionType, status: v.status, notes: v.notes || null,
              })),
            };
            save('conditions', '/api/profile/conditions', 'PUT', payload, 'تم حفظ الأمراض المصاحبة.');
          }}
        >
          <div className="space-y-2">
            {CONDITIONS.map((c) => (
              <div key={c.value} className="grid gap-2 rounded-xl border border-brand-100 bg-brand-50/30 p-3 sm:grid-cols-[1.2fr_1fr_1.6fr]">
                <span className="text-sm font-semibold text-ink">{c.label}</span>
                <select className="field py-2 text-sm" value={conditions[c.value]?.status ?? 'UNKNOWN'}
                  onChange={(e) => setConditions({ ...conditions, [c.value]: { ...conditions[c.value]!, status: e.target.value } })}>
                  {CONDITION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <input className="field py-2 text-sm" placeholder="ملاحظات (اختياري)"
                  value={conditions[c.value]?.notes ?? ''}
                  onChange={(e) => setConditions({ ...conditions, [c.value]: { ...conditions[c.value]!, notes: e.target.value } })} />
              </div>
            ))}
          </div>
          <button type="submit" className="btn-teal" disabled={saving === 'conditions'}>
            {saving === 'conditions' ? <Spinner /> : null} حفظ الأمراض المصاحبة
          </button>
        </form>

        <div className="divider" />

        <details className="rounded-xl border border-brand-100 bg-white p-3.5">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            معلومات الحمل أو سكري الحمل (عند ملاءمتها طبيًا فقط)
          </summary>
          <p className="mt-2 text-xs text-ink-muted">
            هذه الحقول اختيارية تمامًا ولا تُطلب من جميع المرضى. يمكنك تركها دون إجابة.
          </p>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              save('reproductive', '/api/profile/reproductive', 'PUT', {
                pregnancyStatus: reproductive.pregnancyStatus,
                gestationalDiabetesHistory: reproductive.gestationalDiabetesHistory,
                notes: reproductive.notes || null,
              }, 'تم حفظ المعلومات.');
            }}
          >
            <Field label="الحالة الحالية">
              <select className="field" value={reproductive.pregnancyStatus}
                onChange={(e) => setReproductive({ ...reproductive, pregnancyStatus: e.target.value })}>
                {PREGNANCY_STATUSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="تاريخ سكري الحمل">
              <select className="field" value={reproductive.gestationalDiabetesHistory}
                onChange={(e) => setReproductive({ ...reproductive, gestationalDiabetesHistory: e.target.value })}>
                {YES_NO_UNSURE.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </Field>
            <Field label="ملاحظات">
              <input className="field" value={reproductive.notes} onChange={(e) => setReproductive({ ...reproductive, notes: e.target.value })} />
            </Field>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-outline btn-sm" disabled={saving === 'reproductive'}>
                {saving === 'reproductive' ? <Spinner /> : null} حفظ
              </button>
            </div>
          </form>
        </details>
      </Card>

      {/* المجموعة (ج) */}
      <Card>
        <SectionTitle>ج — الأدوية الحالية</SectionTitle>
        <p className="text-sm leading-7 text-ink-soft">
          تُدار الأدوية بالكامل من صفحة «أدويتي»، حيث يمكنك إضافة الأدوية وتعديلها وتعطيلها وتسجيل الجرعات الفعلية
          بشكل منفصل عن الجرعة الموصوفة.
        </p>
        <Link href="/medications" className="btn-outline btn-sm mt-3">الانتقال إلى أدويتي</Link>
      </Card>

      {/* المجموعة (د) */}
      <Card>
        <SectionTitle>د — معلومات إضافية</SectionTitle>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save('additional', '/api/profile/additional', 'PUT', {
              allergies: additional.allergies || null,
              smokingStatus: additional.smokingStatus,
              familyHistoryDiabetes: additional.familyHistoryDiabetes,
              healthNotes: additional.healthNotes || null,
            }, 'تم حفظ المعلومات الإضافية.');
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="حساسية من أدوية معينة" hint="اكتب أسماء الأدوية إن وُجدت، أو اتركه فارغًا.">
              <input className="field" value={additional.allergies} onChange={(e) => setAdditional({ ...additional, allergies: e.target.value })} />
            </Field>
            <Field label="حالة التدخين">
              <select className="field" value={additional.smokingStatus} onChange={(e) => setAdditional({ ...additional, smokingStatus: e.target.value })}>
                {SMOKING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="وجود تاريخ عائلي للسكري">
              <select className="field" value={additional.familyHistoryDiabetes} onChange={(e) => setAdditional({ ...additional, familyHistoryDiabetes: e.target.value })}>
                {YES_NO_UNSURE.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="ملاحظات صحية ترغب بتوثيقها">
                <textarea rows={3} className="field" value={additional.healthNotes} onChange={(e) => setAdditional({ ...additional, healthNotes: e.target.value })} />
              </Field>
            </div>
          </div>
          <button type="submit" className="btn-teal" disabled={saving === 'additional'}>
            {saving === 'additional' ? <Spinner /> : null} حفظ المعلومات الإضافية
          </button>
        </form>
      </Card>

      {/* الوزن */}
      <Card>
        <SectionTitle>قياسات الوزن ومؤشر كتلة الجسم</SectionTitle>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            save('weight', '/api/weight', 'POST', {
              weightKg: Number(weightForm.weightKg),
              measurementDate: weightForm.measurementDate,
            }, 'تم حفظ قياس الوزن.');
          }}
        >
          <Field label="الوزن (كغم)" required>
            <input className="field num" inputMode="decimal" dir="ltr" value={weightForm.weightKg} required
              onChange={(e) => setWeightForm({ ...weightForm, weightKg: e.target.value })} placeholder="78.5" />
          </Field>
          <Field label="تاريخ القياس" required>
            <input type="date" className="field" value={weightForm.measurementDate} required
              onChange={(e) => setWeightForm({ ...weightForm, measurementDate: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <button type="submit" className="btn-teal" disabled={saving === 'weight'}>
              {saving === 'weight' ? <Spinner /> : null} حفظ الوزن
            </button>
          </div>
          <div className="flex items-end text-xs text-ink-muted">
            {previewBmi != null ? (
              <span>
                مؤشر كتلة الجسم المتوقع: <span className="font-bold num">{formatNumber(previewBmi, 1, data.numeralSystem)}</span> ({bmiCategory(previewBmi)})
              </span>
            ) : (
              <span>المعادلة: الوزن ÷ (الطول بالمتر)²</span>
            )}
          </div>
        </form>

        <p className="mt-3 text-xs leading-6 text-ink-muted">
          مؤشر كتلة الجسم رقم معلوماتي فقط ولا يُستخدم وحده لتشخيص أي حالة. يُحفظ كل قياس بشكل تاريخي ولا يُستبدل.
        </p>

        <div className="mt-4">
          {weightSeries.length >= 2 ? (
            <WeightChart data={weightSeries} numeralSystem={data.numeralSystem} />
          ) : (
            <EmptyState
              title="لا توجد قياسات وزن كافية لعرض المخطط"
              description="سجّل قياسين على الأقل لعرض اتجاه الوزن."
            />
          )}
        </div>

        {data.weights.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-right text-xs text-ink-muted">
                  <th className="px-2 py-2 font-semibold">التاريخ</th>
                  <th className="px-2 py-2 font-semibold">الوزن</th>
                  <th className="px-2 py-2 font-semibold">مؤشر كتلة الجسم</th>
                  <th className="px-2 py-2 font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {data.weights.map((w) => (
                  <tr key={w.id} className="border-b border-brand-50">
                    <td className="px-2 py-2 num">{formatDate(w.measurementDate, 'Asia/Baghdad', data.numeralSystem)}</td>
                    <td className="px-2 py-2 num">{formatNumber(w.weightKg, 1, data.numeralSystem)} كغم</td>
                    <td className="px-2 py-2 num">{w.bmi != null ? formatNumber(w.bmi, 1, data.numeralSystem) : '—'}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="btn-ghost btn-sm text-alert"
                        onClick={async () => {
                          try {
                            await api.del(`/api/weight/${w.id}`);
                            setInfo('تم حذف قياس الوزن.');
                            router.refresh();
                          } catch (err) { setError((err as Error).message); }
                        }}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {/* التحاليل */}
      <Card>
        <SectionTitle>نتائج التحاليل المخبرية</SectionTitle>
        <p className="mb-3 text-xs leading-6 text-ink-muted">
          تُدخَل النتائج يدويًا من تقارير المختبر. لا تُنشئ المنصة أي قيم مرجعية ولا تفسّر النتائج كتشخيص.
        </p>

        <form
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const meta = labTestMeta(labForm.testType);
            save('lab', '/api/labs', 'POST', {
              testType: labForm.testType,
              value: Number(labForm.value),
              valueSecondary: labForm.valueSecondary === '' ? null : Number(labForm.valueSecondary),
              unit: labForm.unit || meta.unit || '—',
              testDate: labForm.testDate,
              referenceRange: labForm.referenceRange || null,
              notes: labForm.notes || null,
            }, 'تم حفظ نتيجة التحليل.');
          }}
        >
          <Field label="نوع التحليل" required>
            <select className="field" value={labForm.testType}
              onChange={(e) => {
                const meta = labTestMeta(e.target.value);
                setLabForm({ ...labForm, testType: e.target.value, unit: meta.unit, valueSecondary: '' });
              }}>
              {LAB_TESTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label={labTestMeta(labForm.testType).dual ? 'القيمة الانقباضية' : 'القيمة'} required>
            <input className="field num" inputMode="decimal" dir="ltr" value={labForm.value} required
              onChange={(e) => setLabForm({ ...labForm, value: e.target.value })} />
          </Field>
          {labTestMeta(labForm.testType).dual ? (
            <Field label="القيمة الانبساطية" required>
              <input className="field num" inputMode="decimal" dir="ltr" value={labForm.valueSecondary} required
                onChange={(e) => setLabForm({ ...labForm, valueSecondary: e.target.value })} />
            </Field>
          ) : null}
          <Field label="الوحدة" required>
            <input className="field" dir="ltr" value={labForm.unit} required
              onChange={(e) => setLabForm({ ...labForm, unit: e.target.value })} />
          </Field>
          <Field label="تاريخ التحليل" required>
            <input type="date" className="field" value={labForm.testDate} required
              onChange={(e) => setLabForm({ ...labForm, testDate: e.target.value })} />
          </Field>
          <Field label="المدى المرجعي (كما في تقرير المختبر)">
            <input className="field" dir="ltr" value={labForm.referenceRange}
              onChange={(e) => setLabForm({ ...labForm, referenceRange: e.target.value })} placeholder="مثال: 4.0 - 5.6" />
          </Field>
          <Field label="ملاحظات">
            <input className="field" value={labForm.notes} onChange={(e) => setLabForm({ ...labForm, notes: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <button type="submit" className="btn-teal" disabled={saving === 'lab'}>
              {saving === 'lab' ? <Spinner /> : null} حفظ النتيجة
            </button>
          </div>
        </form>

        {data.labs.length === 0 ? (
          <EmptyState
            title="لا توجد نتائج تحاليل مسجّلة."
            description="أضف نتائج تحاليلك (السكر التراكمي، الكرياتينين، الضغط…) لتظهر في ملفك وتقاريرك."
          />
        ) : (
          <>
            {hba1cSeries.length >= 2 ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-ink">تطور السكر التراكمي (HbA1c)</p>
                <LabHistoryChart data={hba1cSeries} unit="%" numeralSystem={data.numeralSystem} />
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-brand-100 text-right text-xs text-ink-muted">
                    <th className="px-2 py-2 font-semibold">التاريخ</th>
                    <th className="px-2 py-2 font-semibold">التحليل</th>
                    <th className="px-2 py-2 font-semibold">القيمة</th>
                    <th className="px-2 py-2 font-semibold">المدى المرجعي</th>
                    <th className="px-2 py-2 font-semibold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {data.labs.map((l) => (
                    <tr key={l.id} className="border-b border-brand-50">
                      <td className="px-2 py-2 num">{formatDate(l.testDate, 'Asia/Baghdad', data.numeralSystem)}</td>
                      <td className="px-2 py-2">{labelOf('labTest', l.testType)}</td>
                      <td className="px-2 py-2 num">
                        {l.testType === 'BLOOD_PRESSURE'
                          ? `${formatNumber(l.value, 0, data.numeralSystem)}/${formatNumber(l.valueSecondary ?? 0, 0, data.numeralSystem)} ${l.unit}`
                          : `${formatNumber(l.value, l.value % 1 === 0 ? 0 : 2, data.numeralSystem)} ${l.unit}`}
                      </td>
                      <td className="px-2 py-2 text-xs text-ink-muted num">{l.referenceRange ?? '—'}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="btn-ghost btn-sm text-alert"
                          onClick={async () => {
                            try {
                              await api.del(`/api/labs/${l.id}`);
                              setInfo('تم حذف نتيجة التحليل.');
                              router.refresh();
                            } catch (err) { setError((err as Error).message); }
                          }}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-ink-muted">
                إدخال المريض فقط: جميع النتائج المعروضة أُدخلت يدويًا من قِبل المستخدم.
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
