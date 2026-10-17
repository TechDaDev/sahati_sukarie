'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

export function AdminInvitationForm() {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    window.history.replaceState(null, '', window.location.pathname);
    setToken(value);
    if (!value) setError('رابط الدعوة غير صالح أو منتهي الصلاحية.');
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setLoading(true);
    try {
      await api.post('/api/admin-invitations/accept', { token, newPassword, confirmPassword });
      setDone(true);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  if (done) return <div className="space-y-4"><Alert tone="ok" title="اكتمل إعداد الحساب">سجّل الدخول باستخدام كلمة المرور الجديدة.</Alert><Link href="/admin/login" className="btn-primary block w-full text-center">تسجيل دخول المدير</Link></div>;

  return <form onSubmit={submit} className="space-y-4" noValidate>
    {error ? <Alert tone="danger">{error}</Alert> : null}
    <Field label="كلمة المرور" htmlFor="newPassword" required hint="10 أحرف على الأقل، مع حرف كبير وصغير ورقم."><input id="newPassword" type="password" className="field" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required disabled={!token} /></Field>
    <Field label="تأكيد كلمة المرور" htmlFor="confirmPassword" required><input id="confirmPassword" type="password" className="field" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required disabled={!token} /></Field>
    <button type="submit" className="btn-primary w-full" disabled={loading || !token}>{loading ? <Spinner /> : null}إعداد كلمة المرور</button>
  </form>;
}
