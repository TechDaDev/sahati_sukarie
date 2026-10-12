'use client';
/**
 * هيكل واجهة المريض: ترويسة + تنقّل علوي (سطح المكتب) + شريط سفلي (الهاتف)
 * + زر مساعدة عاجلة متاح من أي صفحة + زر خروج آمن.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Icons, Spinner } from '@/components/ui';

const NAV = [
  { href: '/dashboard', label: 'الرئيسية', icon: Icons.home },
  { href: '/profile', label: 'ملفي الصحي', icon: Icons.profile },
  { href: '/glucose', label: 'قياسات السكر', icon: Icons.drop },
  { href: '/medications', label: 'أدويتي', icon: Icons.pill },
  { href: '/daily-log', label: 'يومياتي', icon: Icons.journal },
  { href: '/reports', label: 'التقارير', icon: Icons.chart },
  { href: '/settings', label: 'الإعدادات', icon: Icons.settings },
];

const MOBILE_NAV = NAV.filter((n) => n.href !== '/settings');

export function PatientShell({
  children, fullName,
}: { children: ReactNode; fullName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await api.post('/api/auth/logout');
      router.push('/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LogoMark />
            <span className="text-base font-bold text-brand-600">صحتي وسكري</span>
          </Link>

          <nav className="mr-4 hidden flex-1 items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:bg-brand-50 hover:text-brand-600'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mr-auto flex items-center gap-2">
            <Link
              href="/urgent-help"
              className="chip bg-red-50 text-alert hover:bg-red-100"
              title="معلومات المساعدة العاجلة"
            >
              {Icons.alert}
              <span className="hidden xs:inline">مساعدة عاجلة</span>
            </Link>
            <span className="hidden max-w-[10rem] truncate text-xs text-ink-muted sm:inline" title={fullName}>
              {fullName}
            </span>
            <button type="button" onClick={logout} className="btn-ghost btn-sm" disabled={loggingOut}>
              {loggingOut ? <Spinner /> : Icons.logout}
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>

      {/* شريط تنقّل سفلي للهواتف */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-100 bg-white/97 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-6">
          {MOBILE_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-semibold transition ${
                  active ? 'text-brand-600' : 'text-ink-muted'
                }`}
              >
                <span className={active ? 'text-brand-500' : ''}>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3s6 6.4 6 10.6A6 6 0 0 1 6 13.6C6 9.4 12 3 12 3Z" />
        <path d="M9.4 14.2h1.9l1.1-2.1 1.4 3.4 1-1.3h1.6" />
      </svg>
    </span>
  );
}
