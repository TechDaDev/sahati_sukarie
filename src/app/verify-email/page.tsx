import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { VerifyEmailForm } from './verify-email-form';

export const metadata: Metadata = { title: 'تأكيد البريد الإلكتروني' };

export default function VerifyEmailPage() {
  return <AuthCard title="تأكيد البريد الإلكتروني" subtitle="أدخل البريد المسجل ورمز التفعيل المرسل إليه."><VerifyEmailForm /></AuthCard>;
}
