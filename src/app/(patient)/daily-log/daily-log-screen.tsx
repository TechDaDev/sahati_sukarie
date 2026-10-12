'use client';
/**
 * يومياتي الصحية: وجبات، نشاط بدني، نوم، أعراض، وعوامل يومية.
 * كل قسم اختياري تمامًا ولا يُطلب إكماله يوميًا.
 * لا تُشخّص المنصة أي عرض ولا تستنتج أي سبب.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, Field, SectionTitle, Spinner } from '@/components/ui';
import { formatDate, formatDuration, formatHours, formatNumber, formatTime, utcToLocalInput, type NumeralSystem } from '@/lib/format';
import {
  ACTIVITY_INTENSITIES, DAILY_FACTORS, MEAL_TYPES, SLEEP_QUALITIES, SYMPTOMS, SYMPTOM_SEVERITIES, labelOf,
} from '@/lib/labels';

type Tab = 'meals' | 'activities' | 'sleep' | 'symptoms' | 'factors';

export type DailyLogData = {
  meals: Array<{ id: string; mealType: string; description: string | null; carbohydrateGrams: number | null; mealDatetime: string; notes: string | null }>;
  activities: Array<{ id: string; activityType: string; durationMinutes: number; intensity: string; activityDatetime: string; notes: string | null }>;
  sleep: Array<{ id: string; durationMinutes: number; quality: string; sleepDate: string; notes: string | null }>;
  symptoms: Array<{ id: string; symptomType: string; severity: string; symptomDatetime: string; notes: string | null }>;
  factors: Array<{ id: string; factorType: string; description: string | null; recordedAt: string }>;
};

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'meals', label: 'الوجبات' },
  { key: 'activities', label: 'النشاط البدني' },
  { key: 'sleep', label: 'النوم' },
  { key: 'symptoms', label: 'الأعراض' },
  { key: 'factors', label: 'عوامل يومية' },
];

export function DailyLogScreen({
  data, numeralSystem, timezone,
}: { data: DailyLogData; numeralSystem: NumeralSystem; timezone: string }) {
  const router = useRouter();
  const now = utcToLocalInput(new Date());
  const [tab, setTab] = useState<Tab>('meals');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: Tab; id: string; label: string } | null>(null);

  async function submit(path: string, body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await api.post(path, body);
      setInfo(successMessage);
      router.refresh();
      return true;
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setError(e.message ?? 'تعذّر الحفظ.');
      setFields(e.fields ?? {});
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await api.del(`/api/${deleteTarget.kind}/${deleteTarget.id}`);
      setInfo('تم حذف السجل.');
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">يومياتي الصحية</h1>
        <p className="mt-1 text-sm text-ink-muted">
          جميع الأقسام اختيارية — سجّل ما تراه مفيدًا فقط. لا حاجة لإكمال كل قسم يوميًا.
        </p>
      </div>

      {info ? <Alert tone="ok">{info}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setError(null); }}
            className={tab === t.key ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'meals' ? (
        <Section
          title="الوجبات"
          count={data.meals.length}
          numeralSystem={numeralSystem}
          emptyTitle="لا توجد وجبات مسجّلة بعد."
          emptyDescription="تسجيل الوجبات يساعدك على ربطها بقراءات السكر داخل التقرير."
        >
          <MealForm defaultDate={now.date} defaultTime={now.time} saving={saving} fields={fields}
            onSubmit={(body) => submit('/api/meals', body, 'تم تسجيل الوجبة.')} />
          <List>
            {data.meals.map((m) => (
              <Row
                key={m.id}
                title={labelOf('mealType', m.mealType)}
                subtitle={[
                  m.description,
                  m.carbohydrateGrams != null ? `كربوهيدرات: ${formatNumber(m.carbohydrateGrams, 1, numeralSystem)} غرام` : null,
                  m.notes,
                ].filter(Boolean).join(' — ') || 'بدون تفاصيل'}
                time={`${formatDate(m.mealDatetime, timezone, numeralSystem)} — ${formatTime(m.mealDatetime, timezone, numeralSystem)}`}
                onDelete={() => setDeleteTarget({ kind: 'meals', id: m.id, label: labelOf('mealType', m.mealType) })}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {tab === 'activities' ? (
        <Section
          title="النشاط البدني"
          count={data.activities.length}
          numeralSystem={numeralSystem}
          emptyTitle="لا يوجد نشاط بدني مسجّل بعد."
          emptyDescription="سجّل نوع النشاط ومدته وشدته لمتابعة نمطك اليومي."
        >
          <ActivityForm defaultDate={now.date} defaultTime={now.time} saving={saving} fields={fields}
            onSubmit={(body) => submit('/api/activities', body, 'تم تسجيل النشاط البدني.')} />
          <List>
            {data.activities.map((a) => (
              <Row
                key={a.id}
                title={`${a.activityType} — ${formatDuration(a.durationMinutes, numeralSystem)}`}
                subtitle={<Badge tone="teal">{labelOf('intensity', a.intensity)}</Badge>}
                note={a.notes ?? undefined}
                time={`${formatDate(a.activityDatetime, timezone, numeralSystem)} — ${formatTime(a.activityDatetime, timezone, numeralSystem)}`}
                onDelete={() => setDeleteTarget({ kind: 'activities', id: a.id, label: a.activityType })}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {tab === 'sleep' ? (
        <Section
          title="النوم"
          count={data.sleep.length}
          numeralSystem={numeralSystem}
          emptyTitle="لا يوجد سجل نوم بعد."
          emptyDescription="سجّل مدة النوم وجودته — قلة النوم قد تؤثر على قراءات السكر، وهذا ما يظهر في تقاريرك."
        >
          <SleepForm defaultDate={now.date} saving={saving} fields={fields}
            onSubmit={(body) => submit('/api/sleep', body, 'تم تسجيل النوم.')} />
          <List>
            {data.sleep.map((s) => (
              <Row
                key={s.id}
                title={formatDuration(s.durationMinutes, numeralSystem)}
                subtitle={<Badge tone="blue">{labelOf('sleepQuality', s.quality)}</Badge>}
                note={s.notes ?? undefined}
                time={formatDate(s.sleepDate, timezone, numeralSystem)}
                onDelete={() => setDeleteTarget({ kind: 'sleep', id: s.id, label: 'سجل النوم' })}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {tab === 'symptoms' ? (
        <Section
          title="الأعراض"
          count={data.symptoms.length}
          numeralSystem={numeralSystem}
          emptyTitle="لا توجد أعراض مسجّلة."
          emptyDescription="يمكنك تسجيل أي عرض تشعر به مع وقت حدوثه. المنصة لا تُشخّص السبب ولا تفسّره."
        >
          <SymptomForm defaultDate={now.date} defaultTime={now.time} saving={saving} fields={fields}
            onSubmit={(body) => submit('/api/symptoms', body, 'تم تسجيل العرض.')} />
          <List>
            {data.symptoms.map((s) => (
              <Row
                key={s.id}
                title={labelOf('symptom', s.symptomType)}
                subtitle={<Badge tone={s.severity === 'SEVERE' ? 'danger' : s.severity === 'MODERATE' ? 'warn' : 'neutral'}>
                  {labelOf('symptomSeverity', s.severity)}
                </Badge>}
                note={s.notes ?? undefined}
                time={`${formatDate(s.symptomDatetime, timezone, numeralSystem)} — ${formatTime(s.symptomDatetime, timezone, numeralSystem)}`}
                onDelete={() => setDeleteTarget({ kind: 'symptoms', id: s.id, label: labelOf('symptom', s.symptomType) })}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {tab === 'factors' ? (
        <Section
          title="عوامل يومية مؤثرة"
          count={data.factors.length}
          numeralSystem={numeralSystem}
          emptyTitle="لا توجد عوامل مسجّلة."
          emptyDescription="أيام المرض أو الضغط النفسي أو السفر قد تؤثر على القراءات — سجّلها كمرجع."
        >
          <FactorForm defaultDate={now.date} saving={saving}
            onSubmit={(body) => submit('/api/factors', body, 'تم تسجيل العامل اليومي.')} />
          <List>
            {data.factors.map((f) => (
              <Row
                key={f.id}
                title={labelOf('dailyFactor', f.factorType)}
                subtitle={f.description ?? '—'}
                time={formatDate(f.recordedAt, timezone, numeralSystem)}
                onDelete={() => setDeleteTarget({ kind: 'factors', id: f.id, label: labelOf('dailyFactor', f.factorType) })}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-pop">
            <h3 className="text-base">تأكيد الحذف</h3>
            <p className="mt-2 text-sm leading-7 text-ink-soft">
              هل أنت متأكد من حذف «{deleteTarget.label}»؟ لا يمكن التراجع عن الحذف.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>إلغاء</button>
              <button type="button" className="btn-danger btn-sm" onClick={doDelete}>نعم، احذف</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title, count, numeralSystem, emptyTitle, emptyDescription, children,
}: {
  title: string;
  count: number;
  numeralSystem: NumeralSystem;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <SectionTitle action={<span className="text-xs text-ink-muted"><span className="num">{formatNumber(count, 0, numeralSystem)}</span> سجل</span>}>
        {title}
      </SectionTitle>
      {children}
    </Card>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="mt-4 space-y-2">{children}</ul>;
}

function Row({
  title, subtitle, note, time, onDelete,
}: {
  title: string;
  subtitle?: React.ReactNode;
  note?: string;
  time: string;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50/30 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {subtitle ? <div className="mt-1 text-xs text-ink-soft">{subtitle}</div> : null}
        {note ? <p className="mt-1 text-xs text-ink-muted">{note}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-ink-muted num">{time}</span>
        <button type="button" className="btn-ghost btn-sm text-alert" onClick={onDelete}>حذف</button>
      </div>
    </li>
  );
}

/* ------------------------------- النماذج ------------------------------- */

