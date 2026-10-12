/**
 * PATCH  /api/medications/[id] — تعديل دواء، أو تعطيله (status=INACTIVE)
 * DELETE /api/medications/[id] — حذف دواء (يُمنع إذا توجد جرعات مسجّلة مرتبطة به)
 *
 * تعديل خطة الدواء لا يغيّر سجلات الجرعات الفعلية السابقة إطلاقًا.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { medicationAdministrations, medications } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { getMedication } from '@/server/services/records';
import { medicationSchema } from '@/server/validation/schemas';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const { id } = await ctx.params;
    const data = await parseBody(request, medicationSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const before = await getMedication(full.profile.id, id);

    await db.update(medications).set({
      medicationName: data.medicationName,
      category: data.category,
      strength: data.strength != null ? String(data.strength) : null,
      strengthUnit: data.strengthUnit ?? null,
      prescribedDose: data.prescribedDose != null ? String(data.prescribedDose) : null,
      doseUnit: data.doseUnit ?? null,
      route: data.route,
      frequency: data.frequency,
      usualTime: data.usualTime ? `${data.usualTime}:00` : null,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      prescriberName: data.prescriberName ?? null,
      insulinFormulation: data.insulinFormulation ?? null,
      notes: data.notes ?? null,
      status: data.status ?? before.status,
      updatedAt: new Date(),
    }).where(and(eq(medications.id, id), eq(medications.patientId, full.profile.id)));

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'MEDICATION_UPDATED',
      targetType: 'medication', targetId: id,
      metadata: { before: { name: before.medicationName, status: before.status }, after: { name: data.medicationName, status: data.status ?? before.status } },
      ip,
    });
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const { id } = await ctx.params;
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    await getMedication(full.profile.id, id);

    const counts = await db.select({ c: sql<number>`count(*)` }).from(medicationAdministrations)
      .where(and(eq(medicationAdministrations.medicationId, id), eq(medicationAdministrations.patientId, full.profile.id)));
    if (Number(counts[0]?.c ?? 0) > 0) {
      throw new ApiError(409, 'HAS_ADMINISTRATIONS',
        'لا يمكن حذف هذا الدواء لوجود جرعات مسجّلة مرتبطة به. يمكنك تعطيله بدلًا من ذلك للحفاظ على السجل التاريخي.');
    }

    await db.delete(medications).where(and(eq(medications.id, id), eq(medications.patientId, full.profile.id)));
    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'MEDICATION_DELETED',
      targetType: 'medication', targetId: id, ip,
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
