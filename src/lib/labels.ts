/**
 * تسميات عربية لكل قيم القوائم (enums) — تُستخدم في الواجهة والـ API والتقارير.
 * المفاتيح الداخلية تبقى بالإنجليزية، والعرض بالعربية فقط.
 */

export const DIABETES_TYPES = [
  { value: 'TYPE_1', label: 'النوع الأول' },
  { value: 'TYPE_2', label: 'النوع الثاني' },
  { value: 'OTHER', label: 'نوع آخر' },
  { value: 'UNKNOWN', label: 'غير معروف' },
] as const;

export const MONITORING_METHODS = [
  { value: 'FINGERSTICK', label: 'جهاز قياس من الإصبع' },
  { value: 'CGM', label: 'جهاز مراقبة مستمرة (CGM)' },
  { value: 'BOTH', label: 'كلاهما' },
  { value: 'NOT_SPECIFIED', label: 'غير محدد' },
] as const;

export const YES_NO_UNSURE = [
  { value: 'YES', label: 'نعم' },
  { value: 'NO', label: 'لا' },
  { value: 'UNSURE', label: 'غير متأكد' },
] as const;

export const HYPO_AWARENESS = [
  { value: 'NORMAL', label: 'إحساس طبيعي بأعراض نقص السكر' },
  { value: 'REDUCED', label: 'إحساس منخفض (لا يشعر بالأعراض)' },
  { value: 'UNSURE', label: 'غير متأكد' },
  { value: 'NOT_SPECIFIED', label: 'غير محدد' },
] as const;

export const TREATMENT_APPROACHES = [
  { value: 'INSULIN', label: 'أنسولين' },
  { value: 'NON_INSULIN_MEDICATION', label: 'أدوية فموية أو غير أنسولينية' },
  { value: 'BOTH', label: 'أنسولين مع أدوية أخرى' },
  { value: 'LIFESTYLE_ONLY', label: 'نمط حياة فقط (بدون أدوية)' },
  { value: 'NOT_SPECIFIED', label: 'غير محدد' },
] as const;

export const CONDITIONS = [
  { value: 'HYPERTENSION', label: 'ارتفاع ضغط الدم' },
  { value: 'HEART_DISEASE', label: 'أمراض القلب' },
  { value: 'KIDNEY_DISEASE', label: 'أمراض الكلى' },
  { value: 'HIGH_CHOLESTEROL', label: 'ارتفاع الكوليسترول' },
  { value: 'RETINOPATHY', label: 'اعتلال الشبكية السكري' },
  { value: 'NEUROPATHY', label: 'اعتلال الأعصاب السكري' },
  { value: 'FOOT_PROBLEMS', label: 'مشاكل القدم السكرية' },
  { value: 'OTHER', label: 'حالات طبية أخرى' },
] as const;

export const CONDITION_STATUSES = [
  { value: 'DIAGNOSED', label: 'مُشخّصة' },
  { value: 'NOT_DIAGNOSED', label: 'غير مُشخّصة' },
  { value: 'UNKNOWN', label: 'غير معروف' },
] as const;

export const SMOKING_STATUSES = [
  { value: 'NEVER', label: 'لم أدخّن' },
  { value: 'CURRENT', label: 'مدخّن حاليًا' },
  { value: 'FORMER', label: 'مدخّن سابق' },
  { value: 'NOT_SPECIFIED', label: 'غير محدد' },
] as const;

export const PREGNANCY_STATUSES = [
  { value: 'NOT_APPLICABLE', label: 'لا ينطبق' },
  { value: 'NOT_PREGNANT', label: 'غير حامل' },
  { value: 'PREGNANT', label: 'حامل' },
  { value: 'BREASTFEEDING', label: 'مرضعة' },
  { value: 'NOT_SPECIFIED', label: 'أفضّل عدم الذكر' },
] as const;

export const GLUCOSE_UNITS = [
  { value: 'MG_DL', label: 'ملغم/دل (mg/dL)', short: 'mg/dL' },
  { value: 'MMOL_L', label: 'مليمول/لتر (mmol/L)', short: 'mmol/L' },
] as const;

