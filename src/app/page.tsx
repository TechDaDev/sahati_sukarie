/**
 * الصفحة التعريفية العامة لمنصة صحتي وسكري.
 * لا تُعرض أي شعارات جهات أو شراكات أو شهادات غير حقيقية.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/server/auth/session';
import { LogoMark } from '@/components/patient-shell';
import { Disclaimer, Icons } from '@/components/ui';

const FEATURES = [
  {
    title: 'تسجيل قراءات السكر',
    body: 'أدخل القراءة بوحدة mg/dL أو mmol/L مع وقتها وسياقها (صائم، بعد الأكل، قبل النوم…) في خطوات قليلة.',
    icon: Icons.drop,
  },
  {
    title: 'خطة الأدوية والجرعات الفعلية',
    body: 'افصل بين الدواء الموصوف والجرعة التي تناولتها فعلًا، واحتفظ بسجل تاريخي واضح لا يُستبدل عند تغيير الخطة.',
    icon: Icons.pill,
  },
  {
    title: 'يوميات صحية شاملة',
    body: 'سجّل الوجبات والنشاط البدني والنوم والأعراض والعوامل اليومية كالمرض أو الضغط النفسي.',
    icon: Icons.journal,
  },
  {
    title: 'تقارير ورسوم بيانية',
    body: 'ملخصات ورسوم تعتمد على بياناتك الفعلية فقط، مع إمكانية تنزيل تقرير PDF عربي للفترة التي تختارها.',
    icon: Icons.chart,
  },
];

const STEPS = [
  { n: '١', t: 'أنشئ حسابك', d: 'التسجيل فوري ولا يحتاج تفعيل بريد إلكتروني في هذه النسخة.' },
  { n: '٢', t: 'أكمل ملفك الصحي', d: 'كل الحقول الطبية اختيارية، ويمكنك إكمالها تدريجيًا في أي وقت.' },
  { n: '٣', t: 'ابدأ التسجيل اليومي', d: 'قياسات السكر، الأدوية، الوجبات، النشاط، النوم والأعراض.' },
  { n: '٤', t: 'راجع تقاريرك', d: 'اطّلع على الاتجاهات ونزّل تقريرًا عربيًا وشاركه مع طبيبك.' },
];

export default async function LandingPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.user.role === 'ADMIN' ? '/admin' : '/dashboard');
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-brand-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <LogoMark />
            <span className="text-lg font-bold text-brand-600">صحتي وسكري</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost btn-sm sm:btn">تسجيل الدخول</Link>
            <Link href="/register" className="btn-primary btn-sm sm:btn">إنشاء حساب</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-brand-100 bg-gradient-to-b from-white via-brand-50/60 to-canvas">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-2 lg:items-center lg:py-16">
            <div>
              <span className="chip bg-teal-50 text-teal-700">إصدار أولي (MVP) — نسخة للتجربة</span>
              <h1 className="mt-4 text-3xl leading-tight sm:text-4xl lg:text-5xl">
                صحتي وسكري
              </h1>
              <p className="mt-3 text-lg font-semibold text-brand-600">
                منصتك الشخصية لمتابعة مرض السكري وتنظيم حياتك اليومية
              </p>
              <p className="mt-4 max-w-xl text-[15px] leading-8 text-ink-soft">
                سجّل قراءات السكر، وتابع أدويتك ونشاطاتك اليومية، واطلع على تطور حالتك الصحية من خلال تقارير ورسوم بيانية واضحة.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/register" className="btn-primary">إنشاء حساب</Link>
                <Link href="/login" className="btn-outline">تسجيل الدخول</Link>
              </div>
              <p className="mt-5 flex items-start gap-2 text-sm text-ink-muted">
                <span className="mt-0.5 shrink-0 text-brand-400">{Icons.shield}</span>
                بياناتك الصحية تُخزَّن في قاعدة بيانات المنصة ولا تُستخدم لأي غرض إعلاني، ولا يمكن للمدير الاطلاع عليها.
              </p>
            </div>

            <div className="relative">
              <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-pop">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-ink-muted">قراءات اليوم</p>
                    <p className="text-2xl font-bold text-ink">
                      <span className="num">4</span> قياسات
                    </p>
                  </div>
                  <span className="chip bg-teal-50 text-teal-700">مثال توضيحي للواجهة</span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {[
                    { t: 'صائم', v: '112', u: 'mg/dL', tone: 'ok' },
                    { t: 'بعد الفطور', v: '168', u: 'mg/dL', tone: 'warn' },
                    { t: 'قبل الغداء', v: '124', u: 'mg/dL', tone: 'ok' },
                    { t: 'قبل النوم', v: '138', u: 'mg/dL', tone: 'ok' },
                  ].map((row) => (
                    <div key={row.t} className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/40 px-3 py-2.5">
                      <span className="text-sm font-semibold text-ink">{row.t}</span>
                      <span className="text-sm font-bold text-ink">
                        <span className="num">{row.v}</span> <span className="text-xs text-ink-muted">{row.u}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                  الأرقام أعلاه مثال للشكل فقط — لا تُنشئ المنصة أي بيانات مرضى تلقائيًا.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-center text-2xl">ماذا تقدّم المنصة؟</h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                  {f.icon}
                </div>
                <h3 className="text-base">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-7 text-ink-soft">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-brand-100 bg-white py-12">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-2xl">كيف تبدأ؟</h2>
            <ol className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.t} className="rounded-2xl border border-brand-100 bg-canvas p-4">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-sm">{s.t}</h3>
                  <p className="mt-1 text-xs leading-6 text-ink-soft">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <h2 className="text-base">تنبيه طبي مهم</h2>
            <p className="mt-2 text-sm leading-7 text-[#7A5210]">
              هذه المنصة أداة لتوثيق ومتابعة المعلومات الصحية الشخصية، ولا تُغني عن استشارة الطبيب أو خدمات الطوارئ.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm leading-7 text-[#7A5210]">
              <li>• لا تُقدّم المنصة تشخيصًا طبيًا ولا تحسب جرعات الأنسولين ولا تعدّل أي علاج.</li>
              <li>• لا تراقب المنصة القراءات بشكل مستمر ولا تُنبّه خدمات الطوارئ.</li>
              <li>• عند الشعور بأعراض شديدة أو تدهور مفاجئ، توجّه فورًا إلى أقرب خدمة طبية.</li>
            </ul>
          </div>
          <Disclaimer className="mt-4" />
        </section>
      </main>

      <footer className="border-t border-brand-100 bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span>صحتي وسكري — إصدار أولي (MVP) لتوثيق المتابعة الشخصية لمرضى السكري.</span>
          <span className="flex flex-wrap gap-3">
            <Link href="/login" className="hover:text-brand-600">تسجيل الدخول</Link>
            <Link href="/register" className="hover:text-brand-600">إنشاء حساب</Link>
            <Link href="/admin/login" className="hover:text-brand-600">دخول المدير</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
