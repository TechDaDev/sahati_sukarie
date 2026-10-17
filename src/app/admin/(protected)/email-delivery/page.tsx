import { desc } from 'drizzle-orm';
import { db } from '@/server/db';
import { emailOtpChallenges } from '@/server/db/schema';
import { requireAdminPage } from '@/server/page-guards';
import { Card, SectionTitle, Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'حالة البريد' };
export const dynamic = 'force-dynamic';

export default async function EmailDeliveryPage() {
  await requireAdminPage();
  const rows = await db.select({ purpose: emailOtpChallenges.purpose, status: emailOtpChallenges.deliveryStatus, providerMessageId: emailOtpChallenges.providerMessageId, errorCode: emailOtpChallenges.deliveryErrorCode, createdAt: emailOtpChallenges.createdAt })
    .from(emailOtpChallenges).orderBy(desc(emailOtpChallenges.createdAt)).limit(50);
  return <div className="space-y-4" dir="rtl"><h1 className="text-2xl">حالة البريد</h1><Card><SectionTitle>آخر 50 محاولة إرسال</SectionTitle><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b text-right text-xs"><th className="p-2">الغرض</th><th className="p-2">الحالة</th><th className="p-2">رمز الخطأ</th><th className="p-2">معرّف Resend</th><th className="p-2">الوقت</th></tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.createdAt.toISOString()}-${i}`} className="border-b"><td className="p-2">{row.purpose === 'ACCOUNT_ACTIVATION' ? 'تفعيل حساب' : 'استعادة كلمة مرور'}</td><td className="p-2"><Badge tone={row.status === 'SENT' ? 'ok' : row.status === 'FAILED' ? 'danger' : 'neutral'}>{row.status}</Badge></td><td className="p-2 font-mono text-xs">{row.errorCode ?? '—'}</td><td className="p-2 font-mono text-xs" dir="ltr">{row.providerMessageId ?? '—'}</td><td className="p-2 text-xs">{formatDateTime(row.createdAt, 'Asia/Baghdad')}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-ink-muted">لا تعرض هذه القائمة عنوان البريد أو رمز OTP.</p></Card></div>;
}
