import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { AdminInvitationForm } from './invitation-form';

export const metadata: Metadata = { title: 'إعداد حساب المدير' };
export const dynamic = 'force-dynamic';

export default function AcceptAdminInvitationPage() {
  return <AuthCard
    title="إعداد حساب المدير"
    subtitle="أنشئ كلمة مرور قوية لإكمال دعوة المدير."
    footer={<Link href="/admin/login" className="font-semibold text-brand-600 hover:underline">العودة إلى تسجيل دخول المدير</Link>}
  ><AdminInvitationForm /></AuthCard>;
}
