/** الصفحة الرئيسية للوحة الإدارة — ملخص المهام المطلوبة */
import type { Metadata } from 'next';
import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { passwordRecoveryRequests, users } from '@/server/db/schema';
import { requireAdminPage } from '@/server/page-guards';
import { Card, SectionTitle, StatCard } from '@/components/ui';

export const metadata: Metadata = { title: 'إدارة الحسابات' };
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  await requireAdminPage();

  const [pending, verified, completed, rejected, userCounts] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(passwordRecoveryRequests)
      .where(eq(passwordRecoveryRequests.status, 'PENDING')),
    db.select({ c: sql<number>`count(*)` }).from(passwordRecoveryRequests)
      .where(eq(passwordRecoveryRequests.status, 'VERIFIED')),
    db.select({ c: sql<number>`count(*)` }).from(passwordRecoveryRequests)
      .where(eq(passwordRecoveryRequests.status, 'COMPLETED')),
    db.select({ c: sql<number>`count(*)` }).from(passwordRecoveryRequests)
      .where(eq(passwordRecoveryRequests.status, 'REJECTED')),
    db.select({ status: users.status, c: sql<number>`count(*)` })
      .from(users).where(eq(users.role, 'PATIENT')).groupBy(users.status),
  ]);

  const activeUsers = Number(userCounts.find((r) => r.status === 'ACTIVE')?.c ?? 0);
  const totalUsers = userCounts.reduce((sum, r) => sum + Number(r.c), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">إدارة الحسابات</h1>
        <p className="mt-1 text-sm text-ink-muted">
          المسؤوليات المتاحة: تحديد الحسابات ومعالجة طلبات استعادة كلمة المرور يدويًا.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="طلبات قيد الانتظار" value={<span className="num">{Number(pending[0]?.c ?? 0)}</span>}
          tone={Number(pending[0]?.c ?? 0) > 0 ? 'warn' : 'neutral'} />
        <StatCard label="طلبات تم التحقق منها (بانتظار إصدار الرمز)" value={<span className="num">{Number(verified[0]?.c ?? 0)}</span>} />
        <StatCard label="طلبات مكتملة" value={<span className="num">{Number(completed[0]?.c ?? 0)}</span>} tone="teal" />
        <StatCard label="طلبات مرفوضة" value={<span className="num">{Number(rejected[0]?.c ?? 0)}</span>} />
      </div>

      <Card>
        <SectionTitle>حسابات المرضى</SectionTitle>
        <p className="text-sm text-ink-soft">
          إجمالي الحسابات: <span className="num font-bold">{totalUsers}</span> — النشطة منها:{' '}
          <span className="num font-bold">{activeUsers}</span>
        </p>
        <p className="mt-2 text-xs leading-6 text-ink-muted">
          تُعرض هذه الأرقام لأغراض التسيير فقط. لا يمكن للمدير الاطلاع على أي محتوى صحي لأي حساب.
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <SectionTitle>طلبات استعادة كلمة المرور</SectionTitle>
          <p className="text-sm leading-7 text-ink-soft">
            راجع الطلبات، وأكّد التحقق اليدوي من هوية المريض عبر رقم الهاتف المسجّل، ثم أصدر رمز استعادة لمرة واحدة
            صالحًا لمدة 15 دقيقة.
          </p>
          <Link href="/admin/password-requests" className="btn-primary btn-sm mt-3">فتح الطلبات</Link>
        </Card>
        <Card>
          <SectionTitle>تحديد الحسابات</SectionTitle>
          <p className="text-sm leading-7 text-ink-soft">
            ابحث عن حساب عبر الاسم أو البريد أو الرقم الوطني (بحث محمي بفهرس تجزئة) أو رقم الهاتف، واعرض الحد
            الأدنى من البيانات التعريفية اللازمة لعملية الاستعادة.
          </p>
          <Link href="/admin/users" className="btn-outline btn-sm mt-3">فتح البحث</Link>
        </Card>
      </div>
    </div>
  );
}
