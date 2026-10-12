/**
 * GET  /api/glucose — قائمة قياسات السكر (مع فلترة بالتاريخ ونوع القياس)
 * POST /api/glucose — إضافة قياس جديد
 *
 * الوحدات: يُخزَّن دائمًا (1) القيمة كما أدخلها المستخدم مع وحدتها،
 *           و(2) تمثيل موحّد بوحدة mg/dL بدقة عالية للمقارنة والرسوم.
 */
import { db } from '@/server/db';
import { glucoseReadings } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { listGlucose } from '@/server/services/records';
import { glucoseSchema } from '@/server/validation/schemas';
import { GLUCOSE_ENTRY_LIMITS, glucoseInfoMessage, needsEntryConfirmation } from '@/lib/safety';
import { formatGlucose, localInputToUtc, toMgdl } from '@/lib/format';
import { z } from 'zod';

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  context: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const url = new URL(request.url);
    const params = querySchema.parse({
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      context: url.searchParams.get('context') ?? undefined,
    });

    let rows = await listGlucose(full.profile.id, { from: params.from, to: params.to, tz: full.profile.timezone });
    if (params.context && params.context !== 'ALL') {
      rows = rows.filter((r) => r.measurementContext === params.context);
    }

    return ok({
      preferredUnit: full.profile.preferredGlucoseUnit,
      readings: rows.map((r) => ({
        id: r.id,
        value: Number(r.glucoseValue),
        unit: r.glucoseUnit,
        standardizedValueMgdl: Number(r.standardizedValueMgdl),
        displayValue: formatGlucose(Number(r.standardizedValueMgdl), full.profile.preferredGlucoseUnit),
        measurementDatetime: r.measurementDatetime,
        measurementContext: r.measurementContext,
        minutesAfterMeal: r.minutesAfterMeal,
        source: r.source,
        symptomsText: r.symptomsText,
        notes: r.notes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, glucoseSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const standardized = toMgdl(data.glucoseValue, data.glucoseUnit);

    // حدود مطلقة تمنع الأخطاء الواضحة في الإدخال
    if (standardized < GLUCOSE_ENTRY_LIMITS.absoluteMinMgdl || standardized > GLUCOSE_ENTRY_LIMITS.absoluteMaxMgdl) {
      throw new ApiError(400, 'VALUE_OUT_OF_RANGE',
        'القيمة المدخلة خارج النطاق الممكن للقياس. تحقق من الرقم والوحدة المختارة.',
        { glucoseValue: 'قيمة غير ممكنة — تحقق من الرقم والوحدة' });
    }

    // قيم غير معتادة: نطلب تأكيدًا صريحًا ولا نعدّلها أو نحذفها
    const unusual = needsEntryConfirmation(standardized);
    if (unusual && !data.confirmedUnusual) {
      throw new ApiError(409, 'CONFIRM_REQUIRED',
        `القيمة المدخلة (${formatGlucose(standardized, 'MG_DL')}) غير معتادة. يرجى تأكيد أنها صحيحة قبل الحفظ.`,
        { glucoseValue: 'بحاجة إلى تأكيد' });
    }

    const measurementDatetime = localInputToUtc(data.measurementDate, data.measurementTime, full.profile.timezone);

    const [row] = await db.insert(glucoseReadings).values({
      patientId: full.profile.id,
      glucoseValue: String(data.glucoseValue),
      glucoseUnit: data.glucoseUnit,
      standardizedValueMgdl: standardized.toFixed(3),
      measurementDatetime,
      measurementContext: data.measurementContext,
      minutesAfterMeal: data.minutesAfterMeal ?? null,
      source: data.source ?? 'NOT_SPECIFIED',
      symptomsText: data.symptoms ?? null,
      notes: data.notes ?? null,
    }).returning();

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'GLUCOSE_CREATED',
      targetType: 'glucose_reading', targetId: row!.id,
      metadata: { context: data.measurementContext, unit: data.glucoseUnit, unusual }, ip,
    });

    return ok({
      id: row!.id,
      displayValue: formatGlucose(standardized, full.profile.preferredGlucoseUnit),
      infoMessage: glucoseInfoMessage(standardized, full.profile.numeralSystem),
    });
  } catch (error) {
    return handleError(error);
  }
}
