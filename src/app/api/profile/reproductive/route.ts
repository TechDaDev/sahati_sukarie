/**
 * PUT /api/profile/reproductive — معلومات الحمل/سكري الحمل عند ملاءمتها طبيًا.
 * الحقول اختيارية تمامًا ولا تُطلب من جميع المرضى.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { reproductiveHistory } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { reproductiveSchema } from '@/server/validation/schemas';

export async function PUT(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, reproductiveSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    await db.insert(reproductiveHistory).values({
      patientId: full.profile.id,
      pregnancyStatus: data.pregnancyStatus,
      gestationalDiabetesHistory: data.gestationalDiabetesHistory,
      notes: data.notes ?? null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: reproductiveHistory.patientId,
      set: {
        pregnancyStatus: data.pregnancyStatus,
        gestationalDiabetesHistory: data.gestationalDiabetesHistory,
        notes: data.notes ?? null,
        updatedAt: new Date(),
      },
    });

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'REPRODUCTIVE_INFO_UPDATED',
      targetType: 'reproductive_history', targetId: full.profile.id, ip,
    });
    return ok({ saved: true });
  } catch (error) {
    return handleError(error);
  }
}
