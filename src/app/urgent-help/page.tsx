/**
 * معلومات المساعدة العاجلة — متاحة من زر ثابت في كل صفحات المريض.
 * لا تُقدّم المنصة تشخيصًا ولا توجيهًا علاجيًا، وتُذكّر بحدود دورها.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, Icons } from '@/components/ui';
import { EMERGENCY_CONTACTS, SAFETY_DISCLAIMER, URGENT_HELP_TEXT } from '@/lib/safety';

export const metadata: Metadata = { title: 'المساعدة العاجلة' };

export default function UrgentHelpPage() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-sm font-semibold text-brand-600 hover:underline">← العودة إلى لوحة المتابعة</Link>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-alert">{Icons.alert}</span>
          <h1 className="text-2xl">المساعدة العاجلة</h1>
        </div>

        <Alert tone="danger" className="mt-4">
          {URGENT_HELP_TEXT}
        </Alert>

        <Card className="mt-4">
          <h2 className="text-base">أرقام الاتصال الرسمية</h2>
          <p className="mt-1 text-xs text-ink-muted">
            تأكد من الأرقام المحلية المعتمدة في محافظتك، فهي قابلة للتغيير.
          </p>
          <ul className="mt-3 space-y-2">
            {EMERGENCY_CONTACTS.map((c) => (
              <li key={c.label} className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5">
                <span>
                  <span className="block text-sm font-semibold text-ink">{c.label}</span>
                  <span className="block text-xs text-ink-muted">{c.note}</span>
                </span>
                <a href={`tel:${c.value}`} className="num text-xl font-bold text-alert">{c.value}</a>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="mt-4">
          <h2 className="text-base">ما لا تفعله هذه المنصة</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-7 text-ink-soft">
            <li>• لا تُراقب القراءات بشكل مستمر ولا ترسل أي تنبيه تلقائي.</li>
            <li>• لا تتصل بخدمات الطوارئ أو أي جهة طبية عنك.</li>
            <li>• لا تُشخّص الأعراض ولا تحدد أسبابها.</li>
            <li>• لا تحسب جرعات الأنسولين ولا تُعدّل أي علاج.</li>
          </ul>
          <p className="mt-3 text-sm leading-7 text-ink-soft">
            ما تسجّله هنا يبقى سجلًا للمتابعة الشخصية ومشاركته مع فريقك الطبي.
          </p>
        </Card>

        <p className="mt-4 rounded-xl border border-brand-100 bg-white/70 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
          {SAFETY_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
