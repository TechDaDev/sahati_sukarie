/**
 * التحقق من المدخلات على الخادم (Zod).
 * كل نقطة API تستخدم هذه المخططات — لا يُعتمد على التحقق في الواجهة وحدها.
 */
import { z } from 'zod';
import { calculateAge } from '../../lib/format';
import { normalizeIraqiPhone, normalizeNationalId } from '../lib/crypto';

const arabicText = (max = 500) => z.string().trim().max(max, `الحد الأقصى ${max} حرف`);

/** وقت بصيغة HH:MM (24 ساعة) — تحقّق صارم من صحة الساعة والدقيقة */
export const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت غير صحيح');

/** تاريخ بصيغة YYYY-MM-DD مع تحقّق فعلي من صحة التاريخ (لا تُقبل مثل 2026-13-01) */
export const dateOnlyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح')
  .refine((v) => {
    const parsed = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  }, 'التاريخ غير صحيح');

export const emailSchema = z
  .string()
  .trim()
  .min(5, 'البريد الإلكتروني مطلوب')
  .max(254, 'البريد الإلكتروني طويل جدًا')
  .email('صيغة البريد الإلكتروني غير صحيحة')
  .transform((v) => v.toLowerCase());

/**
 * كلمة المرور: 10 أحرف على الأقل مع حرف كبير وصغير ورقم.
 * تُرفض كلمات المرور الشائعة جدًا.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890', 'qwerty123',
  'iloveyou', 'admin123', 'welcome1', 'passw0rd', 'letmein1', 'diabetes',
]);

export const passwordSchema = z
  .string()
  .min(10, 'كلمة المرور يجب أن تكون 10 أحرف على الأقل')
  .max(128, 'كلمة المرور طويلة جدًا')
  .refine((v) => /[a-z]/.test(v), 'يجب أن تحتوي على حرف إنجليزي صغير')
  .refine((v) => /[A-Z]/.test(v), 'يجب أن تحتوي على حرف إنجليزي كبير')
  .refine((v) => /[0-9]/.test(v), 'يجب أن تحتوي على رقم واحد على الأقل')
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), 'كلمة المرور شائعة جدًا، اختر كلمة أقوى');

/** الرقم الوطني العراقي: 12 رقمًا (يُقبل مع مسافات/فواصل)، يُعامل كنص للحفاظ على الأصفار البادئة */
export const nationalIdSchema = z
  .string()
  .trim()
  .min(1, 'الرقم الوطني مطلوب')
  .transform(normalizeNationalId)
  .refine((v) => /^\d+$/.test(v), 'الرقم الوطني يجب أن يحتوي على أرقام فقط')
  .refine((v) => v.length === 12, 'الرقم الوطني يجب أن يتكوّن من 12 رقمًا')
  .refine((v) => v.length >= 1 && /^\d+$/.test(v), 'صيغة الرقم الوطني غير صحيحة')
  // ملاحظة: لا نُطبّق أي خوارزمية تحقق (checksum) غير رسمية
  .refine((v) => !/^(\d)\1{11}$/.test(v), 'الرقم الوطني غير صحيح');

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'رقم الهاتف مطلوب')
  .transform((v) => normalizeIraqiPhone(v))
  .refine((v): v is string => Boolean(v), 'رقم الهاتف غير صحيح. الصيغة المتوقعة: 07XXXXXXXXX');

export const fullNameSchema = z
  .string()
  .trim()
  .min(3, 'الاسم الكامل مطلوب')
  .max(120, 'الاسم طويل جدًا')
  .refine((v) => v.split(/\s+/).length >= 2, 'يرجى إدخال الاسم الثلاثي أو الاسم الأول واسم العائلة على الأقل')
  .refine((v) => !/[0-9]/.test(v), 'الاسم لا يجب أن يحتوي على أرقام');

export const dateOfBirthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ الميلاد غير صحيح')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'تاريخ الميلاد غير صحيح')
  .refine((v) => new Date(`${v}T00:00:00Z`).getTime() <= Date.now(), 'تاريخ الميلاد لا يمكن أن يكون في المستقبل')
  .refine((v) => calculateAge(v) >= 18, 'يجب أن يكون عمر المستخدم 18 سنة أو أكثر')
  .refine((v) => calculateAge(v) <= 120, 'تاريخ الميلاد غير منطقي');

export const heightSchema = z.coerce
  .number()
  .refine((v) => Number.isFinite(v), 'الطول غير صحيح')
  .refine((v) => v >= 90 && v <= 250, 'الطول يجب أن يكون بين 90 و250 سم');

