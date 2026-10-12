/** POST /api/auth/login — تسجيل دخول المريض */
import { clientIp } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { authenticate } from '@/server/services/auth-service';
import { loginSchema } from '@/server/validation/schemas';

export async function POST(request: Request) {
  try {
    const data = await parseBody(request, loginSchema);
    const result = await authenticate(data.email, data.password, {
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      requireRole: 'PATIENT',
    });
    return ok({ role: result.role, csrfToken: result.csrfToken, mustChangePassword: result.mustChangePassword, redirectTo: '/dashboard' });
  } catch (error) {
    return handleError(error);
  }
}
