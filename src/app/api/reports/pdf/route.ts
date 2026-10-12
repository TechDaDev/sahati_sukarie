/**
 * GET /api/reports/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
 * يولّد ملف PDF عربي (RTL) للتقرير الصحي الشخصي.
 *
 * - متاح فقط للمريض المسجّل، ولا يُحتوي على الرقم الوطني إطلاقًا.
 * - يعتمد على المعلومات المُدخلة من المستخدم مع تنبيه صريح بذلك.
 */
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError } from '@/server/http';
import { buildReportData } from '@/server/services/reports';
import { getProfileByUserId } from '@/server/services/patient';
import { renderHealthReportPdf } from '@/server/reports/pdf';
import { localInputToUtc, todayISO } from '@/lib/format';
import { z } from 'zod';
import { dateOnlyString } from '@/server/validation/schemas';

const querySchema = z.object({ from: dateOnlyString, to: dateOnlyString });

export async function GET(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'], csrf: false });
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const url = new URL(request.url);
    const tz = full.profile.timezone;
    const parsed = querySchema.safeParse({
      from: url.searchParams.get('from') ?? todayISO(tz),
      to: url.searchParams.get('to') ?? todayISO(tz),
    });
    if (!parsed.success) throw new ApiError(400, 'VALIDATION', 'نطاق التاريخ غير صحيح');
    const { from, to } = parsed.data;
    if (from > to) throw new ApiError(400, 'VALIDATION', 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
    const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
    if (days > 366) throw new ApiError(400, 'VALIDATION', 'أقصى مدى للتقرير هو سنة واحدة.');

    const rangeStart = localInputToUtc(from, '00:00', tz);
    // نهاية اليوم الأخير شاملًا (يُعرض التاريخ الأخير كما اختاره المستخدم)
    const rangeEnd = new Date(localInputToUtc(to, '00:00', tz).getTime() + 86_400_000 - 1);

    const data = await buildReportData(session.user.id, { from: rangeStart, to: rangeEnd }, full.profile.preferredGlucoseUnit);

    let pdf: Uint8Array;
    try {
      pdf = await renderHealthReportPdf(data, {
        unit: full.profile.preferredGlucoseUnit,
        numeralSystem: full.profile.numeralSystem,
        timezone: tz,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[pdf] فشل توليد الملف:', message);
      throw new ApiError(503, 'PDF_UNAVAILABLE',
        'تعذّر توليد ملف PDF حاليًا. يرجى المحاولة لاحقًا أو التواصل مع الدعم الفني.');
    }

    await writeAudit({
      actorUserId: session.user.id, actorRole: 'PATIENT', action: 'REPORT_PDF_DOWNLOADED',
      targetType: 'report', targetId: `${from}:${to}`, ip,
    });

    return new Response(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sahati-report-${from}-${to}.pdf"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
