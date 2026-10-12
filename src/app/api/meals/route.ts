/**
 * GET  /api/meals — الوجبات المسجّلة
 * POST /api/meals — تسجيل وجبة (وصف مختصر + كربوهيدرات تقديرية اختيارية)
 * عدد الكربوهيدرات اختياري تمامًا ولا يُطلب لكل وجبة.
 */
import { db } from '@/server/db';
import { mealRecords } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listMeals } from '@/server/services/records';
import { mealSchema } from '@/server/validation/schemas';
import { localInputToUtc } from '@/lib/format';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const url = new URL(request.url);
    const rows = await listMeals(full.profile.id, {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      tz: full.profile.timezone,
    });
    return ok({ meals: rows });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, mealSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');
    const [row] = await db.insert(mealRecords).values({
      patientId: full.profile.id,
      mealType: data.mealType,
      description: data.description ?? null,
      carbohydrateGrams: data.carbohydrateGrams != null ? String(data.carbohydrateGrams) : null,
      mealDatetime: localInputToUtc(data.mealDate, data.mealTime, full.profile.timezone),
      notes: data.notes ?? null,
    }).returning();
    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'MEAL_CREATED',
      targetType: 'meal_record', targetId: row!.id, ip,
    });
    return ok({ id: row!.id });
  } catch (error) {
    return handleError(error);
  }
}
