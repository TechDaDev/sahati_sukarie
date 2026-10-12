/** صفحة دخول المدير — بوابة منفصلة عن بوابة المرضى */
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentSession } from '@/server/auth/session';
import { AuthCard } from '@/components/auth-card';
import { Alert } from '@/components/ui';
import { AdminLoginForm } from './admin-login-form';

export const metadata: Metadata = { title: 'دخول المدير' };

export default async function AdminLoginPage() {
  const session = await getCurrentSession();
  if (session?.user.role === 'ADMIN') {
    redirect(session.user.mustChangePassword ? '/admin/change-password' : '/admin');
  }

  return (
    <AuthCard
      title="دخول المدير"
      subtitle="بوابة مخصّصة لموظفي إدارة المنصة. حسابات المرضى لا تعمل من هنا."
      showDisclaimer={false}
      footer={<a href="/login" className="font-semibold text-brand-600 hover:underline">بوابة المرضى</a>}
    >
      <div className="space-y-4">
        <AdminLoginForm />
        <Alert tone="info" title="صلاحيات محدودة">
          لا يمنح هذا الحساب أي وصول إلى البيانات الصحية للمرضى. وظيفته الوحيدة: معالجة طلبات استعادة كلمة المرور
          والبحث التعريفي المحدود عن الحسابات.
        </Alert>
      </div>
    </AuthCard>
  );
}
