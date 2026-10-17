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
    <div dir="rtl" className="min-h-screen bg-canvas px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-sm font-semibold text-brand-600 hover:underline">← العودة إلى لوحة المتابعة</Link>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-alert">{Icons.alert}</span>
          <h1 className="text-2xl">المساعدة العاجلة</h1>
        </div>

        <Alert tone="danger" className="mt-4">
          {URGENT_HELP_TEXT}
        </Alert>

        <Card className="mt-4 border-red-200 bg-white p-5 text-center sm:p-7">
          {EMERGENCY_CONTACTS.map((contact) => (
            <section key={contact.value} aria-labelledby="emergency-number-title">
              <h2 id="emergency-number-title" className="text-base font-semibold text-ink">{contact.label}</h2>
              <p className="mt-1 text-sm leading-6 text-ink-muted">{contact.note}</p>
              <p dir="ltr" className="num my-2 text-5xl font-extrabold tracking-wide text-alert sm:text-6xl">{contact.value}</p>
              <p className="text-sm font-semibold text-ink-soft">{contact.availability} · {contact.cost}</p>
              <a
                href={`tel:${contact.value}`}
                className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-alert px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-300 sm:w-auto sm:min-w-72"
              >
                الاتصال بالطوارئ 911
              </a>
            </section>
          ))}
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
