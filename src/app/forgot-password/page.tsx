/** صفحة طلب استعادة كلمة المرور (تُعالج يدويًا من الإدارة) */
import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { Alert } from '@/components/ui';
import { ForgotPasswordForm } from './forgot-form';

export const metadata: Metadata = { title: 'استعادة كلمة المرور' };
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="استعادة كلمة المرور"
      subtitle="أدخل بريدك الإلكتروني المسجّل وسنتولّى استكمال الإجراءات معك."
      footer={<Link href="/login" className="font-semibold text-brand-600 hover:underline">العودة إلى تسجيل الدخول</Link>}
    >
      <div className="space-y-4">
        <Alert tone="info">
          <p>
            لا تُرسل المنصة رابط استعادة أو رسالة SMS تلقائيًا. بعد إرسال الطلب، تقوم الإدارة بالتحقق اليدوي من هويتك
            عبر رقم الهاتف المسجّل، ثم تسلّمك رمز استعادة لمرة واحدة صالحًا لمدة 15 دقيقة.
          </p>
        </Alert>
        <ForgotPasswordForm />
        <p className="text-xs leading-6 text-ink-muted">
          ملاحظة: رقم الهاتف المسجّل لم يُتحقق منه إلكترونيًا، ولذلك يُشترط التحقق اليدوي قبل إصدار أي رمز.
        </p>
      </div>
    </AuthCard>
  );
}
