'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Field, Spinner } from '@/components/ui';

export function AdminPasswordForm() {
  const router = useRouter();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      await api.post('/api/auth/change-password', form);
      setDone(true);
      setTimeout(() => {
        router.push('/admin');
        router.refresh();
      }, 900);
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setError(e.message ?? 'تعذّر تغيير كلمة المرور.');
      setFields(e.fields ?? {});
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {done ? <Alert tone="ok">تم تحديث كلمة المرور بنجاح. جارٍ تحويلك إلى اللوحة…</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label="كلمة المرور الحالية" required error={fields.currentPassword}>
        <input type="password" autoComplete="current-password" className="field" required
          value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
      </Field>
      <Field label="كلمة المرور الجديدة" required error={fields.newPassword}
        hint="10 أحرف على الأقل مع حرف كبير وصغير ورقم.">
        <input type="password" autoComplete="new-password" className="field" required
          value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
      </Field>
      <Field label="تأكيد كلمة المرور الجديدة" required error={fields.confirmPassword}>
        <input type="password" autoComplete="new-password" className="field" required
          value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
      </Field>

      <button type="submit" className="btn-primary w-full" disabled={loading || done}>
        {loading ? <Spinner /> : null} حفظ كلمة المرور الجديدة
      </button>
    </form>
  );
}
