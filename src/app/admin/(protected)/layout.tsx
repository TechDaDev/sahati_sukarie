/**
 * هيكل اللوحة المحمية للمدير.
 * يتحقق من الجلسة والدور على الخادم، ويُلزم بتغيير كلمة المرور الأولية.
 */
import { redirect } from 'next/navigation';
import { requireAdminPage } from '@/server/page-guards';
import { AdminShell } from '@/components/admin-shell';

export const dynamic = 'force-dynamic';

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  if (admin.mustChangePassword) redirect('/admin/change-password');
  return <AdminShell email={admin.email}>{children}</AdminShell>;
}
