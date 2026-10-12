/**
 * POST /api/admin/password-requests/generate-code
 * ---------------------------------------------------------------------------
 * يولّد رمز استعادة لمرة واحدة. الرمز الصريح يُعاد في هذه الاستجابة فقط
 * (عرض لمرة واحدة) ولا يُخزَّن ولا يُسجَّل في قاعدة البيانات أو سجلات الخادم.
 * يتطلب تأكيدًا صريحًا من المدير (manualVerificationConfirmed).
 */
import { assertRateLimit, guard } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { generateRecoveryCode, RECOVERY_TOKEN_TTL_MINUTES } from '@/server/services/recovery';
import { recoveryVerifySchema } from '@/server/validation/schemas';
import { formatDateTime } from '@/lib/format';

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['ADMIN'] });
    await assertRateLimit({ key: `admcodes:${session.user.id}`, limit: 40, windowSeconds: 3600 },
      'تم تجاوز عدد الأكواد المسموح بتوليدها في الساعة.');

    const data = await parseBody(request, recoveryVerifySchema);
    const { code, expiresAt } = await generateRecoveryCode(session.user.id, data.requestId, ip);

    return ok({
      code,
      expiresAt,
      expiresAtDisplay: formatDateTime(expiresAt, 'Asia/Baghdad'),
      ttlMinutes: RECOVERY_TOKEN_TTL_MINUTES,
      oneTimeView: true,
      instructions: [
        'انسخ الرمز الآن وسلّمه للمريض عبر مكالمة هاتفية على الرقم المسجّل.',
        'الرمز صالح لمرة واحدة فقط ولن يظهر مرة أخرى في هذه اللوحة.',
        'لا تُرسل الرمز عبر قناة غير موثوقة، ولا تحتفظ به نصًا مكتوبًا.',
      ],
    });
  } catch (error) {
    return handleError(error);
  }
}
