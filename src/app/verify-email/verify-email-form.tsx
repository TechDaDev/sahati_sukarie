'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Alert, Field, Spinner } from '@/components/ui';

export function VerifyEmailForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setMessage(null); setLoading(true);
    try {
      await api.post('/api/auth/activation/verify', { email, code });
      setDone(true);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  async function resend() {
    setError(null); setMessage(null); setLoading(true);
    try {
      const result = await api.post<{ message: string }>('/api/auth/activation/resend', { email });
      setMessage(result.message);
    } catch { setMessage('إذا كان الحساب مؤهلًا، فسيصل الرمز إلى البريد المسجّل. انتظر دقيقة قبل طلب رمز آخر.'); }
    finally { setLoading(false); }
  }

  if (done) return <div className="space-y-4"><Alert tone="ok" title="تم تفعيل الحساب">سجّل الدخول للمتابعة.</Alert><Link href="/login" className="btn-primary w-full">تسجيل الدخول</Link></div>;
  return <form onSubmit={submit} className="space-y-4" noValidate>
    {error ? <Alert tone="danger">{error}</Alert> : null}
    {message ? <Alert tone="info">{message}</Alert> : null}
    <Field label="البريد الإلكتروني" htmlFor="email" required><input id="email" type="email" className="field" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
    <Field label="رمز التفعيل" htmlFor="code" required hint="الرمز صالح لمدة خمس دقائق."><input id="code" inputMode="numeric" className="field num text-lg tracking-[0.4em]" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required /></Field>
    <button className="btn-primary w-full" disabled={loading}>{loading ? <Spinner /> : null} تأكيد الرمز</button>
    <button type="button" className="btn-outline w-full" disabled={loading || !email} onClick={() => void resend()}>إعادة إرسال الرمز</button>
  </form>;
}