export const MEASUREMENT_CONTEXTS = [
  { value: 'FASTING', label: 'صائم', short: 'صائم' },
  { value: 'BEFORE_BREAKFAST', label: 'قبل الفطور', short: 'قبل الفطور' },
  { value: 'AFTER_BREAKFAST', label: 'بعد الفطور', short: 'بعد الفطور' },
  { value: 'BEFORE_LUNCH', label: 'قبل الغداء', short: 'قبل الغداء' },
  { value: 'AFTER_LUNCH', label: 'بعد الغداء', short: 'بعد الغداء' },
  { value: 'BEFORE_DINNER', label: 'قبل العشاء', short: 'قبل العشاء' },
  { value: 'AFTER_DINNER', label: 'بعد العشاء', short: 'بعد العشاء' },
  { value: 'BEFORE_SLEEP', label: 'قبل النوم', short: 'قبل النوم' },
  { value: 'OTHER', label: 'وقت آخر / غير محدد', short: 'غير محدد' },
] as const;

export const GLUCOSE_SOURCES = [
  { value: 'FINGERSTICK_METER', label: 'جهاز قياس من الإصبع' },
  { value: 'CGM', label: 'جهاز مراقبة مستمرة' },
  { value: 'LAB', label: 'تحليل مختبري' },
  { value: 'OTHER', label: 'أخرى' },
  { value: 'NOT_SPECIFIED', label: 'غير محدد' },
] as const;

export const MEDICATION_CATEGORIES = [
  { value: 'INSULIN', label: 'أنسولين' },
  { value: 'BIGUANIDE', label: 'بيغوانيد (ميتفورمين)' },
  { value: 'SULFONYLUREA', label: 'سلفونيل يوريا' },
  { value: 'DPP4_INHIBITOR', label: 'مثبطات DPP-4' },
  { value: 'SGLT2_INHIBITOR', label: 'مثبطات SGLT2' },
  { value: 'GLP1_AGONIST', label: 'ناهضات GLP-1' },
  { value: 'TZD', label: 'ثيازوليدينديون' },
  { value: 'MEGLITINIDE', label: 'ميغليتينيد' },
  { value: 'ALPHA_GLUCOSIDASE_INHIBITOR', label: 'مثبطات ألفا-غلوكوزيداز' },
  { value: 'ANTIHYPERTENSIVE', label: 'خافض ضغط' },
  { value: 'STATIN', label: 'خافض كوليسترول (ستاتين)' },
  { value: 'OTHER', label: 'أخرى' },
] as const;

export const DOSE_UNITS = [
  { value: 'UNIT', label: 'وحدة' },
  { value: 'MG', label: 'ملغم' },
  { value: 'MCG', label: 'مايكروغرام' },
  { value: 'G', label: 'غرام' },
  { value: 'ML', label: 'ملل' },
  { value: 'TABLET', label: 'حبة' },
  { value: 'CAPSULE', label: 'كبسولة' },
  { value: 'DROP', label: 'قطرة' },
  { value: 'PUFF', label: 'بخة' },
  { value: 'SACHET', label: 'كيس' },
] as const;

export const ROUTES = [
  { value: 'SUBCUTANEOUS', label: 'تحت الجلد' },
  { value: 'INTRAVENOUS', label: 'في الوريد' },
  { value: 'INTRAMUSCULAR', label: 'في العضل' },
  { value: 'ORAL', label: 'فموي' },
  { value: 'INHALED', label: 'استنشاق' },
  { value: 'TOPICAL', label: 'موضعي' },
  { value: 'OTHER', label: 'أخرى' },
] as const;

