import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db';
import { auditLogs, mobileSessions, sessions, users } from '@/server/db/schema';
import { ApiError, guard } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';

const actionSchema = z.object({ action: z.enum(['SUSPEND', 'RESTORE']) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { session, ip } = await guard(request, { roles: ['ADMIN'] });
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, 'INVALID_ID', 'معرّف الحساب غير صالح.');
    if (session.user.mustChangePassword) throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'غيّر كلمة مرور المدير أولًا.');
    const recent = await db.select({ createdAt: sessions.createdAt }).from(sessions).where(eq(sessions.id, session.sessionId)).limit(1);
    if (!recent[0] || Date.now() - recent[0].createdAt.getTime() > 10 * 60_000) {
      throw new ApiError(403, 'RECENT_REAUTH_REQUIRED', 'سجّل الدخول مجددًا قبل تنفيذ هذا الإجراء.');
    }
    const { action } = await parseBody(request, actionSchema);
    const nextStatus = action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
    await db.transaction(async (tx) => {
      const target = await tx.select({ id: users.id, status: users.status, role: users.role }).from(users)
        .where(and(eq(users.id, id), eq(users.role, 'PATIENT'))).limit(1).for('update');
      const row = target[0];
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'الحساب غير موجود.');
      const expected = action === 'SUSPEND' ? 'ACTIVE' : 'SUSPENDED';
      if (row.status !== expected) throw new ApiError(409, 'ACCOUNT_STATUS_CONFLICT', 'حالة الحساب تغيّرت. حدّث الصفحة.');
      await tx.update(users).set({ status: nextStatus, updatedAt: new Date() }).where(eq(users.id, id));
      if (action === 'SUSPEND') {
        const now = new Date();
        await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
        await tx.update(mobileSessions).set({ revokedAt: now, revocationReason: 'account_suspended' }).where(and(eq(mobileSessions.userId, id), isNull(mobileSessions.revokedAt)));
      }
      await tx.insert(auditLogs).values({ actorUserId: session.user.id, actorRole: 'ADMIN', action: action === 'SUSPEND' ? 'ADMIN_ACCOUNT_SUSPENDED' : 'ADMIN_ACCOUNT_RESTORED', targetType: 'user', targetId: id, metadata: { previousStatus: row.status, status: nextStatus }, ipAddress: ip });
    });
    return ok({ id, status: nextStatus });
  } catch (error) { return handleError(error); }
}
