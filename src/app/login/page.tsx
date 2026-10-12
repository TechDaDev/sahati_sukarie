/** صفحة تسجيل دخول المرضى */
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentSession } from '@/server/auth/session';
import { AuthCard } from '@/components/auth-card';
import { Alert } from '@/components/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) redirect(session.user.role === 'ADMIN' ? '/admin' : '/dashboard');

  return (
    <AuthCard
      title="تسجيل الدخول"
      subtitle="أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى سجلاتك الصحية."
      footer={<span>ليس لديك حساب؟ <a className="font-semibold text-brand-600 hover:underline" href="/register">إنشاء حساب جديد</a></span>}
    >
      <LoginForm />
      <Alert tone="info" title="ملاحظة">
        <p>
          هذه بوابة المرضى. حساب المدير يُسجَّل الدخول من{' '}
          <a className="font-semibold text-brand-600 hover:underline" href="/admin/login">صفحة دخول المدير</a>.
        </p>
      </Alert>
    </AuthCard>
  );
}
