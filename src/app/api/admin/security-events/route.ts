import { desc, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { guard } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';

const SECURITY_ACTIONS = [
  'LOGIN_FAILED', 'LOGIN_SUCCESS', 'MOBILE_LOGIN_FAILED', 'MOBILE_LOGIN_SUCCESS',
  'MOBILE_REFRESH_REPLAY', 'EMAIL_OTP_SENT', 'EMAIL_OTP_VERIFY_FAILED', 'EMAIL_OTP_DELIVERY_FAILED',
  'ACCOUNT_ACTIVATED', 'ACCOUNT_ACTIVATION_PENDING', 'PASSWORD_RESET_OTP_VERIFIED',
  'PASSWORD_RESET_COMPLETED', 'ADMIN_ACCOUNT_SUSPENDED', 'ADMIN_ACCOUNT_RESTORED',
];

export async function GET(request: Request) {
  try {
    await guard(request, { roles: ['ADMIN'], csrf: false });
    const url = new URL(request.url);
    const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page') ?? 1) || 1));
    const rows = await db.select({ id: auditLogs.id, actorRole: auditLogs.actorRole, action: auditLogs.action, targetType: auditLogs.targetType, createdAt: auditLogs.createdAt, ipAddress: auditLogs.ipAddress })
      .from(auditLogs).where(inArray(auditLogs.action, SECURITY_ACTIONS)).orderBy(desc(auditLogs.createdAt)).limit(50).offset((page - 1) * 50);
    return ok({ events: rows, page, perPage: 50 });
  } catch (error) { return handleError(error); }
}
