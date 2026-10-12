/** صفحة إدخال رمز الاستعادة وتعيين كلمة مرور جديدة */
import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { Alert } from '@/components/ui';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = { title: 'تعيين كلمة مرور جديدة' };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="تعيين كلمة مرور جديدة"
      subtitle="أدخل رمز الاستعادة الذي سلّمك إياه مسؤول المنصة بعد التحقق من هويتك."
      footer={<Link href="/login" className="font-semibold text-brand-600 hover:underline">العودة إلى تسجيل الدخول</Link>}
    >
      <div className="space-y-4">
        <Alert tone="warn" title="صلاحية الرمز">
          الرمز صالح لمدة 15 دقيقة ويُستخدم مرة واحدة فقط. بعد تغيير كلمة المرور تُلغى جميع الجلسات السابقة على كل الأجهزة.
        </Alert>
        <ResetPasswordForm />
      </div>
    </AuthCard>
  );
}
