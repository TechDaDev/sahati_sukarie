export type GlucosePoint = { at: string; value: number };

/**
 * متوسط القيم في نافذة زمنية حول حدث معيّن (مثل جرعة دواء أو نشاط).
 * يُستخدم لعرض فرق المتوسط قبل/بعد الحدث كوصف رقمي محايد فقط.
 * ملاحظة صريحة: لا يُستنتج من هذا الرقم أي علاقة سببية.
 */
export function windowAverageDelta(
  points: GlucosePoint[],
  eventAt: string,
  hoursBefore = 3,
  hoursAfter = 3,
): { before: number | null; after: number | null; delta: number | null } {
  const t = new Date(eventAt).getTime();
  const before = points.filter((p) => {
    const ts = new Date(p.at).getTime();
    return ts >= t - hoursBefore * 3600_000 && ts < t;
  });
  const after = points.filter((p) => {
    const ts = new Date(p.at).getTime();
    return ts > t && ts <= t + hoursAfter * 3600_000;
  });
  const avg = (list: GlucosePoint[]) =>
    list.length ? list.reduce((sum, p) => sum + p.value, 0) / list.length : null;
  const beforeAvg = avg(before);
  const afterAvg = avg(after);
  return {
    before: beforeAvg,
    after: afterAvg,
    delta: beforeAvg !== null && afterAvg !== null ? afterAvg - beforeAvg : null,
  };
}
