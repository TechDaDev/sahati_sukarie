import { clientIp } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { completeEmailPasswordResetSchema } from '@/server/validation/schemas';
import { completePasswordReset } from '@/server/services/email-otp';

export async function POST(request: Request) {
  try {
    const data = await parseBody(request, completeEmailPasswordResetSchema);
    await completePasswordReset({ authorization: data.resetAuthorization, newPassword: data.newPassword, ip: clientIp(request) });
    return ok({ passwordReset: true, loginRequired: true });
  } catch (error) { return handleError(error); }
}
