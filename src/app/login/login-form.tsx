'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Field, Spinner } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      const data = await api.post<{ redirectTo: string }>('/api/auth/login', { email, password });
      setSuccess(true);
      router.push(data.redirectTo || '/dashboard');
      router.refresh();
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setError(e.message ?? 'تعذّر تسجيل الدخول.');
      setFields(e.fields ?? {});
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label="البريد الإلكتروني" htmlFor="email" required error={fields.email}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={`field ${fields.email ? 'field-error' : ''}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
          placeholder="name@example.com"
          required
        />
      </Field>

      <Field label="كلمة المرور" htmlFor="password" required error={fields.password}>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={`field ${fields.password ? 'field-error' : ''}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      <button type="submit" className="btn-primary w-full" disabled={loading || success}>
        {loading ? <Spinner /> : null}
        {success ? 'جارٍ التحويل…' : 'تسجيل الدخول'}
      </button>

      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="font-semibold text-brand-600 hover:underline">
          نسيت كلمة المرور؟
        </Link>
        <Link href="/register" className="text-ink-soft hover:text-brand-600">
          إنشاء حساب جديد
        </Link>
      </div>
    </form>
  );
}
