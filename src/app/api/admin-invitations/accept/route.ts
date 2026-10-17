import { clientIp } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { acceptAdminInvitationSchema } from '@/server/validation/schemas';
import { acceptAdminInvitation } from '@/server/services/admin-invitation';

export async function POST(request: Request) {
  try {
    const data = await parseBody(request, acceptAdminInvitationSchema);
    await acceptAdminInvitation({ token: data.token, newPassword: data.newPassword, ip: clientIp(request) });
    return ok({ passwordSet: true, loginUrl: '/admin/login' });
  } catch (error) { return handleError(error); }
}
