/**
 * مكوّنات واجهة أساسية مشتركة (تدعم RTL بالكامل).
 * مكوّنات بسيطة قابلة لإعادة الاستخدام بدون اعتماد على مكتبة خارجية ثقيلة.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold text-ink sm:text-lg">{children}</h2>
      {action}
    </div>
  );
}

const badgeStyles: Record<string, string> = {
  neutral: 'bg-brand-50 text-ink-soft',
  teal: 'bg-teal-50 text-teal-700',
  blue: 'bg-brand-100 text-brand-700',
  warn: 'bg-amber-50 text-[#8A5A11]',
  danger: 'bg-red-50 text-alert',
  ok: 'bg-emerald-50 text-ok',
};

export function Badge({
  children, tone = 'neutral',
}: { children: ReactNode; tone?: keyof typeof badgeStyles }) {
  return <span className={`chip ${badgeStyles[tone] ?? badgeStyles.neutral}`}>{children}</span>;
}

export function EmptyState({
  title, description, actionHref, actionLabel, icon,
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-white/60 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        {icon ?? <DotIcon />}
      </div>
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p> : null}
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="btn-primary mt-4">{actionLabel}</Link>
      ) : null}
    </div>
  );
}

export function StatCard({
  label, value, sub, tone = 'neutral', icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'teal' | 'warn' | 'danger';
  icon?: ReactNode;
}) {
  const toneRing: Record<string, string> = {
    neutral: 'border-brand-100',
    teal: 'border-teal-100',
    warn: 'border-amber-200',
    danger: 'border-red-200',
  };
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-card ${toneRing[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-ink-muted">{label}</span>
        {icon ? <span className="text-brand-400">{icon}</span> : null}
      </div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-ink-muted">{sub}</div> : null}
    </div>
  );
}

export function Alert({
  tone = 'info', title, children, className = '',
}: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: string; children: ReactNode; className?: string }) {
  const tones: Record<string, string> = {
    info: 'border-brand-200 bg-brand-50 text-ink-soft',
    warn: 'border-amber-200 bg-amber-50 text-[#7A5210]',
    danger: 'border-red-200 bg-red-50 text-alert',
    ok: 'border-emerald-200 bg-emerald-50 text-ok',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]} ${className}`} role={tone === 'danger' ? 'alert' : undefined}>
      {title ? <p className="mb-1 font-bold">{title}</p> : null}
      {children}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export function Field({
  label, htmlFor, hint, error, required, children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label} {required ? <span className="text-alert">*</span> : null}
      </label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-semibold text-alert">{error}</p> : null}
    </div>
  );
}

export function Modal({
  title, body, confirmLabel, cancelLabel = 'إلغاء', onCancel, onConfirm, tone = 'danger', children, busy,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: 'danger' | 'warn' | 'primary';
  children?: ReactNode;
  busy?: boolean;
}) {
  const confirmClass = tone === 'danger' ? 'btn-danger btn-sm' : tone === 'warn' ? 'btn-teal btn-sm' : 'btn-primary btn-sm';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-pop">
        <h3 className="text-base">{title}</h3>
        {body ? <p className="mt-2 text-sm leading-7 text-ink-soft">{body}</p> : null}
        {children ? <div className="mt-3 space-y-3">{children}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={confirmClass} onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : null} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

export function Disclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`rounded-xl border border-brand-100 bg-white/70 px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted ${className}`}>
      هذه المنصة أداة لتوثيق ومتابعة المعلومات الصحية الشخصية، ولا تُغني عن استشارة الطبيب أو خدمات الطوارئ.
    </p>
  );
}

function DotIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export const Icons = {
  home: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>,
  profile: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /></svg>,
  drop: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3Z" /></svg>,
  pill: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="9" width="18" height="6" rx="3" /><path d="M12 9v6" /></svg>,
  journal: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>,
  chart: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16" /><path d="M7 15l3.5-4 3 2.5L19 8" /></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></svg>,
  alert: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.2v.1" /></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20H15" /><path d="M10 8l-4 4 4 4M6 12h9" /></svg>,
  plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  download: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7.5 11 12 15.5 16.5 11" /><path d="M5 19h14" /></svg>,
  shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3Z" /></svg>,
};
