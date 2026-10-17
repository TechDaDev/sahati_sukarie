import { ApiError, clientIp } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { emailOtpSchema } from '@/server/validation/schemas';
import { verifyEmailOtp } from '@/server/services/email-otp';

export async function POST(request: Request) {
  try {
    const data = await parseBody(request, emailOtpSchema);
    await verifyEmailOtp({ ...data, purpose: 'ACCOUNT_ACTIVATION', ip: clientIp(request) });
    return ok({ activated: true });
  } catch (error) { return handleError(error); }
}
