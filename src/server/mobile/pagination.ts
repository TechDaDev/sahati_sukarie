import { ApiError } from '../auth/session';
import { pool } from '../db';
import { localInputToUtc, DEFAULT_TZ } from '../../lib/format';

type Collection = 'glucose' | 'medications' | 'administrations' | 'activities' | 'factors' | 'labs' | 'meals' | 'sleep' | 'symptoms' | 'weight';
type Config = { table: string; alias: string; timeColumn: string; dateOnly: boolean; joinedTable?: string; joinAlias?: string };
const CONFIG: Record<Collection, Config> = {
  glucose: { table: 'glucose_readings', alias: 'r', timeColumn: 'measurement_datetime', dateOnly: false },
  medications: { table: 'medications', alias: 'r', timeColumn: 'created_at', dateOnly: false },
  administrations: { table: 'medication_administrations', alias: 'r', timeColumn: 'administration_datetime', dateOnly: false, joinedTable: 'medications', joinAlias: 'm' },
  activities: { table: 'activity_records', alias: 'r', timeColumn: 'activity_datetime', dateOnly: false },
  factors: { table: 'daily_factors', alias: 'r', timeColumn: 'recorded_at', dateOnly: false },
  labs: { table: 'lab_results', alias: 'r', timeColumn: 'test_date', dateOnly: true },
  meals: { table: 'meal_records', alias: 'r', timeColumn: 'meal_datetime', dateOnly: false },
  sleep: { table: 'sleep_records', alias: 'r', timeColumn: 'sleep_date', dateOnly: true },
  symptoms: { table: 'symptom_records', alias: 'r', timeColumn: 'symptom_datetime', dateOnly: false },
  weight: { table: 'weight_records', alias: 'r', timeColumn: 'measurement_date', dateOnly: true },
};
const GLUCOSE_CONTEXTS = new Set(['FASTING', 'BEFORE_BREAKFAST', 'AFTER_BREAKFAST', 'BEFORE_LUNCH', 'AFTER_LUNCH', 'BEFORE_DINNER', 'AFTER_DINNER', 'BEFORE_SLEEP', 'OTHER']);

function invalid(message = 'معاملات الصفحة غير صحيحة.') { return new ApiError(400, 'PAGINATION_INVALID', message); }

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), camelize(nested)]));
}

function cursorEncode(cursor: { at: string; id: string; sort: 'asc' | 'desc' }): string {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor })).toString('base64url');
}

function cursorDecode(raw: string, sort: 'asc' | 'desc', dateOnly: boolean): { at: string; id: string } {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { v?: number; at?: string; id?: string; sort?: string };
    if (value.v !== 1 || value.sort !== sort || !value.at || !value.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)) throw invalid();
    if (dateOnly ? !/^\d{4}-\d{2}-\d{2}$/.test(value.at) : Number.isNaN(Date.parse(value.at))) throw invalid();
    return { at: value.at, id: value.id };
  } catch { throw invalid('مؤشر الصفحة غير صالح أو لا يطابق اتجاه الترتيب.'); }
}