export const FREQUENCIES = [
  { value: 'ONCE_DAILY', label: 'مرة واحدة يوميًا' },
  { value: 'TWICE_DAILY', label: 'مرتان يوميًا' },
  { value: 'THREE_TIMES_DAILY', label: 'ثلاث مرات يوميًا' },
  { value: 'FOUR_TIMES_DAILY', label: 'أربع مرات يوميًا' },
  { value: 'WITH_MEALS', label: 'مع الوجبات' },
  { value: 'BEFORE_MEALS', label: 'قبل الوجبات' },
  { value: 'AT_BEDTIME', label: 'عند النوم' },
  { value: 'AS_NEEDED', label: 'عند الحاجة' },
  { value: 'WEEKLY', label: 'أسبوعيًا' },
  { value: 'OTHER', label: 'أخرى' },
] as const;

export const MEDICATION_STATUSES = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'INACTIVE', label: 'متوقف' },
] as const;

export const ADMINISTRATION_STATUSES = [
  { value: 'TAKEN', label: 'تم تناوله' },
  { value: 'MISSED', label: 'فائت' },
  { value: 'DELAYED', label: 'تم تأجيله' },
] as const;

export const MEAL_TYPES = [
  { value: 'BREAKFAST', label: 'فطور' },
  { value: 'LUNCH', label: 'غداء' },
  { value: 'DINNER', label: 'عشاء' },
  { value: 'SNACK', label: 'وجبة خفيفة' },
  { value: 'OTHER', label: 'أخرى' },
] as const;

export const ACTIVITY_INTENSITIES = [
  { value: 'LIGHT', label: 'خفيف' },
  { value: 'MODERATE', label: 'متوسط' },
  { value: 'VIGOROUS', label: 'شديد' },
] as const;

export const SLEEP_QUALITIES = [
  { value: 'GOOD', label: 'جيدة' },
  { value: 'FAIR', label: 'متوسطة' },
  { value: 'POOR', label: 'سيئة' },
  { value: 'NOT_SPECIFIED', label: 'غير محدد' },
] as const;

export const SYMPTOMS = [
  { value: 'DIZZINESS', label: 'دوخة' },
  { value: 'SWEATING', label: 'تعرّق' },
  { value: 'TREMOR', label: 'رجفة' },
  { value: 'EXCESSIVE_THIRST', label: 'عطش شديد' },
  { value: 'FATIGUE', label: 'إرهاق' },
  { value: 'HEADACHE', label: 'صداع' },
  { value: 'BLURRED_VISION', label: 'تشوّش في الرؤية' },
  { value: 'PALPITATIONS', label: 'خفقان في القلب' },
  { value: 'NAUSEA', label: 'غثيان' },
  { value: 'OTHER', label: 'أعراض أخرى' },
] as const;

export const SYMPTOM_SEVERITIES = [
  { value: 'MILD', label: 'خفيفة' },
  { value: 'MODERATE', label: 'متوسطة' },
  { value: 'SEVERE', label: 'شديدة' },
] as const;

export const DAILY_FACTORS = [
  { value: 'ILLNESS', label: 'مرض / التهاب' },
  { value: 'STRESS', label: 'ضغط نفسي غير معتاد' },
  { value: 'TRAVEL', label: 'سفر' },
  { value: 'MENSTRUATION', label: 'دورة شهرية' },
  { value: 'OTHER', label: 'عوامل أخرى' },
] as const;

export const LAB_TESTS = [
  { value: 'HBA1C', label: 'السكر التراكمي (HbA1c)', unit: '%', min: 3, max: 20, step: 0.1 },
  { value: 'CREATININE', label: 'الكرياتينين', unit: 'mg/dL', min: 0.1, max: 20, step: 0.01 },
  { value: 'EGFR', label: 'معدل الترشيح الكبيبي (eGFR)', unit: 'mL/min/1.73m²', min: 1, max: 200, step: 1 },
  { value: 'URINE_ACR', label: 'نسبة الألبومين/الكرياتينين في البول', unit: 'mg/g', min: 0, max: 10000, step: 0.1 },
  { value: 'BLOOD_PRESSURE', label: 'ضغط الدم', unit: 'mmHg', min: 40, max: 300, step: 1, dual: true },
  { value: 'TOTAL_CHOLESTEROL', label: 'الكوليسترول الكلي', unit: 'mg/dL', min: 40, max: 800, step: 1 },
  { value: 'LDL', label: 'الكوليسترول الضار (LDL)', unit: 'mg/dL', min: 10, max: 600, step: 1 },
  { value: 'HDL', label: 'الكوليسترول النافع (HDL)', unit: 'mg/dL', min: 5, max: 200, step: 1 },
  { value: 'TRIGLYCERIDES', label: 'الدهون الثلاثية', unit: 'mg/dL', min: 10, max: 2000, step: 1 },
  { value: 'OTHER', label: 'تحليل آخر', unit: '', min: 0, max: 100000, step: 0.01 },
] as const;

