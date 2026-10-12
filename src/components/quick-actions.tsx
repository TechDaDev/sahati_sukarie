'use client';
/**
 * أزرار الإضافة السريعة في لوحة المتابعة.
 * كل زر يفتح نموذجًا مصغّرًا يعمل فعليًا على الخادم (وليس رابطًا فقط).
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Field, Icons, Spinner } from '@/components/ui';
import { utcToLocalInput } from '@/lib/format';
import { ACTIVITY_INTENSITIES, GLUCOSE_UNITS, MEAL_TYPES, MEASUREMENT_CONTEXTS } from '@/lib/labels';

type Kind = 'glucose' | 'dose' | 'meal' | 'activity' | null;

type MedicationOption = { id: string; name: string; doseUnit: string | null; prescribedDose: number | null };

export function QuickActions({ medications = [] }: { medications?: MedicationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Kind>(null);
  const now = utcToLocalInput(new Date());

  const buttons: Array<{ kind: Exclude<Kind, null>; label: string }> = [
    { kind: 'glucose', label: 'إضافة قياس سكر' },
    { kind: 'dose', label: 'تسجيل دواء' },
    { kind: 'meal', label: 'تسجيل وجبة' },
    { kind: 'activity', label: 'تسجيل نشاط بدني' },
  ];

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {buttons.map((b) => (
          <button
            key={b.kind}
            type="button"
            onClick={() => setOpen(open === b.kind ? null : b.kind)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
              open === b.kind ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-brand-200 bg-white text-ink-soft hover:bg-brand-50'
            }`}
          >
            {Icons.plus} {b.label}
          </button>
        ))}
      </div>

      {open ? (
        <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
          {open === 'glucose' ? <QuickGlucose defaultDate={now.date} defaultTime={now.time} onDone={() => { setOpen(null); router.refresh(); }} /> : null}
          {open === 'dose' ? <QuickDose medications={medications} defaultDate={now.date} defaultTime={now.time} onDone={() => { setOpen(null); router.refresh(); }} /> : null}
          {open === 'meal' ? <QuickMeal defaultDate={now.date} defaultTime={now.time} onDone={() => { setOpen(null); router.refresh(); }} /> : null}
          {open === 'activity' ? <QuickActivity defaultDate={now.date} defaultTime={now.time} onDone={() => { setOpen(null); router.refresh(); }} /> : null}
          <div className="mt-3 flex justify-end">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(null)}>إغلاق</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function useSubmit(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function submit(path: string, body: Record<string, unknown>, confirmable = false) {
    setLoading(true);
    setError(null);
    try {
      await api.post(path, body);
      onDone();
    } catch (err) {
      const e = err as { message?: string; code?: string; fields?: Record<string, string> };
      if (e.code === 'CONFIRM_REQUIRED' && confirmable) {
        setNeedsConfirm(true);
        setError(e.message ?? null);
      } else {
        setError(e.message ?? 'تعذّر الحفظ.');
      }
      setFields(e.fields ?? {});
    } finally {
      setLoading(false);
    }
  }

  return { submit, error, fields, loading, needsConfirm, reset: () => { setNeedsConfirm(false); setError(null); } };
}

function QuickGlucose({ defaultDate, defaultTime, onDone }: { defaultDate: string; defaultTime: string; onDone: () => void }) {
  const [form, setForm] = useState({ value: '', unit: 'MG_DL', date: defaultDate, time: defaultTime, context: 'FASTING' });
  const { submit, error, fields, loading, needsConfirm, reset } = useSubmit(onDone);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit('/api/glucose', {
          glucoseValue: Number(form.value),
          glucoseUnit: form.unit,
          measurementDate: form.date,
          measurementTime: form.time,
          measurementContext: form.context,
          confirmedUnusual: needsConfirm,
        }, true).catch(() => undefined);
      }}
    >
      <p className="text-sm font-bold text-ink">قياس سكر جديد</p>
      {error ? <Alert tone="warn">{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="القيمة" required error={fields.glucoseValue}>
          <input className="field num" inputMode="decimal" value={form.value} required
            onChange={(e) => { reset(); setForm({ ...form, value: e.target.value }); }} placeholder="120" dir="ltr" />
        </Field>
        <Field label="الوحدة" required>
          <select className="field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            {GLUCOSE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </Field>
        <Field label="التاريخ" required>
          <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <Field label="الوقت" required>
          <input type="time" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
        </Field>
        <Field label="سياق القياس" required>
          <select className="field" value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })}>
            {MEASUREMENT_CONTEXTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <button type="submit" className="btn-teal" disabled={loading}>
        {loading ? <Spinner /> : null} {needsConfirm ? 'تأكيد وحفظ' : 'حفظ القياس'}
      </button>
      <p className="text-[11px] text-ink-muted">
        لإضافة أعراض أو ملاحظات أو وقت الأكل، استخدم صفحة القياسات الكاملة.
      </p>
    </form>
  );
}

function QuickDose({ medications, defaultDate, defaultTime, onDone }: {
  medications: MedicationOption[]; defaultDate: string; defaultTime: string; onDone: () => void;
}) {
  const [form, setForm] = useState({ medicationId: medications[0]?.id ?? '', dose: '', status: 'TAKEN', date: defaultDate, time: defaultTime });
  const { submit, error, loading } = useSubmit(onDone);

  if (!medications.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-bold text-ink">تسجيل جرعة دواء</p>
        <Alert tone="warn">
          لا توجد أدوية مسجّلة حاليًا. أضف دواءً أولًا في صفحة «أدويتي» ثم يمكنك تسجيل الجرعات الفعلية.
        </Alert>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      submit('/api/administrations', {
        medicationId: form.medicationId,
        actualDose: form.dose ? Number(form.dose) : null,
        administrationDate: form.date,
        administrationTime: form.time,
        status: form.status,
      });
    }}>
      <p className="text-sm font-bold text-ink">تسجيل جرعة فعلية</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الدواء" required>
          <select className="field" value={form.medicationId} onChange={(e) => setForm({ ...form, medicationId: e.target.value })} required>
            {medications.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="الجرعة الفعلية" hint="اتركه فارغًا إن لم ترغب بتحديدها.">
          <input className="field num" inputMode="decimal" value={form.dose} dir="ltr"
            onChange={(e) => setForm({ ...form, dose: e.target.value })} />
        </Field>
        <Field label="الحالة" required>
          <select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="TAKEN">تم تناوله</option>
            <option value="MISSED">فائت</option>
            <option value="DELAYED">تم تأجيله</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="التاريخ" required>
            <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="الوقت" required>
            <input type="time" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
          </Field>
        </div>
      </div>
      <button type="submit" className="btn-teal" disabled={loading}>{loading ? <Spinner /> : null} حفظ الجرعة</button>
    </form>
  );
}

function QuickMeal({ defaultDate, defaultTime, onDone }: { defaultDate: string; defaultTime: string; onDone: () => void }) {
  const [form, setForm] = useState({ mealType: 'BREAKFAST', description: '', carbs: '', date: defaultDate, time: defaultTime });
  const { submit, error, loading } = useSubmit(onDone);

  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      submit('/api/meals', {
        mealType: form.mealType,
        description: form.description || null,
        carbohydrateGrams: form.carbs ? Number(form.carbs) : null,
        mealDate: form.date,
        mealTime: form.time,
      });
    }}>
      <p className="text-sm font-bold text-ink">تسجيل وجبة</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نوع الوجبة" required>
          <select className="field" value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value })}>
            {MEAL_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="وصف مختصر">
          <input className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="مثال: خبز وبيض وجبن" />
        </Field>
        <Field label="الكربوهيدرات (غرام)" hint="اختياري — اتركه فارغًا إن لم تكن متأكدًا.">
          <input className="field num" inputMode="decimal" dir="ltr" value={form.carbs}
            onChange={(e) => setForm({ ...form, carbs: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="التاريخ" required>
            <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="الوقت" required>
            <input type="time" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
          </Field>
        </div>
      </div>
      <button type="submit" className="btn-teal" disabled={loading}>{loading ? <Spinner /> : null} حفظ الوجبة</button>
    </form>
  );
}

function QuickActivity({ defaultDate, defaultTime, onDone }: { defaultDate: string; defaultTime: string; onDone: () => void }) {
  const [form, setForm] = useState({ type: 'المشي', minutes: '30', intensity: 'MODERATE', date: defaultDate, time: defaultTime });
  const { submit, error, fields, loading } = useSubmit(onDone);

  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      submit('/api/activities', {
        activityType: form.type,
        durationMinutes: Number(form.minutes),
        intensity: form.intensity,
        activityDate: form.date,
        activityTime: form.time,
      });
    }}>
      <p className="text-sm font-bold text-ink">تسجيل نشاط بدني</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نوع النشاط" required error={fields.activityType}>
          <input className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="المشي، السباحة…" required />
        </Field>
        <Field label="المدة (دقيقة)" required error={fields.durationMinutes}>
          <input className="field num" type="number" min={1} max={1440} dir="ltr" value={form.minutes}
            onChange={(e) => setForm({ ...form, minutes: e.target.value })} required />
        </Field>
        <Field label="الشدة" required>
          <select className="field" value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })}>
            {ACTIVITY_INTENSITIES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="التاريخ" required>
            <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="الوقت" required>
            <input type="time" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
          </Field>
        </div>
      </div>
      <button type="submit" className="btn-teal" disabled={loading}>{loading ? <Spinner /> : null} حفظ النشاط</button>
    </form>
  );
}