export async function listMobilePage(collection: Collection, request: Request, patientId: string, profileTimezone: string) {
  const url = new URL(request.url);
  const allowed = new Set(['limit', 'cursor', 'from', 'to', 'tz', 'sort', 'status', 'context']);
  for (const key of url.searchParams.keys()) if (!allowed.has(key)) throw invalid(`معامل الاستعلام غير مدعوم: ${key}`);
  const limitRaw = url.searchParams.get('limit') ?? '50';
  if (!/^\d+$/.test(limitRaw)) throw invalid();
  const limit = Number(limitRaw);
  if (limit < 1 || limit > 100) throw invalid('الحد يجب أن يكون بين 1 و100.');
  const sortRaw = url.searchParams.get('sort') ?? 'desc';
  if (sortRaw !== 'asc' && sortRaw !== 'desc') throw invalid('الترتيب المدعوم هو asc أو desc.');
  const sort = sortRaw;
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const timezone = url.searchParams.get('tz') ?? profileTimezone ?? DEFAULT_TZ;
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw invalid('المنطقة الزمنية غير صحيحة.'); }
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if ((from && !validDate(from)) || (to && !validDate(to))) throw invalid('التاريخ يجب أن يكون بصيغة YYYY-MM-DD.');
  if (from && to && from > to) throw invalid('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
  const cfg = CONFIG[collection];
  const alias = cfg.alias;
  const column = `${alias}.${cfg.timeColumn}`;
  const conditions = [`${alias}.patient_id = $1`];
  const values: unknown[] = [patientId];
  const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
  if (from) conditions.push(`${column} >= ${cfg.dateOnly ? `${add(from)}::date` : add(localInputToUtc(from, '00:00', timezone))}`);
  if (to) {
    const end = cfg.dateOnly ? to : new Date(localInputToUtc(to, '00:00', timezone).getTime() + 86_400_000);
    conditions.push(`${column} ${cfg.dateOnly ? '<=' : '<'} ${add(end)}${cfg.dateOnly ? '::date' : ''}`);
  }
  if (collection === 'medications') {
    const status = url.searchParams.get('status');
    if (status && status !== 'ACTIVE' && status !== 'INACTIVE') throw invalid('حالة الدواء غير صحيحة.');
    if (status) conditions.push(`${alias}.status = ${add(status)}`);
  } else if (url.searchParams.has('status')) throw invalid('معامل status متاح لقائمة الأدوية فقط.');
  if (collection === 'glucose') {
    const context = url.searchParams.get('context');
    if (context && context !== 'ALL') {
      if (!GLUCOSE_CONTEXTS.has(context)) throw invalid('سياق القياس غير صحيح.');
      conditions.push(`${alias}.measurement_context = ${add(context)}`);
    }
  } else if (url.searchParams.has('context')) throw invalid('معامل context متاح لقائمة قياسات السكر فقط.');
  const rawCursor = url.searchParams.get('cursor');
  let cursor: { at: string; id: string } | undefined;
  if (rawCursor) {
    cursor = cursorDecode(rawCursor, sort, cfg.dateOnly);
    const timeParam = add(cursor.at);
    const idParam = add(cursor.id);
    const op = sort === 'desc' ? '<' : '>';
    conditions.push(`(${column} ${op} ${timeParam}${cfg.dateOnly ? '::date' : '::timestamptz'} OR (${column} = ${timeParam}${cfg.dateOnly ? '::date' : '::timestamptz'} AND ${alias}.id ${op} ${idParam}::uuid))`);
  }
  const order = sort === 'desc' ? 'DESC' : 'ASC';
  const pageLimit = add(limit + 1);
  const select = cfg.joinedTable
    ? `SELECT to_jsonb(r) AS item, to_jsonb(m) AS joined FROM ${cfg.table} r JOIN ${cfg.joinedTable} m ON m.id=r.medication_id`
    : `SELECT to_jsonb(r) AS item FROM ${cfg.table} r`;
  const query = `${select} WHERE ${conditions.join(' AND ')} ORDER BY ${column} ${order}, ${alias}.id ${order} LIMIT ${pageLimit}`;
  const result = await pool.query(query, values);
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit).map((row) => cfg.joinedTable
    ? { administration: camelize(row.item), medication: camelize(row.joined) }
    : camelize(row.item));
  const last = result.rows[Math.min(result.rows.length, limit) - 1];
  const rawAt = last?.item?.[cfg.timeColumn];
  const nextCursor = hasMore && last ? cursorEncode({ at: cfg.dateOnly ? String(rawAt).slice(0, 10) : new Date(rawAt).toISOString(), id: last.item.id, sort }) : null;
  return { items: rows, pagination: { limit, hasMore, nextCursor, sort } };
}
