/**
 * PUT /api/profile/conditions — حفظ الأمراض المصاحبة (المجموعة ب).
 * كل حالة لها وضع مستقل: مُشخّصة / غير مُشخّصة / غير معروف.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db';
import { patientConditions } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listConditions } from '@/server/services/records';
import { conditionSchema } from '@/server/validation/schemas';

const bodySchema = z.object({ conditions: z.array(conditionSchema).max(20) });

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    return ok({ conditions: await listConditions(full.profile.id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const { conditions } = await parseBody(request, bodySchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    await db.transaction(async (tx) => {
      for (const c of conditions) {
        await tx.insert(patientConditions).values({
          patientId: full.profile.id,
          conditionType: c.conditionType,
          status: c.status,
          notes: c.notes ?? null,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [patientConditions.patientId, patientConditions.conditionType],
          set: { status: c.status, notes: c.notes ?? null, updatedAt: new Date() },
        });
      }
      // إزالة الحالات التي لم تُعد مذكورة
      const types = conditions.map((c) => c.conditionType);
      const rows = await tx.select().from(patientConditions).where(eq(patientConditions.patientId, full.profile.id));
      for (const row of rows) {
        if (!types.includes(row.conditionType)) {
          await tx.delete(patientConditions)
            .where(and(eq(patientConditions.patientId, full.profile.id), eq(patientConditions.id, row.id)));
        }
      }
    });

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'CONDITIONS_UPDATED',
      targetType: 'patient_conditions', targetId: full.profile.id,
      metadata: { count: conditions.length }, ip,
    });
    return ok({ saved: true });
  } catch (error) {
    return handleError(error);
  }
}
