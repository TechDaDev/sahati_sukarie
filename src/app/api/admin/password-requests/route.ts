import { fail } from '@/server/http';

export async function GET() {
  return fail(410, 'تم إيقاف مسار الاستعادة الإدارية. استخدم استعادة كلمة المرور بالبريد.', 'ADMIN_RECOVERY_RETIRED');
}
