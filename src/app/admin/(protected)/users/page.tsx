/** صفحة تحديد حسابات المرضى (المدير) */
import type { Metadata } from 'next';
import { requireAdminPage } from '@/server/page-guards';
import { UsersScreen } from './users-screen';

export const metadata: Metadata = { title: 'تحديد حسابات المرضى' };
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  await requireAdminPage();
  return <UsersScreen numeralSystem="ARABIC_INDIC" />;
}
