'use client';
/**
 * الإعدادات: بيانات التواصل، كلمة المرور، وحدة السكر، نظام الأرقام،
 * معلومات الخصوصية، وتسجيل الخروج.
 * تغيير الرقم الوطني لا يمكن إجراؤه مباشرة — يتطلب عملية تصحيح مضبوطة مع الإدارة.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert, Badge, Card, Field, SectionTitle, Spinner } from '@/components/ui';
import { GLUCOSE_UNITS } from '@/lib/labels';

export function SettingsScreen({
  email, phone, nationalIdMasked, phoneVerified, preferredUnit, numeralSystem, mustChangePassword,
}: {
  email: string;
  phone: string;
  nationalIdMasked: string;
  phoneVerified: boolean;
  preferredUnit: 'MG_DL' | 'MMOL_L';
  numeralSystem: 'LATIN' | 'ARABIC_INDIC';
  mustChangePassword: boolean;
}) {
  const router = useRouter();
  const [contact, setContact] = useState({ email, phone, preferredGlucoseUnit: preferredUnit, numeralSystem });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [contactMsg, setContactMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function saveContact(event: React.FormEvent) {
    event.preventDefault();
    setSavingContact(true);
    setContactMsg(null);
    setFields({});
    try {
      await api.patch('/api/settings/contact', {
        email: contact.email !== email ? contact.email : undefined,
        phone: contact.phone !== phone ? contact.phone : undefined,
        preferredGlucoseUnit: contact.preferredGlucoseUnit,
        numeralSystem: contact.numeralSystem,
      });
      setContactMsg({ tone: 'ok', text: 'تم تحديث الإعدادات. أي تغيير في البريد أو الهاتف يُسجَّل في سجل التدقيق.' });
      router.refresh();
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setFields(e.fields ?? {});
      setContactMsg({ tone: 'danger', text: e.message ?? 'تعذّر التحديث.' });
    } finally {
      setSavingContact(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordMsg(null);
    setFields({});
    try {
      await api.post('/api/auth/change-password', password);
      setPasswordMsg({ tone: 'ok', text: 'تم تغيير كلمة المرور. تم إنهاء الجلسات الأخرى على الأجهزة الأخرى.' });
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setFields(e.fields ?? {});
      setPasswordMsg({ tone: 'danger', text: e.message ?? 'تعذّر تغيير كلمة المرور.' });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">الإعدادات</h1>
        <p className="mt-1 text-sm text-ink-muted">إدارة بيانات التواصل، الأمان، وتفضيلات العرض.</p>
      </div>

      {mustChangePassword ? (
        <Alert tone="warn" title="مطلوب تغيير كلمة المرور">
          يرجى تغيير كلمة المرور الحالية قبل متابعة استخدام المنصة.
        </Alert>
      ) : null}

      <Card>
        <SectionTitle>بيانات التواصل وتفضيلات العرض</SectionTitle>
        <form onSubmit={saveContact} className="space-y-4" noValidate>
          {contactMsg ? <Alert tone={contactMsg.tone}>{contactMsg.text}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="البريد الإلكتروني" htmlFor="email" error={fields.email}
              hint="تغييره يُسجَّل في سجل التدقيق، ولا يوجد تحقق إلكتروني للبريد في هذه النسخة.">
              <input id="email" type="email" dir="ltr" className={`field ${fields.email ? 'field-error' : ''}`}
                value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </Field>

            <Field label="رقم الهاتف" htmlFor="phone" error={fields.phone}
              hint="يُستخدم فقط للتواصل بخصوص استعادة كلمة المرور.">
              <input id="phone" type="tel" dir="ltr" className={`field ${fields.phone ? 'field-error' : ''}`}
                value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </Field>

            <Field label="وحدة عرض السكر المفضلة" hint="التخزين الداخلي موحّد، والتغيير يؤثر على العرض فقط.">
              <select className="field" value={contact.preferredGlucoseUnit}
                onChange={(e) => setContact({ ...contact, preferredGlucoseUnit: e.target.value as 'MG_DL' | 'MMOL_L' })}>
                {GLUCOSE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </Field>

            <Field label="نظام الأرقام" hint="يمكنك اختيار الأرقام العربية-الهندية (١٢٣) أو اللاتينية (123).">
              <select className="field" value={contact.numeralSystem}
                onChange={(e) => setContact({ ...contact, numeralSystem: e.target.value as 'LATIN' | 'ARABIC_INDIC' })}>
                <option value="LATIN">أرقام لاتينية (123)</option>
                <option value="ARABIC_INDIC">أرقام عربية-هندية (١٢٣)</option>
              </select>
            </Field>
          </div>

          <button type="submit" className="btn-teal" disabled={savingContact}>
            {savingContact ? <Spinner /> : null} حفظ الإعدادات
          </button>
        </form>
      </Card>

      <Card>
        <SectionTitle>تغيير كلمة المرور</SectionTitle>
        <form onSubmit={savePassword} className="space-y-4" noValidate>
          {passwordMsg ? <Alert tone={passwordMsg.tone}>{passwordMsg.text}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="كلمة المرور الحالية" required error={fields.currentPassword}>
              <input type="password" autoComplete="current-password" className={`field ${fields.currentPassword ? 'field-error' : ''}`}
                value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} required />
            </Field>
            <Field label="كلمة المرور الجديدة" required error={fields.newPassword}
              hint="10 أحرف على الأقل مع حرف كبير وصغير ورقم.">
              <input type="password" autoComplete="new-password" className={`field ${fields.newPassword ? 'field-error' : ''}`}
                value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} required />
            </Field>
            <Field label="تأكيد كلمة المرور الجديدة" required error={fields.confirmPassword}>
              <input type="password" autoComplete="new-password" className={`field ${fields.confirmPassword ? 'field-error' : ''}`}
                value={password.confirmPassword} onChange={(e) => setPassword({ ...password, confirmPassword: e.target.value })} required />
            </Field>
          </div>
          <button type="submit" className="btn-teal" disabled={savingPassword}>
            {savingPassword ? <Spinner /> : null} تغيير كلمة المرور
          </button>
          <p className="text-xs text-ink-muted">
            بعد التغيير تُلغى الجلسات النشطة على الأجهزة الأخرى، وتبقى جلستك الحالية صالحة.
          </p>
        </form>
      </Card>

      <Card>
        <SectionTitle>بيانات الهوية</SectionTitle>
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-3 text-sm leading-7 text-ink-soft">
          <p>
            الرقم الوطني المسجّل: <span className="num font-bold">{nationalIdMasked}</span> — يُعرض مقنّعًا فقط، ولا يظهر كاملًا بعد التسجيل.
          </p>
          <p className="mt-1">
            رقم الهاتف: <span className="num font-bold">{phone}</span>{' '}
            {phoneVerified ? <Badge tone="ok">مُتحقَّق منه</Badge> : <Badge tone="warn">لم يُتحقق منه إلكترونيًا</Badge>}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            لا يمكن تعديل الرقم الوطني مباشرة من الإعدادات. لتغيير بيانات الهوية (تصحيح خطأ إدخال أو تغيير حالة)،
            يرجى التواصل مع إدارة المنصة عبر قسم استعادة كلمة المرور أو قنوات الدعم، لتتم العملية بعد التحقق من هويتك
            وتُسجَّل في سجل التدقيق.
          </p>
        </div>
      </Card>

      <Card>
        <SectionTitle>الخصوصية وحماية البيانات</SectionTitle>
        <ul className="space-y-2 text-sm leading-7 text-ink-soft">
          <li>• يُخزَّن الرقم الوطني مشفّرًا (AES-256-GCM) مع فهرس تجزئة يُستخدم لمنع التسجيل المكرر فقط.</li>
          <li>• لا يستطيع المدير الوصول إلى قراءات السكر أو الأدوية أو اليوميات أو نتائج التحاليل.</li>
          <li>• بياناتك الصحية لا تُرسل إلى أي خدمة تحليلات أو إعلانات، ولا تُستخدم خارج المنصة.</li>
          <li>• يمكنك الوصول إلى سجلاتك وتعديلها وحذفها في أي وقت من الصفحات المخصصة.</li>
          <li>• كلمة المرور تُخزَّن مجزّأة (bcrypt) ولا يمكن لأي شخص — بما في ذلك الإدارة — قراءتها.</li>
          <li>• لتوثيق كامل لما يتم تسجيله: العمليات الحساسة تُسجَّل في سجل تدقيق يحتوي نوع العملية ووقتها دون بيانات صحية زائدة.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/urgent-help" className="btn-outline btn-sm">المساعدة العاجلة</Link>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={async () => {
              await api.post('/api/auth/logout');
              router.push('/login');
              router.refresh();
            }}
          >
            تسجيل الخروج
          </button>
        </div>
      </Card>
    </div>
  );
}
