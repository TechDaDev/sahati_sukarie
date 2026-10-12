/** صفحة إنشاء الحساب */
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentSession } from '@/server/auth/session';
import { AuthCard } from '@/components/auth-card';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'إنشاء حساب جديد' };

export default async function RegisterPage() {
  const session = await getCurrentSession();
  if (session) redirect(session.user.role === 'ADMIN' ? '/admin' : '/dashboard');

  return (
    <AuthCard
      title="إنشاء حساب جديد"
      subtitle="جميع الحقول مطلوبة. البيانات الطبية التفصيلية يمكن إكمالها لاحقًا بعد التسجيل."
      wide
      footer={<span>لديك حساب؟ <a className="font-semibold text-brand-600 hover:underline" href="/login">تسجيل الدخول</a></span>}
    >
      <RegisterForm />
    </AuthCard>
  );
}
