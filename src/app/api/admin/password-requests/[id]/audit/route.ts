/** GET /api/admin/password-requests/[id]/audit — سجل تدقيق الطلب (بيانات غير صحية) */
import { ApiError, guard } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';
import { formatDateTime } from '@/lib/format';
import { recoveryRequestAudit } from '@/server/services/recovery';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await guard(request, { roles: ['ADMIN'], csrf: false });
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, 'INVALID_ID', 'معرّف غير صحيح.');
    const rows = await recoveryRequestAudit(id);
    return ok({
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorRole: r.actorRole,
        metadata: r.metadata,
        createdAt: r.createdAt,
        createdAtDisplay: formatDateTime(r.createdAt, 'Asia/Baghdad'),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
