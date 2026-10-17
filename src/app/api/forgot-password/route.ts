/**
 * POST /api/forgot-password — طلب رمز استعادة بالبريد.
 * الرسالة المُعادة عامة دائمًا ولا تكشف ما إذا كان البريد مسجّلًا.
 */
import { assertRateLimit, clientIp } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { requestPasswordResetOtp } from '@/server/services/email-otp';
import { forgotPasswordSchema } from '@/server/validation/schemas';

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    await assertRateLimit({ key: `forgot:${ip}`, limit: 10, windowSeconds: 3600 },
      'تم تجاوز عدد الطلبات المسموح بها. يرجى المحاولة لاحقًا.');

    const data = await parseBody(request, forgotPasswordSchema);
    try {
      await requestPasswordResetOtp(data.email, ip);
    } catch { /* Per-account and provider failures keep the same public response. */ }
    return ok({ message: 'إذا كان البريد مسجلًا، فستصلك رسالة تحتوي على رمز الاستعادة. انتظر دقيقة قبل طلب رمز آخر.' });
  } catch (error) {
    return handleError(error);
  }
}
