/** DELETE /api/administrations/[id] — حذف سجل جرعة خاطئ (مع تدقيق) */
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { medicationAdministrations } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const { id } = await ctx.params;
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const deleted = await db.delete(medicationAdministrations)
      .where(and(eq(medicationAdministrations.id, id), eq(medicationAdministrations.patientId, full.profile.id)))
      .returning({ id: medicationAdministrations.id, medicationId: medicationAdministrations.medicationId });
    if (!deleted.length) throw new ApiError(404, 'NOT_FOUND', 'لم يتم العثور على السجل.');

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'MEDICATION_ADMINISTRATION_DELETED',
      targetType: 'medication_administration', targetId: id,
      metadata: { medicationId: deleted[0]!.medicationId }, ip,
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