export const RECOVERY_STATUSES = [
  { value: 'PENDING', label: 'قيد الانتظار' },
  { value: 'VERIFIED', label: 'تم التحقق' },
  { value: 'COMPLETED', label: 'مكتمل' },
  { value: 'REJECTED', label: 'مرفوض' },
  { value: 'EXPIRED', label: 'منتهي الصلاحية' },
] as const;

export const GENDERS = [
  { value: 'MALE', label: 'ذكر' },
  { value: 'FEMALE', label: 'أنثى' },
] as const;

export const INSULIN_FORMULATIONS = [
  'سريع المفعول (Rapid-acting)',
  'قصير المفعول (Short-acting)',
  'متوسط المفعول (Intermediate-acting)',
  'طويل المفعول (Long-acting)',
  'مخلوط (Premixed)',
] as const;

type Option = { value: string; label: string };
function toMap(list: readonly Option[]): Record<string, string> {
  return Object.fromEntries(list.map((o) => [o.value, o.label]));
}

export const LABELS: Record<string, Record<string, string>> = {
  diabetesType: toMap(DIABETES_TYPES),
  monitoringMethod: toMap(MONITORING_METHODS),
  yesNoUnsure: toMap(YES_NO_UNSURE),
  hypoAwareness: toMap(HYPO_AWARENESS),
  treatmentApproach: toMap(TREATMENT_APPROACHES),
  condition: toMap(CONDITIONS),
  conditionStatus: toMap(CONDITION_STATUSES),
  smoking: toMap(SMOKING_STATUSES),
  pregnancy: toMap(PREGNANCY_STATUSES),
  glucoseUnit: toMap(GLUCOSE_UNITS),
  context: toMap(MEASUREMENT_CONTEXTS),
  glucoseSource: toMap(GLUCOSE_SOURCES),
  medicationCategory: toMap(MEDICATION_CATEGORIES),
  doseUnit: toMap(DOSE_UNITS),
  route: toMap(ROUTES),
  frequency: toMap(FREQUENCIES),
  medicationStatus: toMap(MEDICATION_STATUSES),
  administrationStatus: toMap(ADMINISTRATION_STATUSES),
  mealType: toMap(MEAL_TYPES),
  intensity: toMap(ACTIVITY_INTENSITIES),
  sleepQuality: toMap(SLEEP_QUALITIES),
  symptom: toMap(SYMPTOMS),
  symptomSeverity: toMap(SYMPTOM_SEVERITIES),
  dailyFactor: toMap(DAILY_FACTORS),
  labTest: toMap(LAB_TESTS as unknown as readonly Option[]),
  recoveryStatus: toMap(RECOVERY_STATUSES),
  gender: toMap(GENDERS),
};

/** إرجاع التسمية العربية لقيمة enum، مع نص بديل عند غيابها */
export function labelOf(group: keyof typeof LABELS | string, value: string | null | undefined): string {
  if (!value) return '—';
  return LABELS[group]?.[value] ?? value;
}

export function unitShort(unit: string | null | undefined): string {
  const found = GLUCOSE_UNITS.find((u) => u.value === unit);
  return found?.short ?? 'mg/dL';
}

export type LabTestMeta = {
  value: string; label: string; unit: string; min: number; max: number; step: number; dual?: boolean;
};

export function labTestMeta(testType: string): LabTestMeta {
  const found = LAB_TESTS.find((t) => t.value === testType) ?? LAB_TESTS[0];
  return found as LabTestMeta;
}
