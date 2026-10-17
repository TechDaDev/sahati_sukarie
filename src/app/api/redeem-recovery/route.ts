import { fail } from '@/server/http';

export async function POST() {
  return fail(410, 'تم إيقاف رمز الاستعادة القديم. استخدم رمز البريد الإلكتروني.', 'RECOVERY_METHOD_RETIRED');
}