function MealForm({ defaultDate, defaultTime, onSubmit, saving, fields }: {
  defaultDate: string; defaultTime: string; saving: boolean; fields: Record<string, string>;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({ mealType: 'BREAKFAST', description: '', carbs: '', date: defaultDate, time: defaultTime, notes: '' });
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({
        mealType: form.mealType,
        description: form.description || null,
        carbohydrateGrams: form.carbs === '' ? null : Number(form.carbs),
        mealDate: form.date,
        mealTime: form.time,
        notes: form.notes || null,
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="نوع الوجبة" required>
          <select className="field" value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value })}>
            {MEAL_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="وصف مختصر">
          <input className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="الكربوهيدرات (غرام)" hint="اختياري — لا يلزم عدّ الكربوهيدرات لكل وجبة." error={fields.carbohydrateGrams}>
          <input className="field num" inputMode="decimal" dir="ltr" value={form.carbs}
            onChange={(e) => setForm({ ...form, carbs: e.target.value })} />
        </Field>
        <Field label="التاريخ" required>
          <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <Field label="الوقت" required>
          <input type="time" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
        </Field>
        <Field label="ملاحظات">
          <input className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <button type="submit" className="btn-teal" disabled={saving}>{saving ? <Spinner /> : null} حفظ الوجبة</button>
    </form>
  );
}

