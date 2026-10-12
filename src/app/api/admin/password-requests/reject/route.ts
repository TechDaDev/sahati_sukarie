/** POST /api/admin/password-requests/reject — رفض طلب استعادة مع سبب اختياري */
import { guard } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { rejectRequest } from '@/server/services/recovery';
import { recoveryRejectSchema } from '@/server/validation/schemas';

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['ADMIN'] });
    const data = await parseBody(request, recoveryRejectSchema);
    await rejectRequest(session.user.id, data.requestId, data.reason ?? null, ip);
    return ok({ rejected: true });
  } catch (error) {
    return handleError(error);
  }
}
