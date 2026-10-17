'use client';
/**
 * هيكل لوحة المدير.
 * الدور محدود وظيفيًا: تحديد الحسابات ومعالجة طلبات استعادة كلمة المرور فقط.
 * لا توجد أي واجهة للوصول إلى البيانات الطبية لأن المدير لا يملك صلاحية عليها أصلًا.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { LogoMark } from '@/components/patient-shell';
import { Icons, Spinner } from '@/components/ui';

const NAV = [
  { href: '/admin/users', label: 'إدارة الحسابات' },
  { href: '/admin/email-delivery', label: 'حالة البريد' },
  { href: '/admin/security-events', label: 'أحداث الأمان' },
];

export function AdminShell({ children, email }: { children: ReactNode; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await api.post('/api/auth/logout');
      router.push('/admin/login');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <LogoMark size={32} />
            <span className="text-sm font-bold text-brand-600">صحتي وسكري — إدارة الحسابات</span>
          </Link>
          <nav className="mr-4 hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:bg-brand-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mr-auto flex items-center gap-2">
            <span className="hidden truncate text-xs text-ink-muted sm:inline" dir="ltr">{email}</span>
            <Link href="/admin/change-password" className="btn-ghost btn-sm">كلمة المرور</Link>
            <button type="button" onClick={logout} className="btn-outline btn-sm" disabled={loading}>
              {loading ? <Spinner /> : Icons.logout} خروج
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-brand-50 px-4 py-2 md:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                pathname.startsWith(item.href) ? 'bg-brand-50 text-brand-600' : 'text-ink-soft'
              }`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-xs leading-6 text-ink-muted">
        صلاحيات المدير محدودة بمعالجة طلبات استعادة كلمة المرور والبحث التعريفي عن الحسابات فقط.
        لا يملك المدير أي وصول إلى القياسات أو الأدوية أو اليوميات أو نتائج التحاليل أو التشخيصات.
      </footer>
    </div>
  );
}