export const weightSchema = z.coerce
  .number()
  .refine((v) => Number.isFinite(v), 'الوزن غير صحيح')
  .refine((v) => v >= 20 && v <= 400, 'الوزن يجب أن يكون بين 20 و400 كغم');

/* ------------------------------------------------------------- التسجيل */

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    gender: z.enum(['MALE', 'FEMALE'], { errorMap: () => ({ message: 'يرجى اختيار الجنس' }) }),
    dateOfBirth: dateOfBirthSchema,
    heightCm: heightSchema,
    nationalId: nationalIdSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    nationalIdConsent: z.literal(true, { errorMap: () => ({ message: 'يجب الموافقة على استخدام الرقم الوطني للتحقق من الهوية' }) }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

/* -------------------------------------------------------- الملف الصحي */

export const diabetesProfileSchema = z.object({
  diabetesType: z.enum(['TYPE_1', 'TYPE_2', 'OTHER', 'UNKNOWN']).optional(),
  diagnosisDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  diagnosisYear: z.coerce.number().int().min(1900).max(new Date().getUTCFullYear()).optional().nullable(),
  monitoringMethod: z.enum(['FINGERSTICK', 'CGM', 'BOTH', 'NOT_SPECIFIED']).optional(),
  hypoglycemiaHistory: z.enum(['YES', 'NO', 'UNSURE']).optional(),
  hypoglycemiaAwareness: z.enum(['NORMAL', 'REDUCED', 'UNSURE', 'NOT_SPECIFIED']).optional(),
  treatmentApproach: z.enum(['INSULIN', 'NON_INSULIN_MEDICATION', 'BOTH', 'LIFESTYLE_ONLY', 'NOT_SPECIFIED']).optional(),
  notes: arabicText(1000).optional().nullable(),
});

export const conditionSchema = z.object({
  conditionType: z.enum([
    'HYPERTENSION', 'HEART_DISEASE', 'KIDNEY_DISEASE', 'HIGH_CHOLESTEROL',
    'RETINOPATHY', 'NEUROPATHY', 'FOOT_PROBLEMS', 'OTHER',
  ]),
  status: z.enum(['DIAGNOSED', 'NOT_DIAGNOSED', 'UNKNOWN']),
  notes: arabicText(500).optional().nullable(),
});

export const reproductiveSchema = z.object({
  pregnancyStatus: z.enum(['NOT_APPLICABLE', 'NOT_PREGNANT', 'PREGNANT', 'BREASTFEEDING', 'NOT_SPECIFIED']),
  gestationalDiabetesHistory: z.enum(['YES', 'NO', 'UNSURE']),
  notes: arabicText(500).optional().nullable(),
});

export const additionalInfoSchema = z.object({
  allergies: arabicText(500).optional().nullable(),
  smokingStatus: z.enum(['NEVER', 'CURRENT', 'FORMER', 'NOT_SPECIFIED']).optional(),
  familyHistoryDiabetes: z.enum(['YES', 'NO', 'UNSURE']).optional(),
  healthNotes: arabicText(1000).optional().nullable(),
});

export const profileExtrasSchema = z.object({
  heightCm: heightSchema.optional(),
  preferredGlucoseUnit: z.enum(['MG_DL', 'MMOL_L']).optional(),
  numeralSystem: z.enum(['LATIN', 'ARABIC_INDIC']).optional(),
});

export const contactUpdateSchema = z.object({
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  numeralSystem: z.enum(['LATIN', 'ARABIC_INDIC']).optional(),
  preferredGlucoseUnit: z.enum(['MG_DL', 'MMOL_L']).optional(),
});

/* ---------------------------------------------------------- قياسات السكر */

export const glucoseSchema = z.object({
  glucoseValue: z.coerce
    .number()
    .refine((v) => Number.isFinite(v), 'قيمة السكر يجب أن تكون رقمًا')
    .refine((v) => v > 0, 'قيمة السكر يجب أن تكون أكبر من صفر'),
  glucoseUnit: z.enum(['MG_DL', 'MMOL_L']),
  measurementDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح')
    .refine((v) => new Date(`${v}T00:00:00Z`).getTime() <= Date.now() + 86400_000, 'التاريخ لا يمكن أن يكون في المستقبل'),
  measurementTime: timeString,
  measurementContext: z.enum([
    'FASTING', 'BEFORE_BREAKFAST', 'AFTER_BREAKFAST', 'BEFORE_LUNCH', 'AFTER_LUNCH',
    'BEFORE_DINNER', 'AFTER_DINNER', 'BEFORE_SLEEP', 'OTHER',
  ]),
  minutesAfterMeal: z.coerce.number().int().min(0).max(480).optional().nullable(),
  source: z.enum(['FINGERSTICK_METER', 'CGM', 'LAB', 'OTHER', 'NOT_SPECIFIED']).optional(),
  symptoms: arabicText(300).optional().nullable(),
  notes: arabicText(500).optional().nullable(),
  /** تأكيد المستخدم للقيم غير المعتادة */
  confirmedUnusual: z.boolean().optional().default(false),
});

/* ------------------------------------------------------------ الأدوية */

const doseNumber = z.coerce
  .number()
  .refine((v) => Number.isFinite(v), 'القيمة يجب أن تكون رقمًا')
  .refine((v) => v > 0, 'القيمة يجب أن تكون أكبر من صفر')
  .refine((v) => v <= 100000, 'القيمة كبيرة جدًا');

export const medicationSchema = z.object({
  medicationName: arabicText(120).pipe(z.string().min(2, 'اسم الدواء مطلوب')),
  category: z.enum([
    'INSULIN', 'BIGUANIDE', 'SULFONYLUREA', 'DPP4_INHIBITOR', 'SGLT2_INHIBITOR',
    'GLP1_AGONIST', 'TZD', 'MEGLITINIDE', 'ALPHA_GLUCOSIDASE_INHIBITOR',
    'ANTIHYPERTENSIVE', 'STATIN', 'OTHER',
  ]),
  strength: doseNumber.optional().nullable(),
  strengthUnit: z.enum(['UNIT', 'MG', 'MCG', 'G', 'ML', 'TABLET', 'CAPSULE', 'DROP', 'PUFF', 'SACHET']).optional().nullable(),
  prescribedDose: doseNumber.optional().nullable(),
  doseUnit: z.enum(['UNIT', 'MG', 'MCG', 'G', 'ML', 'TABLET', 'CAPSULE', 'DROP', 'PUFF', 'SACHET']).optional().nullable(),
  route: z.enum(['SUBCUTANEOUS', 'INTRAVENOUS', 'INTRAMUSCULAR', 'ORAL', 'INHALED', 'TOPICAL', 'OTHER']),
  frequency: z.enum(['ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'FOUR_TIMES_DAILY', 'WITH_MEALS', 'BEFORE_MEALS', 'AT_BEDTIME', 'AS_NEEDED', 'WEEKLY', 'OTHER']),
  usualTime: timeString.optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  prescriberName: arabicText(120).optional().nullable(),
  insulinFormulation: arabicText(120).optional().nullable(),
  notes: arabicText(500).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).refine((d) => {
  if (d.startDate && d.endDate) return d.endDate >= d.startDate;
  return true;
}, { message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء', path: ['endDate'] })
  .refine((d) => {
    // الأنسولين يجب أن يُقاس بالوحدات
    if (d.category === 'INSULIN' && d.doseUnit && !['UNIT', 'ML'].includes(d.doseUnit)) return false;
    return true;
  }, { message: 'جرعة الأنسولين تُقاس عادةً بالوحدات', path: ['doseUnit'] });

export const administrationSchema = z.object({
  medicationId: z.string().uuid('يجب اختيار الدواء'),
  actualDose: doseNumber.optional().nullable(),
  doseUnit: z.enum(['UNIT', 'MG', 'MCG', 'G', 'ML', 'TABLET', 'CAPSULE', 'DROP', 'PUFF', 'SACHET']).optional().nullable(),
  administrationDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح')
    .refine((v) => new Date(`${v}T00:00:00Z`).getTime() <= Date.now() + 86400_000, 'التاريخ لا يمكن أن يكون في المستقبل'),
  administrationTime: timeString,
  status: z.enum(['TAKEN', 'MISSED', 'DELAYED']),
  notes: arabicText(500).optional().nullable(),
});

/* --------------------------------------------------------- يومياتي */

export const mealSchema = z.object({
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER']),
  description: arabicText(300).optional().nullable(),
  carbohydrateGrams: z.coerce.number().min(0, 'القيمة لا يمكن أن تكون سالبة').max(1000, 'القيمة كبيرة جدًا').optional().nullable(),
  mealDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح'),
  mealTime: timeString,
  notes: arabicText(500).optional().nullable(),
});

export const activitySchema = z.object({
  activityType: arabicText(80).pipe(z.string().min(2, 'نوع النشاط مطلوب')),
  durationMinutes: z.coerce.number().int().min(1, 'المدة يجب أن تكون دقيقة واحدة على الأقل').max(1440, 'المدة كبيرة جدًا'),
  intensity: z.enum(['LIGHT', 'MODERATE', 'VIGOROUS']),
  activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح'),
  activityTime: timeString,
  notes: arabicText(500).optional().nullable(),
});

export const sleepSchema = z.object({
  durationMinutes: z.coerce.number().int().min(0, 'المدة غير صحيحة').max(1440, 'المدة غير صحيحة'),
  quality: z.enum(['GOOD', 'FAIR', 'POOR', 'NOT_SPECIFIED']),
  sleepDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح'),
  notes: arabicText(500).optional().nullable(),
});

export const symptomSchema = z.object({
  symptomType: z.enum(['DIZZINESS', 'SWEATING', 'TREMOR', 'EXCESSIVE_THIRST', 'FATIGUE', 'HEADACHE', 'BLURRED_VISION', 'PALPITATIONS', 'NAUSEA', 'OTHER']),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE']),
  symptomDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح'),
  symptomTime: timeString,
  notes: arabicText(500).optional().nullable(),
});

export const dailyFactorSchema = z.object({
  factorType: z.enum(['ILLNESS', 'STRESS', 'TRAVEL', 'MENSTRUATION', 'OTHER']),
  description: arabicText(300).optional().nullable(),
  factorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح'),
  factorTime: timeString.optional().nullable(),
});

/* --------------------------------------------------- الوزن والتحاليل */

export const weightRecordSchema = z.object({
  weightKg: weightSchema,
  measurementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح')
    .refine((v) => new Date(`${v}T00:00:00Z`).getTime() <= Date.now() + 86400_000, 'التاريخ لا يمكن أن يكون في المستقبل'),
  notes: arabicText(300).optional().nullable(),
});

export const labResultSchema = z.object({
  testType: z.enum(['HBA1C', 'CREATININE', 'EGFR', 'URINE_ACR', 'BLOOD_PRESSURE', 'TOTAL_CHOLESTEROL', 'LDL', 'HDL', 'TRIGLYCERIDES', 'OTHER']),
  value: z.coerce.number().refine((v) => Number.isFinite(v), 'القيمة يجب أن تكون رقمًا').refine((v) => v >= 0, 'القيمة لا يمكن أن تكون سالبة').refine((v) => v <= 100000, 'القيمة كبيرة جدًا'),
  valueSecondary: z.coerce.number().refine((v) => Number.isFinite(v), 'القيمة يجب أن تكون رقمًا').optional().nullable(),
  unit: z.string().trim().min(1, 'الوحدة مطلوبة').max(24),
  testDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح')
    .refine((v) => new Date(`${v}T00:00:00Z`).getTime() <= Date.now() + 86400_000, 'التاريخ لا يمكن أن يكون في المستقبل'),
  referenceRange: arabicText(80).optional().nullable(),
  notes: arabicText(500).optional().nullable(),
}).refine((d) => (d.testType === 'HBA1C' ? d.value >= 3 && d.value <= 20 : true), {
  message: 'نسبة السكر التراكمي يجب أن تكون بين 3% و20%', path: ['value'],
});

/* ---------------------------------------------------- استعادة كلمة المرور */

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const recoveryCodeSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6,10}$/, 'الرمز يجب أن يكون أرقامًا فقط'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين', path: ['confirmPassword'],
});

export const recoveryVerifySchema = z.object({
  requestId: z.string().uuid(),
  /** تأكيد المدير أنه أجرى التحقق اليدوي من هوية المريض */
  manualVerificationConfirmed: z.literal(true, { errorMap: () => ({ message: 'يجب تأكيد إجراء التحقق اليدوي من الهوية' }) }),
  verificationNote: arabicText(300).optional().nullable(),
});

export const recoveryRejectSchema = z.object({
  requestId: z.string().uuid(),
  reason: arabicText(300).optional().nullable(),
});

/* --------------------------------------------------------- التقارير */

export const reportRangeSchema = z.object({
  from: dateOnlyString,
  to: dateOnlyString,
}).refine((d) => d.from <= d.to, { message: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية', path: ['from'] })
  .refine((d) => {
    const days = (new Date(`${d.to}T00:00:00Z`).getTime() - new Date(`${d.from}T00:00:00Z`).getTime()) / 86400_000;
    return days <= 366;
  }, { message: 'أقصى مدى للتقارير هو سنة واحدة', path: ['from'] });

/* ------------------------------------------------- استعلامات إدارية */

export const adminUserSearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

/** تحويل أخطاء Zod إلى خريطة حقول عربية */
export function zodFieldErrors(error: z.ZodError): { message: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = error.issues[0];
  return { message: first?.message ?? 'البيانات المدخلة غير صحيحة', fields };
}
