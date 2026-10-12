'use client';
/**
 * لوحة طلبات استعادة كلمة المرور.
 * ---------------------------------------------------------------------------
 * سير العمل الإلزامي: انتظار → تحقق يدوي → إصدار رمز → إكمال/رفض.
 * الرمز الصريح يظهر مرة واحدة فقط في هذه الصفحة ولا يُخزَّن ولا يُستعاد بعد مغادرتها.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, Field, Modal, SectionTitle, Spinner, StatCard } from '@/components/ui';
import { formatDate, formatDateTime, type NumeralSystem } from '@/lib/format';
import { labelOf } from '@/lib/labels';

type RequestRow = {
  id: string;
  status: string;
  requestDate: string;
  requestDateDisplay: string;
  verifiedAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  patientName: string;
  email: string;
  phoneNumber: string;
  phoneVerified: boolean;
  nationalIdMasked: string;
  accountStatus: string;
};

type AuditRow = {
  id: string;
  action: string;
  actorRole: string;
  metadata: unknown;
  createdAtDisplay: string;
};

const STATUS_TONE: Record<string, 'warn' | 'blue' | 'ok' | 'danger' | 'neutral'> = {
  PENDING: 'warn',
  VERIFIED: 'blue',
  COMPLETED: 'ok',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
};

const ACTION_LABELS: Record<string, string> = {
  RECOVERY_REQUEST_CREATED: 'إنشاء الطلب',
  RECOVERY_REQUEST_VERIFIED: 'تأكيد التحقق اليدوي من الهوية',
  RECOVERY_CODE_GENERATED: 'إصدار رمز استعادة',
  RECOVERY_REQUEST_COMPLETED: 'إكمال الطلب',
  RECOVERY_REQUEST_REJECTED: 'رفض الطلب',
  RECOVERY_CODE_FAILED: 'محاولة إدخال رمز فاشلة',
  PASSWORD_RESET_VIA_RECOVERY_CODE: 'تعيين كلمة مرور جديدة بواسطة الرمز',
  RECOVERY_REQUEST_UNKNOWN_EMAIL: 'طلب لبريد غير مسجّل',
};

export function RequestsScreen({
  initialRequests, numeralSystem,
}: { initialRequests: RequestRow[]; numeralSystem: NumeralSystem }) {
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<string>('PENDING');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [verifyTarget, setVerifyTarget] = useState<RequestRow | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [issueTarget, setIssueTarget] = useState<RequestRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [oneTimeCode, setOneTimeCode] = useState<{ code: string; expiresAt: string; requestId: string } | null>(null);
  const [audit, setAudit] = useState<{ requestId: string; rows: AuditRow[] } | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api.get<{ requests: RequestRow[] }>('/api/admin/password-requests');
      setRequests(data.requests);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // إخفاء الرمز عند مغادرة الصفحة (عدم إبقائه في الحالة أو التخزين المحلي)
  useEffect(() => {
    return () => setOneTimeCode(null);
  }, []);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (oneTimeCode) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [oneTimeCode]);

  async function run(requestId: string, action: () => Promise<void>) {
    setBusy(requestId + action.name);
    setError(null);
    setInfo(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const shown = filter === 'ALL' ? requests : requests.filter((r) => r.status === filter);
  const counts = {
    pending: requests.filter((r) => r.status === 'PENDING').length,
    verified: requests.filter((r) => r.status === 'VERIFIED').length,
    completed: requests.filter((r) => r.status === 'COMPLETED').length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">طلبات استعادة كلمة المرور</h1>
        <p className="mt-1 text-sm text-ink-muted">
          تُنشأ الطلبات من صفحة «استعادة كلمة المرور» للمريض. لا تُرسل أي رسائل تلقائية — التواصل يدوي عبر رقم الهاتف المسجّل.
        </p>
      </div>

      {info ? <Alert tone="ok">{info}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="قيد الانتظار" value={<span className="num">{counts.pending}</span>} tone={counts.pending ? 'warn' : 'neutral'} />
        <StatCard label="تم التحقق" value={<span className="num">{counts.verified}</span>} />
        <StatCard label="مكتملة" value={<span className="num">{counts.completed}</span>} tone="teal" />
      </div>

      {oneTimeCode ? (
        <Card className="border-amber-300 bg-amber-50/60">
          <SectionTitle>رمز الاستعادة (يظهر مرة واحدة فقط)</SectionTitle>
          <p className="text-sm leading-7 text-[#7A5210]">
            انسخ الرمز الآن وسلّمه للمريض عبر مكالمة هاتفية على الرقم المسجّل. لن يظهر هذا الرمز مرة أخرى، ولا يُخزَّن
            في قاعدة البيانات أو سجلات الخادم (يُخزَّن تجزئته فقط).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="num rounded-xl border border-amber-300 bg-white px-4 py-2 text-2xl font-bold tracking-[0.35em] text-ink">
              {oneTimeCode.code}
            </span>
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(oneTimeCode.code);
                  setInfo('تم نسخ الرمز إلى الحافظة.');
                } catch {
                  setError('تعذّر النسخ تلقائيًا — يرجى كتابة الرمز يدويًا.');
                }
              }}
            >
              نسخ الرمز
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOneTimeCode(null)}>
              إخفاء الرمز نهائيًا
            </button>
          </div>
          <p className="mt-2 text-xs text-[#7A5210]">
            ينتهي الرمز في: <span className="num">{formatDateTime(oneTimeCode.expiresAt, 'Asia/Baghdad', numeralSystem)}</span>
            {' '}(صلاحية 15 دقيقة، واستخدام واحد فقط).
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle
          action={
            <div className="flex flex-wrap gap-1.5">
              {[{ v: 'PENDING', l: 'قيد الانتظار' }, { v: 'VERIFIED', l: 'تم التحقق' }, { v: 'COMPLETED', l: 'مكتمل' }, { v: 'REJECTED', l: 'مرفوض' }, { v: 'ALL', l: 'الكل' }].map((f) => (
                <button key={f.v} type="button"
                  className={filter === f.v ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
                  onClick={() => setFilter(f.v)}>
                  {f.l}
                </button>
              ))}
            </div>
          }
        >
          الطلبات
        </SectionTitle>

        {shown.length === 0 ? (
          <EmptyState
            title="لا توجد طلبات مطابقة."
            description="عندما يُرسل مريض طلب استعادة كلمة مرور، سيظهر هنا مباشرة."
          />
        ) : (
          <div className="space-y-3">
            {shown.map((r) => (
              <div key={r.id} className="rounded-2xl border border-brand-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink">{r.patientName}</p>
                    <p className="mt-0.5 text-xs text-ink-muted" dir="ltr">{r.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{labelOf('recoveryStatus', r.status)}</Badge>
                    <span className="text-xs text-ink-muted num">
                      {formatDate(r.requestDate, 'Asia/Baghdad', numeralSystem)}
                    </span>
                  </div>
                </div>

                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-ink-muted">رقم الهاتف المسجّل</dt>
                    <dd className="mt-0.5 font-semibold num" dir="ltr">{r.phoneNumber}</dd>
                    <dd className="mt-0.5">
                      {r.phoneVerified
                        ? <Badge tone="ok">مُتحقَّق منه</Badge>
                        : <Badge tone="warn">لم يُتحقق منه إلكترونيًا</Badge>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">الرقم الوطني (مقنّع)</dt>
                    <dd className="mt-0.5 font-semibold num">{r.nationalIdMasked}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">حالة الحساب</dt>
                    <dd className="mt-0.5 font-semibold">{r.accountStatus === 'ACTIVE' ? 'نشط' : r.accountStatus}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">وقت الطلب</dt>
                    <dd className="mt-0.5 font-semibold num">{r.requestDateDisplay}</dd>
                  </div>
                </dl>

                {r.rejectionReason ? (
                  <p className="mt-2 text-xs text-alert">سبب الرفض: {r.rejectionReason}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === 'PENDING' ? (
                    <button type="button" className="btn-primary btn-sm" onClick={() => { setVerifyTarget(r); setVerifyNote(''); }}>
                      تأكيد التحقق اليدوي من الهوية
                    </button>
                  ) : null}

                  {r.status === 'VERIFIED' ? (
                    <button type="button" className="btn-teal btn-sm" onClick={() => setIssueTarget(r)}
                      disabled={busy !== null}>
                      {busy?.startsWith(r.id) ? <Spinner /> : null} إصدار رمز استعادة (15 دقيقة)
                    </button>
                  ) : null}

                  {(r.status === 'PENDING' || r.status === 'VERIFIED') ? (
                    <button type="button" className="btn-ghost btn-sm text-alert"
                      onClick={() => { setRejectTarget(r); setRejectReason(''); }}>
                      رفض الطلب
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => run(r.id, async () => {
                      const data = await api.get<{ entries: AuditRow[] }>(`/api/admin/password-requests/${r.id}/audit`);
                      setAudit({ requestId: r.id, rows: data.entries });
                    })}
                  >
                    سجل التدقيق
                  </button>

                  {r.status === 'COMPLETED' ? (
                    <span className="text-xs text-ok self-center">تمت إعادة تعيين كلمة المرور عبر رمز لمرة واحدة.</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* تأكيد التحقق اليدوي */}
      {verifyTarget ? (
        <Modal
          title="تأكيد التحقق اليدوي من الهوية"
          body={`تأكيد أنك تحققت يدويًا من هوية «${verifyTarget.patientName}» عبر مكالمة على الرقم ${verifyTarget.phoneNumber} ومطابقة بيانات الهوية، وأن العملية تمت عبر قناة موثوقة.`}
          confirmLabel="تأكيد التحقق"
          tone="warn"
          onCancel={() => setVerifyTarget(null)}
          onConfirm={() => run(verifyTarget.id, async () => {
            await api.post('/api/admin/password-requests/verify', {
              requestId: verifyTarget.id,
              manualVerificationConfirmed: true,
              verificationNote: verifyNote || null,
            });
            setInfo('تم تأكيد التحقق. يمكنك الآن إصدار رمز استعادة لمرة واحدة.');
            setVerifyTarget(null);
            await reload();
          })}
        >
          <Field label="ملاحظة التحقق (اختيارية)" hint="مثال: تم التحقق عبر مكالمة على الرقم المسجّل بتاريخ …">
            <input className="field" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} />
          </Field>
        </Modal>
      ) : null}

      {/* تأكيد إصدار الرمز */}
      {issueTarget ? (
        <Modal
          title="إصدار رمز استعادة"
          body={`سيتم إصدار رمز لمرة واحدة صالح 15 دقيقة لحساب «${issueTarget.patientName}». سيظهر الرمز مرة واحدة فقط على هذه الشاشة، ولن يُخزَّن بأي شكل قابل للقراءة. لا تشاركه عبر قناة غير موثوقة، ويُفضّل تسليمه هاتفيًا للمريض نفسه.`}
          confirmLabel="نعم، أصدر الرمز الآن"
          tone="warn"
          onCancel={() => setIssueTarget(null)}
          onConfirm={() => run(issueTarget.id, async () => {
            const data = await api.post<{ code: string; expiresAt: string }>(
              '/api/admin/password-requests/generate-code',
              { requestId: issueTarget.id, manualVerificationConfirmed: true },
            );
            setOneTimeCode({ code: data.code, expiresAt: data.expiresAt, requestId: issueTarget.id });
            setInfo('تم إصدار الرمز. انسخه وسلّمه للمريض الآن — لن يظهر مرة أخرى.');
            setIssueTarget(null);
            await reload();
          })}
        />
      ) : null}

      {/* رفض الطلب */}
      {rejectTarget ? (
        <Modal
          title="رفض طلب الاستعادة"
          body={`سيتم رفض طلب «${rejectTarget.patientName}» وإلغاء أي رموز غير مستخدمة له. يمكن للمريض تقديم طلب جديد لاحقًا.`}
          confirmLabel="نعم، ارفض الطلب"
          onCancel={() => setRejectTarget(null)}
          onConfirm={() => run(rejectTarget.id, async () => {
            await api.post('/api/admin/password-requests/reject', {
              requestId: rejectTarget.id,
              reason: rejectReason || null,
            });
            setInfo('تم رفض الطلب.');
            setRejectTarget(null);
            await reload();
          })}
        >
          <Field label="سبب الرفض (اختياري)" hint="مثال: لم نتمكن من التحقق من الهوية، أو انتهت صلاحية الطلب.">
            <input className="field" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </Field>
        </Modal>
      ) : null}

      {/* سجل التدقيق */}
      {audit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-pop">
            <h3 className="text-base">سجل تدقيق الطلب</h3>
            <p className="mt-1 text-xs text-ink-muted">
              لا يحتوي هذا السجل على أي رمز استعادة (يُخزَّن تجزئة الرمز فقط) ولا على أي بيانات صحية.
            </p>
            <ul className="mt-3 space-y-2">
              {audit.rows.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-brand-100 bg-brand-50/30 px-3.5 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    <span className="text-xs text-ink-muted num">{entry.createdAtDisplay}</span>
                  </div>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    المنفّذ: {entry.actorRole === 'ADMIN' ? 'مدير' : entry.actorRole === 'PATIENT' ? 'المريض' : 'النظام'}
                  </span>
                </li>
              ))}
              {audit.rows.length === 0 ? <li className="text-sm text-ink-muted">لا توجد سجلات.</li> : null}
            </ul>
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAudit(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
