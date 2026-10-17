import { clientIp } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { emailOtpSchema } from '@/server/validation/schemas';
import { verifyEmailOtp } from '@/server/services/email-otp';

export async function POST(request: Request) {
  try {
    const data = await parseBody(request, emailOtpSchema);
    const result = await verifyEmailOtp({ ...data, purpose: 'PASSWORD_RESET', ip: clientIp(request) });
    return ok({ resetAuthorization: result.resetAuthorization });
  } catch (error) { return handleError(error); }
}
