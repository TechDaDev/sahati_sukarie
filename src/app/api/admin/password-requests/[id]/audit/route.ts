import { fail } from '@/server/http';

export async function GET() {
  return fail(410, 'تم إيقاف قائمة الاستعادة الإدارية.', 'ADMIN_RECOVERY_RETIRED');
}
