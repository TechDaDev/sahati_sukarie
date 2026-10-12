/**
 * GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * يُعيد ملخصًا مبنيًا على السجلات الفعلية فقط (لا بيانات وهمية).
 * الفلترة تُحسب بتوقيت المريض (Asia/Baghdad افتراضيًا) ثم تُحوَّل إلى UTC.
 */
import { ApiError, guard } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';
import { buildReportData } from '@/server/services/reports';
import { getProfileByUserId } from '@/server/services/patient';
import { localInputToUtc, todayISO } from '@/lib/format';
import { z } from 'zod';
import { dateOnlyString } from '@/server/validation/schemas';

const querySchema = z.object({ from: dateOnlyString, to: dateOnlyString });

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const url = new URL(request.url);
    const tz = full.profile.timezone;
    const parsed = querySchema.safeParse({
      from: url.searchParams.get('from') ?? todayISO(tz),
      to: url.searchParams.get('to') ?? todayISO(tz),
    });
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'نطاق التاريخ غير صحيح');
    }
    const { from, to } = parsed.data;
    if (from > to) throw new ApiError(400, 'VALIDATION', 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
    const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
    if (days > 366) throw new ApiError(400, 'VALIDATION', 'أقصى مدى للتقارير هو سنة واحدة.');

    const rangeStart = localInputToUtc(from, '00:00', tz);
    // نهاية اليوم الأخير شاملًا (يُعرض التاريخ الأخير كما اختاره المستخدم)
    const rangeEnd = new Date(localInputToUtc(to, '00:00', tz).getTime() + 86_400_000 - 1);

    const data = await buildReportData(session.user.id, { from: rangeStart, to: rangeEnd }, full.profile.preferredGlucoseUnit);
    return ok({ ...data, preferences: { unit: full.profile.preferredGlucoseUnit, numeralSystem: full.profile.numeralSystem, timezone: tz } });
  } catch (error) {
    return handleError(error);
  }
}
