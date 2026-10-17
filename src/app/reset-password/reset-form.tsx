'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Alert, Field, Spinner } from '@/components/ui';

export function ResetPasswordForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetAuthorization, setResetAuthorization] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setMessage(null); setLoading(true);
    try {
      if (!resetAuthorization) {
        const result = await api.post<{ resetAuthorization: string }>('/api/auth/password-reset/verify', { email, code });
        setResetAuthorization(result.resetAuthorization);
        setMessage('تم التحقق من الرمز. أدخل كلمة المرور الجديدة.');
      } else {
        await api.post('/api/auth/password-reset/complete', { resetAuthorization, newPassword, confirmPassword });
        setDone(true);
      }
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  async function resend() {
    setError(null); setLoading(true);
    try {
      const result = await api.post<{ message: string }>('/api/forgot-password', { email });
      setMessage(result.message);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  if (done) return <div className="space-y-4"><Alert tone="ok" title="تم تحديث كلمة المرور">سجّل الدخول مجددًا. انتهت الجلسات السابقة.</Alert><Link href="/login" className="btn-primary w-full">تسجيل الدخول</Link></div>;

  return <form onSubmit={submit} className="space-y-4" noValidate>
    {error ? <Alert tone="danger">{error}</Alert> : null}
    {message ? <Alert tone="info">{message}</Alert> : null}
    <Field label="البريد الإلكتروني" htmlFor="email" required><input id="email" type="email" className="field" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required disabled={Boolean(resetAuthorization)} /></Field>
    {!resetAuthorization ? <>
      <Field label="رمز الاستعادة" htmlFor="code" required hint="أدخل الرمز المكوّن من ستة أرقام."><input id="code" inputMode="numeric" className="field num text-lg tracking-[0.4em]" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required /></Field>
      <button type="button" className="btn-outline w-full" disabled={loading || !email} onClick={() => void resend()}>إعادة إرسال الرمز</button>
    </> : <>
      <Field label="كلمة المرور الجديدة" htmlFor="newPassword" required hint="10 أحرف على الأقل، مع حرف كبير وصغير ورقم."><input id="newPassword" type="password" className="field" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required /></Field>
      <Field label="تأكيد كلمة المرور الجديدة" htmlFor="confirmPassword" required><input id="confirmPassword" type="password" className="field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required /></Field>
    </>}
    <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? <Spinner /> : null}{resetAuthorization ? 'تعيين كلمة المرور' : 'التحقق من الرمز'}</button>
  </form>;
}
