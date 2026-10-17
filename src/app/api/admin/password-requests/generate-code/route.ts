import { fail } from '@/server/http';

export async function POST() {
  return fail(410, 'تم إيقاف إصدار رموز الاستعادة من قبل المدير.', 'ADMIN_RECOVERY_RETIRED');
}
