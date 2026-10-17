import { clientIp } from '@/server/auth/session';
import { ok, parseBody } from '@/server/http';
import { emailOtpResendSchema } from '@/server/validation/schemas';
import { requestActivationOtp } from '@/server/services/email-otp';

export async function POST(request: Request) {
  const data = await parseBody(request, emailOtpResendSchema);
  try { await requestActivationOtp(data.email, clientIp(request)); } catch { /* Same public response prevents account enumeration. */ }
  return ok({ message: 'إذا كان الحساب مؤهلًا، فسيصل رمز التفعيل إلى البريد المسجّل. انتظر دقيقة قبل طلب رمز آخر.' });
}
