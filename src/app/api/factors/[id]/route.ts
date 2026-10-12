/** DELETE /api/factors/[id] */
import { db } from '@/server/db';
import { dailyFactors } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { deleteOwnedRecord } from '@/server/services/records';

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const { id } = await ctx.params;
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    await deleteOwnedRecord(dailyFactors as never, full.profile.id, id);
    await writeAudit({ actorUserId: session.user.id, actorRole: 'PATIENT', action: 'DAILY_FACTOR_DELETED', targetType: 'daily_factor', targetId: id, ip });
    return ok({ deleted: true });
  } catch (error) { return handleError(error); }
}
