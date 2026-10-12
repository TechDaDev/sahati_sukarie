/** GET /api/auth/session — معلومات الجلسة الحالية (بدون أي بيانات صحية) */
import { getCurrentSession } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return ok({ authenticated: false });
    return ok({
      authenticated: true,
      user: { id: session.user.id, email: session.user.email, role: session.user.role },
      csrfToken: session.csrfToken,
      mustChangePassword: session.user.mustChangePassword,
    });
  } catch (error) {
    return handleError(error);
  }
}