function ActivityForm({ defaultDate, defaultTime, onSubmit, saving, fields }: {
  defaultDate: string; defaultTime: string; saving: boolean; fields: Record<string, string>;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({ type: '', minutes: '30', intensity: 'MODERATE', date: defaultDate, time: defaultTime, notes: '' });
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({
        activityType: form.type,
        durationMinutes: Number(form.minutes),
        intensity: form.intensity,
        activityDate: form.date,
        activityTime: form.time,
        notes: form.notes || null,
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="نوع النشاط" required error={fields.activityType}>
          <input className={`field ${fields.activityType ? 'field-error' : ''}`} value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="المشي، الجري، السباحة…" required />
        </Field>
        <Field label="المدة (دقيقة)" required error={fields.durationMinutes}>
          <input className={`field num ${fields.durationMinutes ? 'field-error' : ''}`} type="number" min={1} max={1440} dir="ltr"
            value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} required />
        </Field>
        <Field label="الشدة" required>
          <select className="field" value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })}>
            {ACTIVITY_INTENSITIES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </Field>
        <Field label="التاريخ" required>
          <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <Field label="الوقت" required>
          <input type="time" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
        </Field>
        <Field label="ملاحظات">
          <input className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <button type="submit" className="btn-teal" disabled={saving}>{saving ? <Spinner /> : null} حفظ النشاط</button>
    </form>
  );
}

