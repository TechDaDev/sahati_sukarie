import { desc, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { requireAdminPage } from '@/server/page-guards';
import { Card, SectionTitle } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'أحداث الأمان' };
export const dynamic = 'force-dynamic';
const ACTIONS = ['LOGIN_FAILED', 'LOGIN_SUCCESS', 'MOBILE_LOGIN_FAILED', 'MOBILE_LOGIN_SUCCESS', 'MOBILE_REFRESH_REPLAY', 'EMAIL_OTP_SENT', 'EMAIL_OTP_VERIFY_FAILED', 'EMAIL_OTP_DELIVERY_FAILED', 'ACCOUNT_ACTIVATED', 'ACCOUNT_ACTIVATION_PENDING', 'PASSWORD_RESET_OTP_VERIFIED', 'PASSWORD_RESET_COMPLETED', 'ADMIN_ACCOUNT_SUSPENDED', 'ADMIN_ACCOUNT_RESTORED'];

export default async function SecurityEventsPage() {
  await requireAdminPage();
  const rows = await db.select({ action: auditLogs.action, actorRole: auditLogs.actorRole, ipAddress: auditLogs.ipAddress, createdAt: auditLogs.createdAt })
    .from(auditLogs).where(inArray(auditLogs.action, ACTIONS)).orderBy(desc(auditLogs.createdAt)).limit(100);
  return <div className="space-y-4" dir="rtl"><h1 className="text-2xl">أحداث الأمان</h1><Card><SectionTitle>آخر 100 حدث</SectionTitle><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b text-right text-xs"><th className="p-2">الحدث</th><th className="p-2">الفاعل</th><th className="p-2">عنوان IP</th><th className="p-2">الوقت</th></tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.createdAt.toISOString()}-${i}`} className="border-b"><td className="p-2 font-mono text-xs" dir="ltr">{row.action}</td><td className="p-2">{row.actorRole}</td><td className="p-2 font-mono text-xs" dir="ltr">{row.ipAddress ?? '—'}</td><td className="p-2 text-xs">{formatDateTime(row.createdAt, 'Asia/Baghdad')}</td></tr>)}</tbody></table></div></Card></div>;
}
