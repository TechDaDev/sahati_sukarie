/** POST /api/auth/logout — إنهاء الجلسة الحالية بأمان */
import { clearSessionCookie, clientIp, getCurrentSession, revokeCurrentSession, writeAudit } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (session) {
      await writeAudit({
        actorUserId: session.user.id,
        actorRole: session.user.role === 'ADMIN' ? 'ADMIN' : 'PATIENT',
        action: 'LOGOUT',
        targetType: 'user',
        targetId: session.user.id,
        ip: clientIp(request),
      });
    }
    await revokeCurrentSession();
    await clearSessionCookie();
    return ok({ loggedOut: true });
  } catch (error) {
    return handleError(error);
  }
}