function SleepForm({ defaultDate, onSubmit, saving, fields }: {
  defaultDate: string; saving: boolean; fields: Record<string, string>;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({ hours: '7', minutes: '30', quality: 'GOOD', date: defaultDate, notes: '' });
  const totalMinutes = Number(form.hours || 0) * 60 + Number(form.minutes || 0);
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ durationMinutes: totalMinutes, quality: form.quality, sleepDate: form.date, notes: form.notes || null });
    }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="عدد الساعات" required error={fields.durationMinutes}>
          <input className="field num" type="number" min={0} max={24} dir="ltr" value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })} required />
        </Field>
        <Field label="الدقائق الإضافية">
          <input className="field num" type="number" min={0} max={59} dir="ltr" value={form.minutes}
            onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
        </Field>
        <Field label="جودة النوم">
          <select className="field" value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })}>
            {SLEEP_QUALITIES.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
        </Field>
        <Field label="تاريخ النوم" required>
          <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <Field label="ملاحظات">
          <input className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs text-ink-muted">
        المدة المسجّلة: <span className="font-bold">{formatHours(totalMinutes)}</span>
      </p>
      <button type="submit" className="btn-teal" disabled={saving}>{saving ? <Spinner /> : null} حفظ سجل النوم</button>
    </form>
  );
}

function SymptomForm({ defaultDate, defaultTime, onSubmit, saving, fields }: {
  defaultDate: string; defaultTime: string; saving: boolean; fields: Record<string, string>;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({ type: 'DIZZINESS', severity: 'MILD', date: defaultDate, time: defaultTime, notes: '' });
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({
        symptomType: form.type, severity: form.severity,
        symptomDate: form.date, symptomTime: form.time, notes: form.notes || null,
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="العرض" required>
          <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {SYMPTOMS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="الشدّة" required>
          <select className="field" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            {SYMPTOM_SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="التاريخ" required>
          <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <Field label="الوقت" required>
          <input type="time" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
        </Field>
        <Field label="ملاحظات">
          <input className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs leading-6 text-ink-muted">
        لا تُشخّص المنصة سبب الأعراض. إذا كانت الأعراض شديدة أو مستمرة، راجع الطبيب أو أقرب خدمة طوارئ.
      </p>
      <button type="submit" className="btn-teal" disabled={saving}>{saving ? <Spinner /> : null} حفظ العرض</button>
    </form>
  );
}

function FactorForm({ defaultDate, onSubmit, saving }: {
  defaultDate: string; saving: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({ type: 'ILLNESS', description: '', date: defaultDate });
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ factorType: form.type, description: form.description || null, factorDate: form.date });
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="نوع العامل" required>
          <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {DAILY_FACTORS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="وصف مختصر">
          <input className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="التاريخ" required>
          <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
      </div>
      <button type="submit" className="btn-teal" disabled={saving}>{saving ? <Spinner /> : null} حفظ العامل</button>
    </form>
  );
}
