'use client';
/**
 * تحديد حسابات المرضى — الحد الأدنى من المعلومات التعريفية.
 * لا تُعرض أي بيانات صحية: لا قياسات ولا أدوية ولا يوميات ولا تشخيصات ولا تحاليل.
 */
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, Field, SectionTitle, Spinner } from '@/components/ui';
import { formatDate, formatDateTime, type NumeralSystem } from '@/lib/format';

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  nationalIdMasked: string;
  phoneNumber: string;
  phoneVerified: boolean;
  status: string;
  emailActivationRequired: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف مؤقتًا',
  DISABLED: 'معطّل',
};

export function UsersScreen({ numeralSystem }: { numeralSystem: NumeralSystem }) {
  const [query, setQuery] = useState('');
  const [selector, setSelector] = useState('auto');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (selector !== 'auto') params.set('selector', selector);
      if (status) params.set('status', status);
      const data = await api.get<{ users: UserRow[]; total: number }>(`/api/admin/users?${params.toString()}`);
      setRows(data.users);
      setTotal(data.total);
      setSearched(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(user: UserRow) {
    const action = user.status === 'ACTIVE' ? 'SUSPEND' : user.status === 'SUSPENDED' ? 'RESTORE' : null;
    if (!action) return;
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/admin/users/${user.id}/status`, { action });
      await search();
    } catch (err) {
      setError((err as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">تحديد حسابات المرضى</h1>
        <p className="mt-1 text-sm text-ink-muted">
          البحث متاح بالاسم، البريد الإلكتروني، الرقم الوطني (بحث محمي)، أو رقم الهاتف.
          تُعرض بيانات محدودة لإدارة حالة الحساب.
        </p>
      </div>

      <Alert tone="info" title="حدود الصلاحية">
        لا يُتيح هذا القسم الوصول إلى أي معلومات صحية: لا قراءات سكر، ولا أدوية، ولا يوميات، ولا نتائج تحاليل، ولا
        تشخيصات. كما لا يمكن للمدير تعيين كلمة مرور دائمة لأي حساب.
      </Alert>

      <Card>
        <SectionTitle>بحث</SectionTitle>
        <form onSubmit={search} className="grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <Field label="كلمة البحث" htmlFor="q"
              hint="مثال: الاسم الكامل، أو البريد، أو رقم الهاتف 07XXXXXXXXX، أو الرقم الوطني كاملًا (12 رقمًا).">
              <input id="q" className="field" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="اكتب للبحث…" autoComplete="off" />
            </Field>
          </div>
          <Field label="نوع البحث" htmlFor="selector" hint="اختر «الرقم الوطني» لتشغيل البحث المحمي بالفهرس.">
            <select id="selector" className="field" value={selector} onChange={(e) => setSelector(e.target.value)}>
              <option value="auto">تلقائي</option>
              <option value="name_email">الاسم أو البريد</option>
              <option value="phone">رقم الهاتف</option>
              <option value="national_id">الرقم الوطني (بحث محمي)</option>
            </select>
          </Field>
          <Field label="حالة الحساب" htmlFor="status">
            <select id="status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">الكل</option>
              <option value="ACTIVE">نشط</option>
              <option value="SUSPENDED">موقوف مؤقتًا</option>
              <option value="DISABLED">معطّل</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <Spinner /> : null} بحث
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-ink-muted">
          يُسجَّل البحث بالرقم الوطني في سجل التدقيق لأغراض المراجعة. الرقم الكامل لا يُخزَّن نصًا صريحًا في قاعدة البيانات.
        </p>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {searched ? (
        <Card>
          <SectionTitle>
            النتائج {rows ? `(${total})` : ''}
          </SectionTitle>

          {rows && rows.length === 0 ? (
            <EmptyState
              title="لا توجد نتائج مطابقة."
              description="تحقق من كتابة الاسم أو البريد أو الرقم، أو جرّب البحث بدون فلاتر."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-brand-100 text-right text-xs text-ink-muted">
                    <th className="px-2 py-2 font-semibold">الاسم الكامل</th>
                    <th className="px-2 py-2 font-semibold">البريد الإلكتروني</th>
                    <th className="px-2 py-2 font-semibold">الرقم الوطني (مقنّع)</th>
                    <th className="px-2 py-2 font-semibold">الهاتف</th>
                    <th className="px-2 py-2 font-semibold">الحالة</th>
                    <th className="px-2 py-2 font-semibold">تفعيل البريد</th>
                    <th className="px-2 py-2 font-semibold">تاريخ التسجيل</th>
                    <th className="px-2 py-2 font-semibold">آخر دخول</th>
                    <th className="px-2 py-2 font-semibold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((u) => (
                    <tr key={u.id} className="border-b border-brand-50">
                      <td className="px-2 py-2.5 font-semibold">{u.fullName}</td>
                      <td className="px-2 py-2.5 text-xs" dir="ltr">{u.email}</td>
                      <td className="px-2 py-2.5 num">{u.nationalIdMasked}</td>
                      <td className="px-2 py-2.5">
                        <span className="num text-xs" dir="ltr">{u.phoneNumber}</span>
                        <span className="mt-1 block">
                          {u.phoneVerified
                            ? <Badge tone="ok">مُتحقَّق منه</Badge>
                            : <Badge tone="warn">غير مُتحقق إلكترونيًا</Badge>}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge tone={u.status === 'ACTIVE' ? 'ok' : 'danger'}>{STATUS_LABEL[u.status] ?? u.status}</Badge>
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge tone={u.emailVerifiedAt ? 'ok' : 'neutral'}>{u.emailVerifiedAt ? 'مُتحقَّق' : u.emailActivationRequired ? 'بانتظار التفعيل' : 'غير مطلوب'}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-xs num">{formatDate(u.createdAt, 'Asia/Baghdad', numeralSystem)}</td>
                      <td className="px-2 py-2.5 text-xs num">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt, 'Asia/Baghdad', numeralSystem) : '—'}
                      </td>
                      <td className="px-2 py-2.5">
                        {u.status === 'ACTIVE' || u.status === 'SUSPENDED' ? (
                          <button type="button" className="btn-outline btn-sm" disabled={loading} onClick={() => void changeStatus(u)}>
                            {u.status === 'ACTIVE' ? 'إيقاف' : 'استعادة'}
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
