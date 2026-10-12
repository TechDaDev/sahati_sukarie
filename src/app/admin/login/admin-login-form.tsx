'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Field, Spinner } from '@/components/ui';

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ redirectTo: string }>('/api/auth/admin-login', { email, password });
      router.push(data.redirectTo);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="البريد الإلكتروني" htmlFor="admin-email" required>
        <input id="admin-email" type="email" dir="ltr" autoComplete="email" className="field" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="كلمة المرور" htmlFor="admin-password" required>
        <input id="admin-password" type="password" autoComplete="current-password" className="field" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <Spinner /> : null} دخول لوحة الإدارة
      </button>
    </form>
  );
}
