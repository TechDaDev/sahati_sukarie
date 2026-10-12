'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Field, Spinner } from '@/components/ui';

export function ResetPasswordForm() {
  const [form, setForm] = useState({ email: '', code: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setFields((prev) => ({ ...prev, [key]: '' }));
  };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    if (form.newPassword !== form.confirmPassword) {
      setFields({ confirmPassword: 'كلمتا المرور غير متطابقتين' });
      return;
    }
    setLoading(true);
    try {
      const data = await api.post<{ message: string }>('/api/redeem-recovery', form);
      setDone(data.message);
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setError(e.message ?? 'تعذّر إتمام العملية.');
      setFields(e.fields ?? {});
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="ok" title="تم بنجاح">{done}</Alert>
        <Link href="/login" className="btn-primary w-full">الانتقال إلى تسجيل الدخول</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label="البريد الإلكتروني" htmlFor="email" required error={fields.email}>
        <input id="email" type="email" className={`field ${fields.email ? 'field-error' : ''}`} dir="ltr"
          value={form.email} onChange={set('email')} required />
      </Field>

      <Field label="رمز الاستعادة" htmlFor="code" required error={fields.code} hint="أرقام فقط، كما وردك من مسؤول المنصة.">
        <input id="code" inputMode="numeric" className={`field num text-lg tracking-[0.4em] ${fields.code ? 'field-error' : ''}`}
          dir="ltr" placeholder="00000000" value={form.code}
          onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
      </Field>

      <Field label="كلمة المرور الجديدة" htmlFor="newPassword" required error={fields.newPassword}
        hint="10 أحرف على الأقل، وتشمل حرفًا كبيرًا وحرفًا صغيرًا ورقمًا.">
        <input id="newPassword" type="password" className={`field ${fields.newPassword ? 'field-error' : ''}`}
          value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" required />
      </Field>

      <Field label="تأكيد كلمة المرور الجديدة" htmlFor="confirmPassword" required error={fields.confirmPassword}>
        <input id="confirmPassword" type="password" className={`field ${fields.confirmPassword ? 'field-error' : ''}`}
          value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" required />
      </Field>

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <Spinner /> : null} تعيين كلمة المرور
      </button>
    </form>
  );
}
