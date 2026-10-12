'use client';
/**
 * الرسوم البيانية (Recharts) — كل التسميات عربية، والاتجاه RTL.
 * لا تُرسم أي نقاط غير موجودة في البيانات، ولا تُعرض نطاقات علاجية مستهدفة.
 */
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatDate, formatNumber, formatShortDay, formatTime } from '@/lib/format';
import type { NumeralSystem } from '@/lib/format';

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

type Props = {
  data: GlucosePoint[];
  unit: 'MG_DL' | 'MMOL_L';
  timezone: string;
  numeralSystem: NumeralSystem;
  height?: number;
};

const tooltipStyle = {
  direction: 'rtl' as const,
  fontFamily: 'Cairo, system-ui, sans-serif',
  fontSize: 12,
  borderRadius: 12,
  border: '1px solid #DCEAF6',
  boxShadow: '0 8px 24px -12px rgba(23,50,77,0.35)',
  textAlign: 'right' as const,
};

/** مخطط اتجاه قراءات السكر (خطي) */
export function GlucoseTrendChart({ data, unit, timezone, numeralSystem, height = 250 }: Props) {
  const unitLabel = unit === 'MG_DL' ? 'mg/dL' : 'mmol/L';
  const points = data.map((p) => ({
    at: p.at,
    value: Number(p.value.toFixed(unit === 'MG_DL' ? 0 : 1)),
    label: formatShortDay(p.at, timezone, numeralSystem),
  }));

  return (
    <div style={{ width: '100%', height }} dir="rtl">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#E3EDF5" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }} tickLine={false} axisLine={{ stroke: '#DCEAF6' }} />
          <YAxis
            tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }}
            tickLine={false}
            axisLine={false}
            orientation="right"
            width={44}
            tickFormatter={(v: number) => formatNumber(v, unit === 'MG_DL' ? 0 : 1, numeralSystem)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [`${formatNumber(value, unit === 'MG_DL' ? 0 : 1, numeralSystem)} ${unitLabel}`, 'القراءة']}
            labelFormatter={(label: string, payload?: ReadonlyArray<{ payload?: GlucosePoint }>) => {
              const raw = payload?.[0]?.payload?.at;
              return raw
                ? `${formatDate(raw, timezone, numeralSystem)} — ${formatTime(raw, timezone, numeralSystem)}`
                : String(label);
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#2463A6"
            strokeWidth={2.4}
            dot={{ r: 3, fill: '#2463A6', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** مخطط خط زمني مصغّر للمقارنة (سكر + وسوم الأحداث) */
export function GlucoseWithEventsChart({
  glucose, markers, unit, timezone, numeralSystem, height = 260,
}: Omit<Props, 'data'> & {
  glucose: GlucosePoint[];
  markers: Array<{ at: string; kind: string; label: string }>;
}) {
  const unitLabel = unit === 'MG_DL' ? 'mg/dL' : 'mmol/L';
  const points = glucose.map((p) => ({
    at: p.at,
    value: Number(p.value.toFixed(unit === 'MG_DL' ? 0 : 1)),
    label: formatShortDay(p.at, timezone, numeralSystem),
  }));

  return (
    <div style={{ width: '100%', height }} dir="rtl">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#E3EDF5" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }} tickLine={false} axisLine={{ stroke: '#DCEAF6' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }} tickLine={false} axisLine={false} orientation="right" width={44} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [`${formatNumber(value, unit === 'MG_DL' ? 0 : 1, numeralSystem)} ${unitLabel}`, 'القراءة']}
            labelFormatter={(label: string, payload?: ReadonlyArray<{ payload?: GlucosePoint }>) => {
              const raw = payload?.[0]?.payload?.at;
              if (!raw) return String(label);
              const day = formatDate(raw, timezone, numeralSystem);
              const dayMarkers = markers.filter((m) => formatDate(m.at, timezone, 'LATIN') === formatDate(raw, timezone, 'LATIN'));
              const markerText = dayMarkers.length
                ? ` — أحداث: ${dayMarkers.map((m) => `${m.label} ${formatTime(m.at, timezone, numeralSystem)}`).join('، ')}`
                : '';
              return `${day}${markerText}`;
            }}
          />
          <Line type="monotone" dataKey="value" stroke="#2463A6" strokeWidth={2.2}
            dot={{ r: 2.6, fill: '#2463A6', strokeWidth: 0 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-[11px] text-ink-muted">
        تُعرض الأحداث المسجّلة (أدوية، وجبات، نشاط) كمرجع زمني فقط — لا تستنتج المنصة أي علاقة سببية بينها وبين القراءات.
      </p>
    </div>
  );
}

/** مخطط الوزن */
export function WeightChart({
  data, numeralSystem, height = 220,
}: { data: Array<{ date: string; weightKg: number }>; numeralSystem: NumeralSystem; height?: number }) {
  const points = data.map((d) => ({ label: d.date, value: d.weightKg }));
  return (
    <div style={{ width: '100%', height }} dir="rtl">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16A6A0" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#16A6A0" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E3EDF5" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }} tickLine={false} axisLine={{ stroke: '#DCEAF6' }} />
          <YAxis domain={['dataMin - 3', 'dataMax + 3']} tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }}
            tickLine={false} axisLine={false} orientation="right"
            width={numeralSystem === 'ARABIC_INDIC' ? 52 : 44}
            tickFormatter={(v: number) => formatNumber(v, 0, numeralSystem)} />
          <Tooltip contentStyle={tooltipStyle}
            formatter={(value: number) => [`${formatNumber(value, 1, numeralSystem)} كغم`, 'الوزن']}
            labelFormatter={(label: string) => `التاريخ: ${label}`} />
          <Area type="monotone" dataKey="value" stroke="#16A6A0" strokeWidth={2.2} fill="url(#weightFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** مخطط تاريخ السكر التراكمي HbA1c أو أي قيم مخبرية */
export function LabHistoryChart({
  data, unit, numeralSystem, height = 200,
}: { data: Array<{ date: string; value: number; unit: string }>; unit?: string; numeralSystem: NumeralSystem; height?: number }) {
  const points = data.map((d) => ({ label: d.date, value: d.value }));
  return (
    <div style={{ width: '100%', height }} dir="rtl">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#E3EDF5" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }} tickLine={false} axisLine={{ stroke: '#DCEAF6' }} />
          <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }}
            tickLine={false} axisLine={false} orientation="right"
            width={numeralSystem === 'ARABIC_INDIC' ? 52 : 44} />
          <Tooltip contentStyle={tooltipStyle}
            formatter={(value: number) => [`${formatNumber(value, 1, numeralSystem)} ${unit ?? ''}`, 'القيمة']} />
          <Line type="monotone" dataKey="value" stroke="#E6A23C" strokeWidth={2.2}
            dot={{ r: 3, fill: '#E6A23C', strokeWidth: 0 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** مخطط أعمدة لإجمالي دقائق النشاط حسب اليوم */
export function ActivityBarsChart({
  data, numeralSystem, height = 200,
}: { data: Array<{ date: string; minutes: number; label: string }>; numeralSystem: NumeralSystem; height?: number }) {
  return (
    <div style={{ width: '100%', height }} dir="rtl">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#E3EDF5" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }} tickLine={false} axisLine={{ stroke: '#DCEAF6' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }} tickLine={false} axisLine={false} orientation="right"
            width={numeralSystem === 'ARABIC_INDIC' ? 52 : 44}
            tickFormatter={(v: number) => formatNumber(v, 0, numeralSystem)} />
          <Tooltip contentStyle={tooltipStyle}
            formatter={(value: number) => [`${formatNumber(value, 0, numeralSystem)} دقيقة`, 'المدة']} />
          <Bar dataKey="minutes" fill="#16A6A0" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** متوسط القراءات حسب سياق القياس (أعمدة أفقية عبر Recharts) */
export function ContextAverageChart({
  data, unit, numeralSystem, height = 240,
}: { data: Array<{ context: string; averageMgdl: number; count: number; label: string }>; unit: 'MG_DL' | 'MMOL_L'; numeralSystem: NumeralSystem; height?: number }) {
  const unitLabel = unit === 'MG_DL' ? 'mg/dL' : 'mmol/L';
  const points = data.map((d) => ({
    label: d.label,
    value: Number((unit === 'MG_DL' ? d.averageMgdl : d.averageMgdl / 18.0182).toFixed(unit === 'MG_DL' ? 0 : 1)),
    count: d.count,
  }));
  return (
    <div style={{ width: '100%', height }} dir="rtl">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#E3EDF5" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#6B8299', fontFamily: 'Cairo' }} tickLine={false} axisLine={{ stroke: '#DCEAF6' }} reversed />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#3C5872', fontFamily: 'Cairo' }}
            tickLine={false} axisLine={false} orientation="right" width={110} />
          <Tooltip contentStyle={tooltipStyle}
            formatter={(value: number, _n, payload) => [
              `${formatNumber(value, unit === 'MG_DL' ? 0 : 1, numeralSystem)} ${unitLabel} (${formatNumber((payload as { payload?: { count?: number } })?.payload?.count ?? 0, 0, numeralSystem)} قراءة)`,
              'المتوسط',
            ]} />
          <Legend wrapperStyle={{ fontFamily: 'Cairo', fontSize: 11, direction: 'rtl' }} formatter={() => 'متوسط القراءات المسجّلة'} />
          <Bar dataKey="value" fill="#2463A6" radius={[0, 6, 6, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
