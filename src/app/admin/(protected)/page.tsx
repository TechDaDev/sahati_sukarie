/** الصفحة الرئيسية للوحة إدارة المنصة */
import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { emailOtpChallenges, users } from '@/server/db/schema';
import { requireAdminPage } from '@/server/page-guards';
import { Card, SectionTitle, StatCard } from '@/components/ui';

export const metadata: Metadata = { title: 'إدارة المنصة' };
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  await requireAdminPage();
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [userCounts, deliveryCounts] = await Promise.all([
    db.select({ status: users.status, c: sql<number>`count(*)` })
      .from(users).where(eq(users.role, 'PATIENT')).groupBy(users.status),
    db.select({ status: emailOtpChallenges.deliveryStatus, c: sql<number>`count(*)` })
      .from(emailOtpChallenges).where(gte(emailOtpChallenges.createdAt, dayAgo)).groupBy(emailOtpChallenges.deliveryStatus),
  ]);
  const countUsers = (status: string) => Number(userCounts.find((r) => r.status === status)?.c ?? 0);
  const delivery = (status: string) => Number(deliveryCounts.find((r) => r.status === status)?.c ?? 0);
  const totalUsers = userCounts.reduce((sum, row) => sum + Number(row.c), 0);
  const activationRows = await db.select({ c: sql<number>`count(*)` }).from(users)
    .where(and(eq(users.role, 'PATIENT'), eq(users.emailActivationRequired, true), sql`${users.emailVerifiedAt} IS NULL`));

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl">إدارة المنصة</h1>
        <p className="mt-1 text-sm text-ink-muted">إحصاءات الحسابات والتفعيل والبريد. لا تعرض هذه الصفحة السجلات الطبية.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي حسابات المرضى" value={<span className="num">{totalUsers}</span>} />
        <StatCard label="الحسابات النشطة" value={<span className="num">{countUsers('ACTIVE')}</span>} tone="teal" />
        <StatCard label="بانتظار تفعيل البريد" value={<span className="num">{Number(activationRows[0]?.c ?? 0)}</span>} />
        <StatCard label="الحسابات الموقوفة" value={<span className="num">{countUsers('SUSPENDED')}</span>} tone={countUsers('SUSPENDED') ? 'warn' : 'neutral'} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="رسائل أُرسلت خلال 24 ساعة" value={<span className="num">{delivery('SENT')}</span>} tone="teal" />
        <StatCard label="إخفاقات الإرسال خلال 24 ساعة" value={<span className="num">{delivery('FAILED')}</span>} tone={delivery('FAILED') ? 'warn' : 'neutral'} />
        <StatCard label="حسابات معطّلة" value={<span className="num">{countUsers('DISABLED')}</span>} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <SectionTitle>الحسابات</SectionTitle>
          <p className="text-sm leading-7 text-ink-soft">راجع حالة التفعيل والإيقاف، وطبّق إجراءات إدارية مسجّلة في سجل التدقيق.</p>
          <Link href="/admin/users" className="btn-outline btn-sm mt-3">إدارة الحسابات</Link>
        </Card>
        <Card>
          <SectionTitle>البريد والأمان</SectionTitle>
          <p className="text-sm leading-7 text-ink-soft">تُسجّل حالات تسليم البريد ورموز الخطأ دون تخزين رمز OTP أو عرض كلمة المرور.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/email-delivery" className="btn-outline btn-sm">حالة البريد</Link>
            <Link href="/admin/security-events" className="btn-outline btn-sm">أحداث الأمان</Link>
          </div>
          <p className="mt-2 text-xs leading-6 text-ink-muted">المدير لا يملك صلاحية قراءة السجلات الطبية أو استعادة كلمة المرور يدويًا.</p>
        </Card>
      </div>
    </div>
  );
}
