/**
 * PATCH  /api/glucose/[id] — تعديل قياس (مع تسجيل تعديل في سجل التدقيق)
 * DELETE /api/glucose/[id] — حذف قياس (مع الاحتفاظ بأثر التدقيق)
 *
 * لا يمكن للمريض الوصول إلا إلى قياساته هو (يُتحقق على الخادم في كل استعلام).
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { glucoseReadings } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { getGlucose } from '@/server/services/records';
import { glucoseSchema } from '@/server/validation/schemas';
import { GLUCOSE_ENTRY_LIMITS, glucoseInfoMessage, needsEntryConfirmation } from '@/lib/safety';
import { localInputToUtc, toMgdl } from '@/lib/format';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const { id } = await ctx.params;
    const data = await parseBody(request, glucoseSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const previous = await getGlucose(full.profile.id, id);
    const standardized = toMgdl(data.glucoseValue, data.glucoseUnit);

    if (standardized < GLUCOSE_ENTRY_LIMITS.absoluteMinMgdl || standardized > GLUCOSE_ENTRY_LIMITS.absoluteMaxMgdl) {
      throw new ApiError(400, 'VALUE_OUT_OF_RANGE', 'القيمة المدخلة خارج النطاق الممكن للقياس.',
        { glucoseValue: 'قيمة غير ممكنة — تحقق من الرقم والوحدة' });
    }
    const unusual = needsEntryConfirmation(standardized);
    if (unusual && !data.confirmedUnusual) {
      throw new ApiError(409, 'CONFIRM_REQUIRED', 'القيمة المدخلة غير معتادة. يرجى تأكيد أنها صحيحة قبل الحفظ.',
        { glucoseValue: 'بحاجة إلى تأكيد' });
    }

    await db.update(glucoseReadings).set({
      glucoseValue: String(data.glucoseValue),
      glucoseUnit: data.glucoseUnit,
      standardizedValueMgdl: standardized.toFixed(3),
      measurementDatetime: localInputToUtc(data.measurementDate, data.measurementTime, full.profile.timezone),
      measurementContext: data.measurementContext,
      minutesAfterMeal: data.minutesAfterMeal ?? null,
      source: data.source ?? 'NOT_SPECIFIED',
      symptomsText: data.symptoms ?? null,
      notes: data.notes ?? null,
      updatedAt: new Date(),
    }).where(and(eq(glucoseReadings.id, id), eq(glucoseReadings.patientId, full.profile.id)));

    // سجل تدقيق للتغييرات: القيم السابقة والجديدة (بدون أي بيانات هوية)
    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'GLUCOSE_UPDATED',
      targetType: 'glucose_reading', targetId: id,
      metadata: {
        before: {
          value: Number(previous.glucoseValue),
          unit: previous.glucoseUnit,
          at: previous.measurementDatetime,
          context: previous.measurementContext,
        },
        after: {
          value: data.glucoseValue,
          unit: data.glucoseUnit,
          at: data.measurementDate + ' ' + data.measurementTime,
          context: data.measurementContext,
        },
      },
      ip,
    });

    return ok({ updated: true, infoMessage: glucoseInfoMessage(standardized, full.profile.numeralSystem) });
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

    const previous = await getGlucose(full.profile.id, id);

    await db.delete(glucoseReadings)
      .where(and(eq(glucoseReadings.id, id), eq(glucoseReadings.patientId, full.profile.id)));

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'GLUCOSE_DELETED',
      targetType: 'glucose_reading', targetId: id,
      metadata: {
        deleted: {
          value: Number(previous.glucoseValue),
          unit: previous.glucoseUnit,
          at: previous.measurementDatetime,
          context: previous.measurementContext,
        },
      },
      ip,
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
