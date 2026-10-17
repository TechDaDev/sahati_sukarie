import { fail } from '@/server/http';

export async function POST() {
  return fail(410, 'تم إيقاف الاستعادة الإدارية.', 'ADMIN_RECOVERY_RETIRED');
}
