'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Field, Spinner } from '@/components/ui';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await api.post<{ message: string }>('/api/forgot-password', { email });
      setMessage(data.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <div className="space-y-4">
        <Alert tone="ok" title="تم استلام الطلب">{message}</Alert>
        <Link href="/reset-password" className="btn-primary w-full">لديك رمز استعادة؟ تعيين كلمة مرور جديدة</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="البريد الإلكتروني" htmlFor="email" required hint="سيتم إظهار نفس الرسالة سواء كان البريد مسجّلًا أم لا، حمايةً لخصوصية الحسابات.">
        <input id="email" type="email" className="field" dir="ltr" placeholder="name@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <Spinner /> : null} إرسال طلب الاستعادة
      </button>
    </form>
  );
}
