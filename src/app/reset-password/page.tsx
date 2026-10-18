/** صفحة التحقق من رمز البريد وتعيين كلمة مرور جديدة */
import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { Alert } from '@/components/ui';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = { title: 'تعيين كلمة مرور جديدة' };
export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="تعيين كلمة مرور جديدة"
      subtitle="أدخل رمز البريد الإلكتروني للتحقق، ثم عيّن كلمة مرور جديدة."
      footer={<Link href="/login" className="font-semibold text-brand-600 hover:underline">العودة إلى تسجيل الدخول</Link>}
    >
      <div className="space-y-4">
        <Alert tone="info" title="حماية الحساب">
          رمز التحقق صالح لخمس دقائق. بعد إعادة التعيين، تنتهي الجلسات السابقة وتحتاج إلى تسجيل الدخول من جديد.
        </Alert>
        <ResetPasswordForm />
      </div>
    </AuthCard>
  );
}
