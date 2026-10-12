/**
 * POST /api/forgot-password — تسجيل طلب استعادة كلمة مرور.
 * لا يُرسَل أي بريد أو رسالة SMS تلقائيًا؛ الإدارة تتولى العملية يدويًا.
 * الرسالة المُعادة عامة دائمًا ولا تكشف ما إذا كان البريد مسجّلًا.
 */
import { assertRateLimit, clientIp } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { createRecoveryRequest, GENERIC_REQUEST_MESSAGE } from '@/server/services/recovery';
import { forgotPasswordSchema } from '@/server/validation/schemas';

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    await assertRateLimit({ key: `forgot:${ip}`, limit: 10, windowSeconds: 3600 },
      'تم تجاوز عدد الطلبات المسموح بها. يرجى المحاولة لاحقًا.');

    const data = await parseBody(request, forgotPasswordSchema);
    await createRecoveryRequest(data.email, ip);
    return ok({ message: GENERIC_REQUEST_MESSAGE });
  } catch (error) {
    return handleError(error);
  }
}
