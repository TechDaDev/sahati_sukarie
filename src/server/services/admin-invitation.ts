import { createHmac } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { adminInvitations, auditLogs, mobileSessions, sessions, users } from '@/server/db/schema';
import { assertRateLimit, hashPassword, ApiError } from '@/server/auth/session';
import { sha256Hex } from '@/server/lib/crypto';
import { env } from '@/server/env';

const INVALID_INVITATION = 'رابط الدعوة غير صالح أو منتهي الصلاحية.';

export async function acceptAdminInvitation(args: {
  token: string;
  newPassword: string;
  ip: string;
}): Promise<void> {
  const config = env();
  const ipHash = createHmac('sha256', config.SESSION_SECRET).update(args.ip).digest('hex');
  await assertRateLimit({ key: `admin-invitation:${ipHash}`, limit: 10, windowSeconds: 900 }, 'محاولات كثيرة. حاول لاحقًا.');

  const passwordHash = await hashPassword(args.newPassword);
  const tokenHash = sha256Hex(args.token);
  const now = new Date();

  await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT id, user_id FROM admin_invitations
      WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND expires_at > ${now}
      FOR UPDATE
    `);
    const invitation = result.rows[0] as { id: string; user_id: string } | undefined;
    if (!invitation) throw new ApiError(400, 'INVITATION_INVALID', INVALID_INVITATION);

    const [admin] = await tx.select({ id: users.id }).from(users).where(and(
      eq(users.id, invitation.user_id), eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE'), eq(users.mustChangePassword, true),
    )).limit(1);
    if (!admin) throw new ApiError(400, 'INVITATION_INVALID', INVALID_INVITATION);

    const [consumed] = await tx.update(adminInvitations).set({ consumedAt: now }).where(and(
      eq(adminInvitations.id, invitation.id), isNull(adminInvitations.consumedAt), gt(adminInvitations.expiresAt, now),
    )).returning({ id: adminInvitations.id });
    if (!consumed) throw new ApiError(400, 'INVITATION_INVALID', INVALID_INVITATION);

    await tx.update(users).set({ passwordHash, passwordChangedAt: now, mustChangePassword: false, updatedAt: now })
      .where(eq(users.id, admin.id));
    await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, admin.id), isNull(sessions.revokedAt)));
    await tx.update(mobileSessions).set({ revokedAt: now, revocationReason: 'ADMIN_INVITATION' })
      .where(and(eq(mobileSessions.userId, admin.id), isNull(mobileSessions.revokedAt)));
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: 'SYSTEM',
      action: 'ADMIN_INVITATION_ACCEPTED',
      targetType: 'user',
      targetId: admin.id,
      metadata: { passwordSet: true },
    });
  });
}
