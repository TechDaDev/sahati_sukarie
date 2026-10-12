'use client';
/**
 * شاشة أدويتي — تفصل تمامًا بين:
 *  1) خطة الدواء الموصوف (ما ذكره المريض عن علاجه).
 *  2) سجل الجرعات الفعلية (ما تناوله فعلًا، أو فات، أو أُجّل).
 * لا تُقترح أي جرعة تلقائيًا، وتعديل الخطة لا يغيّر السجل التاريخي.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, Field, SectionTitle, Spinner } from '@/components/ui';
import { formatDate, formatNumber, formatTime, utcToLocalInput, type NumeralSystem } from '@/lib/format';
import {
  ADMINISTRATION_STATUSES, DOSE_UNITS, FREQUENCIES, INSULIN_FORMULATIONS, MEDICATION_CATEGORIES,
  ROUTES, labelOf,
} from '@/lib/labels';

export type Medication = {
  id: string;
  medicationName: string;
  category: string;
  strength: number | null;
  strengthUnit: string | null;
  prescribedDose: number | null;
  doseUnit: string | null;
  route: string;
  frequency: string;
  usualTime: string | null;
  startDate: string | null;
  endDate: string | null;
  prescriberName: string | null;
  insulinFormulation: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'INACTIVE';
};

export type Administration = {
  id: string;
  medicationId: string;
  medicationName: string;
  actualDose: number | null;
  doseUnit: string | null;
  administrationDatetime: string;
  status: string;
  notes: string | null;
};

type MedForm = {
  id: string | null;
  medicationName: string;
  category: string;
  strength: string;
  strengthUnit: string;
  prescribedDose: string;
  doseUnit: string;
  route: string;
  frequency: string;
  usualTime: string;
  startDate: string;
  endDate: string;
  prescriberName: string;
  insulinFormulation: string;
  notes: string;
  status: 'ACTIVE' | 'INACTIVE';
};

const emptyMed: MedForm = {
  id: null, medicationName: '', category: 'BIGUANIDE', strength: '', strengthUnit: 'MG',
  prescribedDose: '', doseUnit: 'MG', route: 'ORAL', frequency: 'ONCE_DAILY', usualTime: '',
  startDate: '', endDate: '', prescriberName: '', insulinFormulation: '', notes: '', status: 'ACTIVE',
};

export function MedicationsScreen({
  medications, administrations, numeralSystem, timezone,
}: {
  medications: Medication[];
  administrations: Administration[];
  numeralSystem: NumeralSystem;
  timezone: string;
}) {
  const router = useRouter();
  const now = utcToLocalInput(new Date());
  const [tab, setTab] = useState<'plan' | 'log'>('plan');
  const [form, setForm] = useState<MedForm>(emptyMed);
  const [showForm, setShowForm] = useState(false);

  const [logForm, setLogForm] = useState({
    medicationId: medications.find((m) => m.status === 'ACTIVE')?.id ?? '',
    actualDose: '', doseUnit: '', status: 'TAKEN', date: now.date, time: now.time, notes: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Medication | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Medication | null>(null);

  const activeMedications = medications.filter((m) => m.status === 'ACTIVE');

  function startAdd() {
    setForm(emptyMed);
    setShowForm(true);
    setError(null);
    setFields({});
  }

  function startEdit(m: Medication) {
    setForm({
      id: m.id,
      medicationName: m.medicationName,
      category: m.category,
      strength: m.strength != null ? String(m.strength) : '',
      strengthUnit: m.strengthUnit ?? '',
      prescribedDose: m.prescribedDose != null ? String(m.prescribedDose) : '',
      doseUnit: m.doseUnit ?? '',
      route: m.route,
      frequency: m.frequency,
      usualTime: m.usualTime ? m.usualTime.slice(0, 5) : '',
      startDate: m.startDate ?? '',
      endDate: m.endDate ?? '',
      prescriberName: m.prescriberName ?? '',
      insulinFormulation: m.insulinFormulation ?? '',
      notes: m.notes ?? '',
      status: m.status,
    });
    setShowForm(true);
    setTab('plan');
    setError(null);
  }

  async function saveMedication(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    setSaving(true);
    const payload = {
      medicationName: form.medicationName,
      category: form.category,
      strength: form.strength === '' ? null : Number(form.strength),
      strengthUnit: form.strengthUnit || null,
      prescribedDose: form.prescribedDose === '' ? null : Number(form.prescribedDose),
      doseUnit: form.doseUnit || null,
      route: form.route,
      frequency: form.frequency,
      usualTime: form.usualTime || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      prescriberName: form.prescriberName || null,
      insulinFormulation: form.insulinFormulation || null,
      notes: form.notes || null,
      status: form.status,
    };
    try {
      if (form.id) {
        await api.patch(`/api/medications/${form.id}`, payload);
        setInfo('تم تحديث الدواء. سجل الجرعات السابقة لم يتغيّر.');
      } else {
        await api.post('/api/medications', payload);
        setInfo('تمت إضافة الدواء إلى خطتك. يمكنك الآن تسجيل الجرعات الفعلية.');
      }
      setForm(emptyMed);
      setShowForm(false);
      router.refresh();
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setError(e.message ?? 'تعذّر حفظ الدواء.');
      setFields(e.fields ?? {});
    } finally {
      setSaving(false);
    }
  }

  async function saveAdministration(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    setSaving(true);
    try {
      await api.post('/api/administrations', {
        medicationId: logForm.medicationId,
        actualDose: logForm.actualDose === '' ? null : Number(logForm.actualDose),
        doseUnit: logForm.doseUnit || null,
        administrationDate: logForm.date,
        administrationTime: logForm.time,
        status: logForm.status,
        notes: logForm.notes || null,
      });
      setInfo('تم تسجيل الجرعة الفعلية.');
      setLogForm({ ...logForm, actualDose: '', notes: '' });
      router.refresh();
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setError(e.message ?? 'تعذّر تسجيل الجرعة.');
      setFields(e.fields ?? {});
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await api.del(`/api/medications/${deleteTarget.id}`);
      setInfo('تم حذف الدواء.');
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeleteTarget(null);
    }
  }

  async function doDeactivate() {
    if (!deactivateTarget) return;
    try {
      await api.patch(`/api/medications/${deactivateTarget.id}`, {
        medicationName: deactivateTarget.medicationName,
        category: deactivateTarget.category,
        strength: deactivateTarget.strength,
        strengthUnit: deactivateTarget.strengthUnit,
        prescribedDose: deactivateTarget.prescribedDose,
        doseUnit: deactivateTarget.doseUnit,
        route: deactivateTarget.route,
        frequency: deactivateTarget.frequency,
        usualTime: deactivateTarget.usualTime ? deactivateTarget.usualTime.slice(0, 5) : null,
        startDate: deactivateTarget.startDate,
        endDate: deactivateTarget.endDate,
        prescriberName: deactivateTarget.prescriberName,
        insulinFormulation: deactivateTarget.insulinFormulation,
        notes: deactivateTarget.notes,
        status: 'INACTIVE',
      });
      setInfo('تم تعطيل الدواء. سجلات الجرعات السابقة محفوظة كما هي.');
      setDeactivateTarget(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeactivateTarget(null);
    }
  }

  const isInsulin = form.category === 'INSULIN';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">أدويتي</h1>
        <p className="mt-1 text-sm text-ink-muted">
          خطتك الدوائية وسجل الجرعات منفصلان تمامًا. المنصة لا تحسب الجرعات ولا تعدّل أي علاج.
        </p>
      </div>

      {info ? <Alert tone="ok">{info}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex gap-2">
        <button type="button" className={tab === 'plan' ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setTab('plan')}>
          خطة الأدوية ({formatNumber(medications.length, 0, numeralSystem)})
        </button>
        <button type="button" className={tab === 'log' ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setTab('log')}>
          سجل الجرعات الفعلية ({formatNumber(administrations.length, 0, numeralSystem)})
        </button>
      </div>

      {tab === 'plan' ? (
        <>
          <Card>
            <SectionTitle
              action={
                <button type="button" className="btn-teal btn-sm" onClick={() => (showForm ? setShowForm(false) : startAdd())}>
                  {showForm ? 'إخفاء النموذج' : 'إضافة دواء'}
                </button>
              }
            >
              {form.id ? 'تعديل دواء' : 'إضافة دواء إلى الخطة'}
            </SectionTitle>

            {showForm ? (
              <form onSubmit={saveMedication} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="اسم الدواء" required error={fields.medicationName}>
                    <input className={`field ${fields.medicationName ? 'field-error' : ''}`} value={form.medicationName}
                      onChange={(e) => setForm({ ...form, medicationName: e.target.value })} placeholder="مثال: ميتفورمين" required />
                  </Field>
                  <Field label="تصنيف الدواء" required>
                    <select className="field" value={form.category}
                      onChange={(e) => {
                        const category = e.target.value;
                        setForm({
                          ...form,
                          category,
                          doseUnit: category === 'INSULIN' ? 'UNIT' : form.doseUnit || 'MG',
                          route: category === 'INSULIN' ? 'SUBCUTANEOUS' : form.route,
                          insulinFormulation: category === 'INSULIN' ? form.insulinFormulation : '',
                        });
                      }}>
                      {MEDICATION_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </Field>
                  <Field label="التكرار" required>
                    <select className="field" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                      {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </Field>

                  <Field label="تركيز / قوة الدواء" hint="مثال: 500 ملغم للقرص، أو 100 وحدة/مل للأنسولين.">
                    <div className="flex gap-2">
                      <input className="field num" inputMode="decimal" dir="ltr" value={form.strength}
                        onChange={(e) => setForm({ ...form, strength: e.target.value })} />
                      <select className="field w-32" value={form.strengthUnit}
                        onChange={(e) => setForm({ ...form, strengthUnit: e.target.value })}>
                        <option value="">—</option>
                        {DOSE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </div>
                  </Field>

                  <Field label="الجرعة الموصوفة" error={fields.prescribedDose}
                    hint="الجرعة كما وصفها الطبيب — وهي منفصلة عن الجرعة الفعلية المسجّلة.">
                    <div className="flex gap-2">
                      <input className={`field num ${fields.prescribedDose ? 'field-error' : ''}`} inputMode="decimal" dir="ltr"
                        value={form.prescribedDose} onChange={(e) => setForm({ ...form, prescribedDose: e.target.value })} />
                      <select className="field w-32" value={form.doseUnit} onChange={(e) => setForm({ ...form, doseUnit: e.target.value })}>
                        <option value="">—</option>
                        {DOSE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </div>
                  </Field>

                  <Field label="طريقة الإعطاء" required>
                    <select className="field" value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>
                      {ROUTES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </Field>

                  <Field label="وقت الإعطاء المعتاد">
                    <input type="time" className="field" value={form.usualTime} onChange={(e) => setForm({ ...form, usualTime: e.target.value })} />
                  </Field>
                  <Field label="تاريخ البدء">
                    <input type="date" className="field" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                  </Field>
                  <Field label="تاريخ الانتهاء (إن وُجد)" error={fields.endDate}>
                    <input type="date" className={`field ${fields.endDate ? 'field-error' : ''}`} value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                  </Field>

                  <Field label="اسم الطبيب الواصف (اختياري)">
                    <input className="field" value={form.prescriberName} onChange={(e) => setForm({ ...form, prescriberName: e.target.value })} />
                  </Field>

                  <Field label="حالة الدواء" required>
                    <select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}>
                      <option value="ACTIVE">نشط</option>
                      <option value="INACTIVE">متوقف</option>
                    </select>
                  </Field>

                  {isInsulin ? (
                    <Field label="نوع تركيبة الأنسولين" hint="للأنسولين فقط.">
                      <select className="field" value={form.insulinFormulation}
                        onChange={(e) => setForm({ ...form, insulinFormulation: e.target.value })}>
                        <option value="">—</option>
                        {INSULIN_FORMULATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </Field>
                  ) : null}

                  <Field label="ملاحظات">
                    <textarea rows={2} className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" className="btn-teal" disabled={saving}>
                    {saving ? <Spinner /> : null} {form.id ? 'حفظ التعديل' : 'حفظ الدواء'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => { setForm(emptyMed); setShowForm(false); }}>
                    إلغاء
                  </button>
                  <span className="text-xs text-ink-muted">
                    ⚠ لا تُقدّم المنصة أي اقتراح للجرعات؛ تُسجَّل البيانات كما وردت من الطبيب أو المريض.
                  </span>
                </div>
              </form>
            ) : null}
          </Card>

          {medications.length === 0 ? (
            <EmptyState
              title="لا توجد أدوية مسجلة حاليًا."
              description="أضف أدويتك كما وصفها الطبيب لتتمكن من متابعة الالتزام وتسجيل الجرعات الفعلية."
              actionLabel="إضافة دواء"
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {medications.map((m) => (
                <Card key={m.id} className={m.status === 'INACTIVE' ? 'opacity-80' : ''}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base">{m.medicationName}</h3>
                      <p className="mt-1 text-xs text-ink-muted">{labelOf('medicationCategory', m.category)}</p>
                    </div>
                    <Badge tone={m.status === 'ACTIVE' ? 'ok' : 'neutral'}>
                      {labelOf('medicationStatus', m.status)}
                    </Badge>
                  </div>

                  <dl className="mt-3 space-y-1.5 text-sm">
                    <Row label="التركيز">{m.strength != null
                      ? <span className="num">{formatNumber(m.strength, 0, numeralSystem)} {labelOf('doseUnit', m.strengthUnit)}</span>
                      : '—'}</Row>
                    <Row label="الجرعة الموصوفة">{m.prescribedDose != null
                      ? <span className="num">{formatNumber(m.prescribedDose, 0, numeralSystem)} {labelOf('doseUnit', m.doseUnit)}</span>
                      : '—'}</Row>
                    <Row label="التكرار">{labelOf('frequency', m.frequency)}</Row>
                    <Row label="طريقة الإعطاء">{labelOf('route', m.route)}</Row>
                    <Row label="الوقت المعتاد">{m.usualTime ? <span className="num">{m.usualTime.slice(0, 5)}</span> : '—'}</Row>
                    <Row label="الفترة">{m.startDate || m.endDate
                      ? <span className="num">{m.startDate ? formatDate(m.startDate, timezone, numeralSystem) : '—'} → {m.endDate ? formatDate(m.endDate, timezone, numeralSystem) : 'مستمر'}</span>
                      : '—'}</Row>
                    {m.insulinFormulation ? <Row label="تركيبة الأنسولين">{m.insulinFormulation}</Row> : null}
                    {m.prescriberName ? <Row label="الطبيب الواصف">{m.prescriberName}</Row> : null}
                    {m.notes ? <Row label="ملاحظات">{m.notes}</Row> : null}
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn-outline btn-sm" onClick={() => startEdit(m)}>تعديل</button>
                    {m.status === 'ACTIVE' ? (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setDeactivateTarget(m)}>تعطيل الدواء</button>
                    ) : null}
                    <button type="button" className="btn-ghost btn-sm text-alert" onClick={() => setDeleteTarget(m)}>حذف</button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Card>
            <SectionTitle>تسجيل جرعة فعلية</SectionTitle>
            {activeMedications.length === 0 ? (
              <Alert tone="warn">
                لا توجد أدوية نشطة في خطتك. أضف دواءً أولًا من تبويب «خطة الأدوية» ثم عُد لتسجيل الجرعات.
              </Alert>
            ) : (
              <form onSubmit={saveAdministration} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="الدواء" required>
                    <select className="field" value={logForm.medicationId} required
                      onChange={(e) => setLogForm({ ...logForm, medicationId: e.target.value })}>
                      {activeMedications.map((m) => <option key={m.id} value={m.id}>{m.medicationName}</option>)}
                    </select>
                  </Field>
                  <Field label="الجرعة الفعلية" hint="اختياري — سجّل ما تناولته فعلًا.">
                    <div className="flex gap-2">
                      <input className="field num" inputMode="decimal" dir="ltr" value={logForm.actualDose}
                        onChange={(e) => setLogForm({ ...logForm, actualDose: e.target.value })} />
                      <select className="field w-32" value={logForm.doseUnit} onChange={(e) => setLogForm({ ...logForm, doseUnit: e.target.value })}>
                        <option value="">افتراضي</option>
                        {DOSE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </div>
                  </Field>
                  <Field label="الحالة" required>
                    <select className="field" value={logForm.status} onChange={(e) => setLogForm({ ...logForm, status: e.target.value })}>
                      {ADMINISTRATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </Field>
                  <Field label="التاريخ" required>
                    <input type="date" className="field" value={logForm.date} required
                      onChange={(e) => setLogForm({ ...logForm, date: e.target.value })} />
                  </Field>
                  <Field label="الوقت" required>
                    <input type="time" className="field" value={logForm.time} required
                      onChange={(e) => setLogForm({ ...logForm, time: e.target.value })} />
                  </Field>
                  <Field label="ملاحظات">
                    <input className="field" value={logForm.notes} onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })} />
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" className="btn-teal" disabled={saving}>{saving ? <Spinner /> : null} حفظ الجرعة</button>
                  <span className="text-xs text-ink-muted">
                    الحالة «فائت» تُسجَّل فقط عندما تختارها أنت — غياب التسجيل لا يُعتبر جرعة فائتة.
                  </span>
                </div>
              </form>
            )}
          </Card>

          <Card>
            <SectionTitle>سجل الجرعات الفعلية</SectionTitle>
            {administrations.length === 0 ? (
              <EmptyState
                title="لا توجد جرعات مسجّلة بعد."
                description="سجّل الأدوية التي تناولتها فعليًا لتظهر في تقرير الالتزام الطبي."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-brand-100 text-right text-xs text-ink-muted">
                      <th className="px-2 py-2 font-semibold">التاريخ والوقت</th>
                      <th className="px-2 py-2 font-semibold">الدواء</th>
                      <th className="px-2 py-2 font-semibold">الجرعة الفعلية</th>
                      <th className="px-2 py-2 font-semibold">الحالة</th>
                      <th className="px-2 py-2 font-semibold">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {administrations.map((a) => (
                      <tr key={a.id} className="border-b border-brand-50">
                        <td className="px-2 py-2.5 text-xs">
                          <span className="num">{formatDate(a.administrationDatetime, timezone, numeralSystem)}</span>
                          <span className="block num text-ink-muted">{formatTime(a.administrationDatetime, timezone, numeralSystem)}</span>
                        </td>
                        <td className="px-2 py-2.5 font-semibold">{a.medicationName}</td>
                        <td className="px-2 py-2.5 num">{a.actualDose != null
                          ? `${formatNumber(a.actualDose, 0, numeralSystem)} ${labelOf('doseUnit', a.doseUnit)}`
                          : '—'}</td>
                        <td className="px-2 py-2.5">
                          <Badge tone={a.status === 'TAKEN' ? 'ok' : a.status === 'MISSED' ? 'danger' : 'warn'}>
                            {labelOf('administrationStatus', a.status)}
                          </Badge>
                        </td>
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            className="btn-ghost btn-sm text-alert"
                            onClick={async () => {
                              try {
                                await api.del(`/api/administrations/${a.id}`);
                                setInfo('تم حذف سجل الجرعة.');
                                router.refresh();
                              } catch (err) {
                                setError((err as Error).message);
                              }
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
            )}
          </Card>
        </>
      )}

      {deleteTarget ? (
        <Modal
          title="حذف دواء"
          body={`سيتم حذف «${deleteTarget.medicationName}» من خطتك. لا يمكن الحذف إذا كانت هناك جرعات مسجّلة مرتبطة به — في هذه الحالة استخدم خيار التعطيل للحفاظ على السجل.`}
          confirmLabel="نعم، احذف الدواء"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={doDelete}
        />
      ) : null}

      {deactivateTarget ? (
        <Modal
          title="تعطيل دواء"
          body={`سيتم تعطيل «${deactivateTarget.medicationName}» وستبقى جميع الجرعات المسجّلة سابقًا كما هي. هل تريد المتابعة؟`}
          confirmLabel="نعم، عطّل الدواء"
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={doDeactivate}
          tone="warn"
        />
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-left font-semibold text-ink">{children}</dd>
    </div>
  );
}

export function Modal({
  title, body, confirmLabel, onCancel, onConfirm, tone = 'danger',
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: 'danger' | 'warn';
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-pop">
        <h3 className="text-base">{title}</h3>
        <p className="mt-2 text-sm leading-7 text-ink-soft">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>إلغاء</button>
          <button type="button" className={tone === 'danger' ? 'btn-danger btn-sm' : 'btn-teal btn-sm'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
