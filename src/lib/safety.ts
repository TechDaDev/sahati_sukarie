/**
 * رسائل الأمان والتوعية الأساسية.
 * ---------------------------------------------------------------------------
 * هذه الرسائل معلوماتية فقط ولا تُقدّم تشخيصًا ولا جرعات ولا بديلًا عن الرعاية الطبية.
 * ⚠️ الحدود المستخدمة هنا هي حدود "تأكيد إدخال" للتنبيه إلى احتمال خطأ كتابي،
 *    وليست حدودًا معتمدة سريريًا. يجب مراجعة القيم واعتمادها من طبيب مؤهل
 *    قبل تفعيلها في نشر عام (راجع docs/DEPLOYMENT.md).
 */
import type { NumeralSystem } from './format';
import { formatNumber } from './format';

/** حدود التنبيه لتأكيد صحة الإدخال (بوحدة mg/dL) */
export const GLUCOSE_ENTRY_LIMITS = {
  absoluteMinMgdl: 10,
  absoluteMaxMgdl: 1200,
  lowConfirmMgdl: 60,
  highConfirmMgdl: 400,
};

export const SAFETY_DISCLAIMER =
  'هذه المنصة أداة لتوثيق ومتابعة المعلومات الصحية الشخصية، ولا تُغني عن استشارة الطبيب أو خدمات الطوارئ.';

export const URGENT_HELP_TEXT =
  'إذا كنت تشعر بأعراض شديدة أو متزايدة، أو إذا كان لديك شك في حالة طارئة، توجّه فورًا إلى أقرب خدمة طبية أو اتصل بالطوارئ.';

/** معلومات المساعدة العاجلة (متاحة من أي صفحة) */
export const EMERGENCY_CONTACTS = [
  { label: 'الطوارئ الطبية في العراق', value: '122', note: 'خدمة الطوارئ العامة' },
  { label: 'الدفاع المدني', value: '115', note: 'حرائق وإنقاذ' },
  { label: 'الشرطة', value: '104', note: 'الحالات الأمنية' },
];

/**
 * رسائل إرشادية عامة عند تسجيل قراءة منخفضة أو مرتفعة.
 * صياغتها وصفية ومحايدة ولا تحتوي على أي تعليمة علاجية.
 */
export function glucoseInfoMessage(valueMgdl: number, system: NumeralSystem = 'LATIN'): string | null {
  if (valueMgdl < GLUCOSE_ENTRY_LIMITS.lowConfirmMgdl) {
    return `القراءة المسجَّلة (${formatNumber(valueMgdl, 0, system)} mg/dL) أقل من المستويات المعتادة. يفضّل التحقق من دقة القياس وإبلاغ فريقك الطبي بها في الزيارة القادمة. ${URGENT_HELP_TEXT}`;
  }
  if (valueMgdl > GLUCOSE_ENTRY_LIMITS.highConfirmMgdl) {
    return `القراءة المسجَّلة (${formatNumber(valueMgdl, 0, system)} mg/dL) أعلى من المستويات المعتادة. يفضّل التحقق من دقة القياس وإبلاغ فريقك الطبي بها في الزيارة القادمة. ${URGENT_HELP_TEXT}`;
  }
  return null;
}

/** هل تحتاج هذه القيمة إلى تأكيد من المستخدم قبل الحفظ؟ */
export function needsEntryConfirmation(valueMgdl: number): boolean {
  return (
    valueMgdl < GLUCOSE_ENTRY_LIMITS.lowConfirmMgdl
    || valueMgdl > GLUCOSE_ENTRY_LIMITS.highConfirmMgdl
  );
}

/** رسالة عند وجود أعراض مقلقة مسجَّلة مع القراءة */
export const SYMPTOM_SAFETY_NOTE =
  'سجّلت أعراضًا مع هذه القراءة. هذه المنصة لا تُشخّص سبب الأعراض ولا تراقبها بشكل مستمر.';
