/**
 * POST /api/auth/change-password — تغيير كلمة المرور للمستخدم المسجّل.
 * يُلغي جميع الجلسات الأخرى، ويرفع شرط تغيير كلمة المرور الأولية للمدير.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { mobileSessions } from '@/server/db/schema';
import { users } from '@/server/db/schema';
import {
  ApiError, assertRateLimit, guard, hashPassword, revokeAllUserSessions, verifyPassword, writeAudit,
} from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { changePasswordSchema } from '@/server/validation/schemas';

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT', 'ADMIN'] });
    await assertRateLimit({ key: `pwchange:${session.user.id}`, limit: 10, windowSeconds: 3600 },
      'تم تجاوز عدد محاولات تغيير كلمة المرور المسموح بها.');

    const data = await parseBody(request, changePasswordSchema);
    const row = await db.query.users.findFirst({ where: (u, { eq: e }) => e(u.id, session.user.id) });
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'الحساب غير موجود.');

    const valid = await verifyPassword(data.currentPassword, row.passwordHash);
    if (!valid) {
      throw new ApiError(400, 'INVALID_PASSWORD', 'كلمة المرور الحالية غير صحيحة.', { currentPassword: 'كلمة المرور الحالية غير صحيحة' });
    }
    if (await verifyPassword(data.newPassword, row.passwordHash)) {
      throw new ApiError(400, 'SAME_PASSWORD', 'كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية.', { newPassword: 'اختر كلمة مرور مختلفة' });
    }

    await db.update(users).set({
      passwordHash: await hashPassword(data.newPassword),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      updatedAt: new Date(),
    }).where(eq(users.id, session.user.id));

    // إلغاء الجلسات الأخرى (تُبقي الجلسة الحالية صالحة لتجربة سلسة)
    await revokeAllUserSessions(session.user.id, session.sessionId);
    await db.update(mobileSessions).set({ revokedAt: new Date(), revocationReason: 'password_changed' })
      .where(and(eq(mobileSessions.userId, session.user.id), isNull(mobileSessions.revokedAt)));

    await writeAudit({
      actorUserId: session.user.id, actorRole: session.user.role === 'ADMIN' ? 'ADMIN' : 'PATIENT',
      action: 'PASSWORD_CHANGED', targetType: 'user', targetId: session.user.id, ip,
    });

    return ok({ changed: true, otherSessionsRevoked: true });
  } catch (error) {
    return handleError(error);
  }
}
