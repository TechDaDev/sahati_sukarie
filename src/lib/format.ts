/**
 * أدوات التنسيق للعرض بالعربية (تواريخ، أرقام، وحدات، مؤشر كتلة الجسم).
 * التخزين داخليًا بـ UTC، والعرض افتراضيًا بتوقيت Asia/Baghdad.
 */

export const DEFAULT_TZ = 'Asia/Baghdad';

export type NumeralSystem = 'LATIN' | 'ARABIC_INDIC';

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** تحويل الأرقام اللاتينية إلى أرقام عربية-هندية عند اختيار المستخدم ذلك */
export function toArabicIndic(input: string): string {
  return input.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

export function applyNumerals(value: string, system: NumeralSystem = 'LATIN'): string {
  return system === 'ARABIC_INDIC' ? toArabicIndic(value) : value;
}

/** تنسيق رقم بمنازل عشرية محددة */
export function formatNumber(
  value: number | string | null | undefined,
  decimals = 0,
  system: NumeralSystem = 'LATIN',
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  const out = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return applyNumerals(out, system);
}

/** تنسيق التاريخ بالتوقيت المحلي: 2026/10/12 */
export function formatDate(
  value: Date | string | null | undefined,
  tz: string = DEFAULT_TZ,
  system: NumeralSystem = 'LATIN',
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return applyNumerals(`${get('year')}/${get('month')}/${get('day')}`, system);
}

/** تنسيق الوقت بنظام 12 ساعة مع ص/م */
export function formatTime(
  value: Date | string | null | undefined,
  tz: string = DEFAULT_TZ,
  system: NumeralSystem = 'LATIN',
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const period = get('dayPeriod').toUpperCase().includes('PM') ? 'م' : 'ص';
  return applyNumerals(`${get('hour')}:${get('minute')} ${period}`, system);
}

export function formatDateTime(
  value: Date | string | null | undefined,
  tz: string = DEFAULT_TZ,
  system: NumeralSystem = 'LATIN',
): string {
  if (!value) return '—';
  return `${formatDate(value, tz, system)} — ${formatTime(value, tz, system)}`;
}

/**
 * تنسيق الوقت بنظام 24 ساعة (يُستخدم في المستندات الرسمية والطوابع الزمنية).
 */
export function formatTime24(
  value: Date | string | null | undefined,
  tz: string = DEFAULT_TZ,
  system: NumeralSystem = 'LATIN',
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return applyNumerals(`${hour}:${get('minute')}`, system);
}

/** أسماء الأشهر بالعربية (للرسوم البيانية) */
export const ARABIC_MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

/** اسم مختصر للتاريخ في الرسوم: 12/10 */
export function formatShortDay(value: Date | string, tz: string = DEFAULT_TZ, system: NumeralSystem = 'LATIN'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return applyNumerals(`${get('day')}/${get('month')}`, system);
}

/** تاريخ اليوم بتوقيت العرض بصيغة YYYY-MM-DD */
export function todayISO(tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

/** تحويل تاريخ/وقت محلي (بتوقيت بغداد) إلى كائن Date بـ UTC */
export function localInputToUtc(dateStr: string, timeStr: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  // إيجاد الإزاحة الفعلية لتوقيت العرض في ذلك التاريخ
  const utcGuess = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
  const offset = tzOffsetMinutes(new Date(utcGuess), tz);
  return new Date(utcGuess - offset * 60_000);
}

function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return (asUTC - date.getTime()) / 60_000;
}

/** تحويل كائن Date إلى قيم للإدخال في النماذج (بتوقيت العرض) */
export function utcToLocalInput(value: Date | string, tz: string = DEFAULT_TZ): { date: string; time: string } {
  const d = typeof value === 'string' ? new Date(value) : value;
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` };
}

/* ------------------------------------------------------ حسابات طبية مساعدة */

/** العمر بالسنوات من تاريخ الميلاد */
export function calculateAge(dateOfBirth: string | Date, at: Date = new Date()): number {
  const dob = typeof dateOfBirth === 'string' ? new Date(`${dateOfBirth}T00:00:00Z`) : dateOfBirth;
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = at.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/** تحويل وحدات السكر: mmol/L = mg/dL ÷ 18.0182 */
export const MGDL_PER_MMOL = 18.0182;

export function toMgdl(value: number, unit: 'MG_DL' | 'MMOL_L'): number {
  return unit === 'MG_DL' ? value : value * MGDL_PER_MMOL;
}

export function fromMgdl(valueMgdl: number, unit: 'MG_DL' | 'MMOL_L'): number {
  return unit === 'MG_DL' ? valueMgdl : valueMgdl / MGDL_PER_MMOL;
}

export function convertGlucose(value: number, from: 'MG_DL' | 'MMOL_L', to: 'MG_DL' | 'MMOL_L'): number {
  return fromMgdl(toMgdl(value, from), to);
}

/** تنسيق قراءة السكر بوحدة العرض مع تقريب مناسب (عشري واحد لوحدة mmol/L) */
export function formatGlucose(
  valueMgdl: number | null | undefined,
  displayUnit: 'MG_DL' | 'MMOL_L' = 'MG_DL',
  system: NumeralSystem = 'LATIN',
): string {
  if (valueMgdl === null || valueMgdl === undefined) return '—';
  const v = fromMgdl(Number(valueMgdl), displayUnit);
  return `${formatNumber(v, displayUnit === 'MG_DL' ? 0 : 1, system)} ${displayUnit === 'MG_DL' ? 'mg/dL' : 'mmol/L'}`;
}

/** مؤشر كتلة الجسم — مؤشر معلوماتي فقط ولا يُستخدم للتشخيص */
export function calculateBmi(weightKg: number | string | null, heightCm: number | string | null): number | null {
  const w = Number(weightKg);
  const h = Number(heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0 || w <= 0) return null;
  const meters = h / 100;
  return w / (meters * meters);
}

/** وصف معلوماتي عام لفئة مؤشر كتلة الجسم (بدون أي تشخيص) */
export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'أقل من النطاق الشائع';
  if (bmi < 25) return 'داخل النطاق الشائع';
  if (bmi < 30) return 'أعلى من النطاق الشائع';
  return 'أعلى بكثير من النطاق الشائع';
}

export function formatDuration(minutes: number | null | undefined, system: NumeralSystem = 'LATIN'): string {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${formatNumber(m, 0, system)} دقيقة`;
  if (m === 0) return `${formatNumber(h, 0, system)} ساعة`;
  return `${formatNumber(h, 0, system)} ساعة و${formatNumber(m, 0, system)} دقيقة`;
}

/** مدة بصيغة مختصرة للساعات: 7.5 ساعة */
export function formatHours(minutes: number | null | undefined, system: NumeralSystem = 'LATIN'): string {
  if (minutes === null || minutes === undefined) return '—';
  return `${formatNumber(minutes / 60, 1, system)} ساعة`;
}

export function pct(value: number | null | undefined, system: NumeralSystem = 'LATIN'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, 0, system)}%`;
}
