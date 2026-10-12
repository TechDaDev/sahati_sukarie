import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/patient-shell';
import { Disclaimer } from '@/components/ui';

/** حاوية موحّدة لصفحات المصادقة (تسجيل، دخول، استعادة كلمة المرور) */
export function AuthCard({
  title, subtitle, children, footer, wide = false, showDisclaimer = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  showDisclaimer?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/70 via-canvas to-canvas px-4 py-8">
      <div className={`mx-auto ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="mb-5 flex flex-col items-center text-center">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark size={40} />
            <span className="text-xl font-bold text-brand-600">صحتي وسكري</span>
          </Link>
          <h1 className="mt-4 text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p> : null}
        </div>

        <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card sm:p-6">
          {children}
        </div>

        {footer ? <div className="mt-4 text-center text-sm text-ink-soft">{footer}</div> : null}
        {showDisclaimer ? <Disclaimer className="mt-4" /> : null}
      </div>
    </div>
  );
}
