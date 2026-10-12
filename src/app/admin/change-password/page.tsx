/**
 * تغيير كلمة مرور المدير.
 * يُطلب إلزاميًا عند أول تسجيل دخول للحساب الأولي (must_change_password).
 */
import type { Metadata } from 'next';
import { requireAdminPage } from '@/server/page-guards';
import { AuthCard } from '@/components/auth-card';
import { Alert } from '@/components/ui';
import { AdminPasswordForm } from './admin-password-form';

export const metadata: Metadata = { title: 'تغيير كلمة مرور المدير' };

export default async function AdminChangePasswordPage() {
  const admin = await requireAdminPage();

  return (
    <AuthCard
      title="تغيير كلمة مرور المدير"
      subtitle={admin.mustChangePassword
        ? 'هذه أول مرة تسجّل فيها الدخول، ويجب تعيين كلمة مرور جديدة قبل استخدام اللوحة.'
        : 'يمكنك تحديث كلمة المرور في أي وقت.'}
      showDisclaimer={false}
      footer={<a href="/admin" className="font-semibold text-brand-600 hover:underline">العودة إلى لوحة الإدارة</a>}
    >
      <div className="space-y-4">
        {admin.mustChangePassword ? (
          <Alert tone="warn" title="مطلوب">
            كلمة المرور الأولية تأتي من متغيرات بيئة التطبيق. عيّن كلمة مرور خاصة بك الآن، ولن تُخزَّن أي كلمة مرور
            بشكل قابل للقراءة في أي مكان.
          </Alert>
        ) : null}
        <AdminPasswordForm />
      </div>
    </AuthCard>
  );
}
