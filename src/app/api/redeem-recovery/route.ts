/**
 * POST /api/redeem-recovery — إدخال رمز الاستعادة وتعيين كلمة مرور جديدة.
 * الرمز يُستخدم مرة واحدة وينتهي بعد 15 دقيقة، وتُلغى كل الجلسات بعد التغيير.
 */
import { assertRateLimit, clientIp } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { redeemRecoveryCode } from '@/server/services/recovery';
import { recoveryCodeSchema } from '@/server/validation/schemas';

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    await assertRateLimit({ key: `redeem:${ip}`, limit: 20, windowSeconds: 900 },
      'تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة بعد قليل.');

    const data = await parseBody(request, recoveryCodeSchema);
    await redeemRecoveryCode({
      email: data.email,
      code: data.code,
      newPassword: data.newPassword,
      ip,
    });
    return ok({
      changed: true,
      message: 'تم تعيين كلمة المرور الجديدة بنجاح. تم إنهاء جميع الجلسات السابقة، يرجى تسجيل الدخول من جديد.',
    });
  } catch (error) {
    return handleError(error);
  }
}
