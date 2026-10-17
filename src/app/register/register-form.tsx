'use client';
/**
 * نموذج إنشاء الحساب.
 * التحقق يحدث على الخادم بالدرجة الأساسية؛ وهنا نعرض تحققًا فوريًا لتجربة أفضل.
 * ملاحظة: لا يوجد تحقق إلكتروني للبريد أو الهاتف في هذه النسخة.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Field, Spinner } from '@/components/ui';
import { calculateAge } from '@/lib/format';

type FormState = {
  fullName: string;
  gender: string;
  dateOfBirth: string;
  heightCm: string;
  nationalId: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

const initial: FormState = {
  fullName: '', gender: '', dateOfBirth: '', heightCm: '', nationalId: '',
  email: '', phone: '', password: '', confirmPassword: '',
};

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const age = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)) return null;
    const value = calculateAge(form.dateOfBirth);
    return Number.isFinite(value) ? value : null;
  }, [form.dateOfBirth]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (form.fullName.trim().split(/\s+/).length < 2 || form.fullName.trim().length < 3) {
      next.fullName = 'يرجى إدخال الاسم الأول واسم العائلة على الأقل';
    }
    if (!form.gender) next.gender = 'يرجى اختيار الجنس';
    if (!form.dateOfBirth) next.dateOfBirth = 'تاريخ الميلاد مطلوب';
    else if (age !== null && age < 18) next.dateOfBirth = 'يجب أن يكون عمر المستخدم 18 سنة أو أكثر';
    else if (age !== null && age > 120) next.dateOfBirth = 'تاريخ الميلاد غير منطقي';
    const height = Number(form.heightCm);
    if (!Number.isFinite(height) || height < 90 || height > 250) next.heightCm = 'الطول يجب أن يكون بين 90 و250 سم';
    const nationalId = form.nationalId.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(nationalId)) next.nationalId = 'الرقم الوطني يجب أن يحتوي على أرقام فقط';
    else if (nationalId.length !== 12) next.nationalId = 'الرقم الوطني يجب أن يتكوّن من 12 رقمًا';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) next.email = 'صيغة البريد الإلكتروني غير صحيحة';
    const phone = form.phone.replace(/[\s-()]/g, '');
    if (!/^(07\d{9}|\+9647\d{9}|009647\d{9}|7\d{9})$/.test(phone)) {
      next.phone = 'رقم عراقي غير صحيح. الصيغة المتوقعة: 07XXXXXXXXX';
    }
    if (form.password.length < 10) next.password = 'كلمة المرور يجب أن تكون 10 أحرف على الأقل';
    else if (!/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      next.password = 'يجب أن تحتوي على حرف كبير وحرف صغير ورقم';
    }
    if (form.password !== form.confirmPassword) next.confirmPassword = 'كلمتا المرور غير متطابقتين';
    if (!consent) next.consent = 'يجب الموافقة على استخدام الرقم الوطني للتحقق من الهوية';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validate()) {
      setError('يرجى تصحيح الحقول المميّزة بالأحمر قبل المتابعة.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.post<{ activationRequired?: boolean }>('/api/auth/register', {
        fullName: form.fullName.trim(),
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        heightCm: Number(form.heightCm),
        nationalId: form.nationalId,
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        nationalIdConsent: true,
      });
      router.push(result.activationRequired ? '/verify-email' : '/dashboard');
      router.refresh();
    } catch (err) {
      const e = err as { message?: string; fields?: Record<string, string> };
      setError(e.message ?? 'تعذّر إنشاء الحساب.');
      setErrors(e.fields ?? {});
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {Object.keys(errors).length > 0 ? (
        <Alert tone="warn" title="تحقق من الحقول التالية">
          <ul className="space-y-1">
            {Object.entries(errors).filter(([, v]) => v).map(([k, v]) => <li key={k}>• {v}</li>)}
          </ul>
        </Alert>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-bold text-brand-600">البيانات الأساسية</legend>

        <Field label="الاسم الكامل" htmlFor="fullName" required error={errors.fullName}>
          <input id="fullName" className={`field ${errors.fullName ? 'field-error' : ''}`} value={form.fullName}
            onChange={set('fullName')} placeholder="مثال: أحمد عبد الرحمن الجبوري" autoComplete="name" required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الجنس" htmlFor="gender" required error={errors.gender}>
            <select id="gender" className={`field ${errors.gender ? 'field-error' : ''}`} value={form.gender} onChange={set('gender')} required>
              <option value="">اختر…</option>
              <option value="MALE">ذكر</option>
              <option value="FEMALE">أنثى</option>
            </select>
          </Field>

          <Field
            label="تاريخ الميلاد"
            htmlFor="dateOfBirth"
            required
            error={errors.dateOfBirth}
            hint={age !== null && age >= 18 ? `العمر الحالي: ${age} سنة` : 'يجب أن يكون العمر 18 سنة أو أكثر'}
          >
            <input id="dateOfBirth" type="date" className={`field ${errors.dateOfBirth ? 'field-error' : ''}`}
              value={form.dateOfBirth} onChange={set('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} required />
          </Field>
        </div>

        <Field label="الطول (سم)" htmlFor="heightCm" required error={errors.heightCm}>
          <input id="heightCm" type="number" inputMode="decimal" step="0.1" min={90} max={250}
            className={`field ${errors.heightCm ? 'field-error' : ''}`} value={form.heightCm} onChange={set('heightCm')}
            placeholder="170" required />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-bold text-brand-600">بيانات الهوية والتواصل</legend>

        <Field
          label="الرقم الوطني الموحّد"
          htmlFor="nationalId"
          required
          error={errors.nationalId}
          hint="يُطلب فقط للتمييز بين الحسابات المتشابهة في الاسم ومنع التسجيل المكرر. يُخزَّن مشفّرًا ولا يظهر كاملًا بعد التسجيل ولا يُدرج في التقارير، ولا يُستخدم كوسيلة دخول أبدًا."
        >
          <input id="nationalId" inputMode="numeric" className={`field ${errors.nationalId ? 'field-error' : ''}`}
            value={form.nationalId} onChange={set('nationalId')} placeholder="12 رقمًا" dir="ltr" autoComplete="off" required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="البريد الإلكتروني" htmlFor="email" required error={errors.email}
            hint="يُستخدم لتسجيل الدخول. لا يوجد تحقق إلكتروني للبريد في هذه النسخة.">
            <input id="email" type="email" className={`field ${errors.email ? 'field-error' : ''}`} value={form.email}
              onChange={set('email')} dir="ltr" placeholder="name@example.com" autoComplete="email" required />
          </Field>

          <Field label="رقم الهاتف" htmlFor="phone" required error={errors.phone}
            hint="يُستخدم فقط للتواصل معك في حالات استعادة كلمة المرور. الصيغة: 07XXXXXXXXX">
            <input id="phone" type="tel" inputMode="tel" className={`field ${errors.phone ? 'field-error' : ''}`}
              value={form.phone} onChange={set('phone')} dir="ltr" placeholder="07XXXXXXXXX" autoComplete="tel" required />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-bold text-brand-600">كلمة المرور</legend>

        <Field label="كلمة المرور" htmlFor="password" required error={errors.password}
          hint="10 أحرف على الأقل، وتشمل حرفًا كبيرًا وحرفًا صغيرًا ورقمًا.">
          <input id="password" type="password" className={`field ${errors.password ? 'field-error' : ''}`}
            value={form.password} onChange={set('password')} autoComplete="new-password" required />
        </Field>

        <Field label="تأكيد كلمة المرور" htmlFor="confirmPassword" required error={errors.confirmPassword}>
          <input id="confirmPassword" type="password" className={`field ${errors.confirmPassword ? 'field-error' : ''}`}
            value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" required />
        </Field>
      </fieldset>

      <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3.5">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-7 text-ink-soft">
          <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors((p) => ({ ...p, consent: '' })); }}
            className="mt-1.5 h-4 w-4 rounded border-brand-300 text-brand-500 focus:ring-brand-500" />
          <span>
            أوافق على استخدام الرقم الوطني لغرض التحقق من الهوية ومنع التسجيل المكرر فقط، وعلى معالجة بياناتي الصحية بغرض المتابعة الشخصية.
            {errors.consent ? <span className="mt-1 block text-xs font-semibold text-alert">{errors.consent}</span> : null}
          </span>
        </label>
      </div>

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <Spinner /> : null}
        {loading ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب'}
      </button>

      <p className="text-center text-xs text-ink-muted">
        الحساب يُفعّل مباشرة بعد التسجيل، ويمكنك تسجيل الدخول فورًا. لا يوجد تحقق إلكتروني للبريد الإلكتروني أو الهاتف في هذه النسخة.
      </p>
      <p className="text-center text-sm">
        لديك حساب بالفعل؟ <Link href="/login" className="font-semibold text-brand-600 hover:underline">تسجيل الدخول</Link>
      </p>
    </form>
  );
}
