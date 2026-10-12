/**
 * POST /api/admin/password-requests/verify
 * تأكيد إجراء التحقق اليدوي من هوية المريض (خطوة إلزامية قبل توليد الرمز).
 */
import { assertRateLimit, guard } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { verifyRequest } from '@/server/services/recovery';
import { recoveryVerifySchema } from '@/server/validation/schemas';

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['ADMIN'] });
    await assertRateLimit({ key: `admverify:${session.user.id}`, limit: 60, windowSeconds: 3600 },
      'تم تجاوز عدد العمليات المسموح بها.');
    const data = await parseBody(request, recoveryVerifySchema);
    await verifyRequest(session.user.id, data.requestId, data.verificationNote ?? null, ip);
    return ok({ verified: true });
  } catch (error) {
    return handleError(error);
  }
}
