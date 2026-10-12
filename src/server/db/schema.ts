/**
 * صحتي وسكري — مخطط قاعدة البيانات (PostgreSQL / Drizzle ORM)
 * ---------------------------------------------------------------------------
 * مبادئ التصميم:
 *  - كل السجلات الطبية مرتبطة بـ patient_profile_id (وليس بـ user_id) لتسهيل
 *    إضافة أدوار مستقبلية (طبيب، مقدم رعاية) دون تغيير بنية البيانات.
 *  - الطوابع الزمنية تُخزَّن بـ timestamptz (UTC) وتُعرض بتوقيت Asia/Baghdad.
 *  - السجلات الطبية تاريخية: لا تُستبدل بل تُضاف، والتعديل/الحذف يُسجَّل في audit_logs.
 *  - الرقم الوطني يُخزَّن مشفَّرًا (AES-256-GCM) مع فهرس تجزئة (HMAC) لمنع التكرار.
 */
import { sql } from 'drizzle-orm';
import {
  boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, smallint, text,
  time, timestamp, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ enums */

export const userRoleEnum = pgEnum('user_role', ['PATIENT', 'ADMIN', 'DOCTOR']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'DISABLED']);
export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE']);
export const glucoseUnitEnum = pgEnum('glucose_unit', ['MG_DL', 'MMOL_L']);
export const numeralSystemEnum = pgEnum('numeral_system', ['LATIN', 'ARABIC_INDIC']);

export const diabetesTypeEnum = pgEnum('diabetes_type', ['TYPE_1', 'TYPE_2', 'OTHER', 'UNKNOWN']);
export const monitoringMethodEnum = pgEnum('monitoring_method', [
  'FINGERSTICK', 'CGM', 'BOTH', 'NOT_SPECIFIED',
]);
export const yesNoUnsureEnum = pgEnum('yes_no_unsure', ['YES', 'NO', 'UNSURE']);
export const hypoAwarenessEnum = pgEnum('hypo_awareness', [
  'NORMAL', 'REDUCED', 'UNSURE', 'NOT_SPECIFIED',
]);
export const treatmentApproachEnum = pgEnum('treatment_approach', [
  'INSULIN', 'NON_INSULIN_MEDICATION', 'BOTH', 'LIFESTYLE_ONLY', 'NOT_SPECIFIED',
]);
export const conditionTypeEnum = pgEnum('condition_type', [
  'HYPERTENSION', 'HEART_DISEASE', 'KIDNEY_DISEASE', 'HIGH_CHOLESTEROL',
  'RETINOPATHY', 'NEUROPATHY', 'FOOT_PROBLEMS', 'OTHER',
]);
export const conditionStatusEnum = pgEnum('condition_status', ['DIAGNOSED', 'NOT_DIAGNOSED', 'UNKNOWN']);
export const smokingStatusEnum = pgEnum('smoking_status', ['NEVER', 'CURRENT', 'FORMER', 'NOT_SPECIFIED']);
export const pregnancyStatusEnum = pgEnum('pregnancy_status', [
  'NOT_APPLICABLE', 'NOT_PREGNANT', 'PREGNANT', 'BREASTFEEDING', 'NOT_SPECIFIED',
]);

export const measurementContextEnum = pgEnum('measurement_context', [
  'FASTING', 'BEFORE_BREAKFAST', 'AFTER_BREAKFAST', 'BEFORE_LUNCH', 'AFTER_LUNCH',
  'BEFORE_DINNER', 'AFTER_DINNER', 'BEFORE_SLEEP', 'OTHER',
]);
export const glucoseSourceEnum = pgEnum('glucose_source', [
  'FINGERSTICK_METER', 'CGM', 'LAB', 'OTHER', 'NOT_SPECIFIED',
]);

export const medicationCategoryEnum = pgEnum('medication_category', [
  'INSULIN', 'BIGUANIDE', 'SULFONYLUREA', 'DPP4_INHIBITOR', 'SGLT2_INHIBITOR',
  'GLP1_AGONIST', 'TZD', 'MEGLITINIDE', 'ALPHA_GLUCOSIDASE_INHIBITOR',
  'ANTIHYPERTENSIVE', 'STATIN', 'OTHER',
]);
export const doseUnitEnum = pgEnum('dose_unit', [
  'UNIT', 'MG', 'MCG', 'G', 'ML', 'TABLET', 'CAPSULE', 'DROP', 'PUFF', 'SACHET',
]);
export const administrationRouteEnum = pgEnum('administration_route', [
  'SUBCUTANEOUS', 'INTRAVENOUS', 'INTRAMUSCULAR', 'ORAL', 'INHALED', 'TOPICAL', 'OTHER',
]);
export const medicationFrequencyEnum = pgEnum('medication_frequency', [
  'ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'FOUR_TIMES_DAILY',
  'WITH_MEALS', 'BEFORE_MEALS', 'AT_BEDTIME', 'AS_NEEDED', 'WEEKLY', 'OTHER',
]);
export const medicationStatusEnum = pgEnum('medication_status', ['ACTIVE', 'INACTIVE']);
export const administrationStatusEnum = pgEnum('administration_status', ['TAKEN', 'MISSED', 'DELAYED']);

export const mealTypeEnum = pgEnum('meal_type', [
  'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER',
]);
export const activityIntensityEnum = pgEnum('activity_intensity', ['LIGHT', 'MODERATE', 'VIGOROUS']);
export const sleepQualityEnum = pgEnum('sleep_quality', ['GOOD', 'FAIR', 'POOR', 'NOT_SPECIFIED']);
export const symptomTypeEnum = pgEnum('symptom_type', [
  'DIZZINESS', 'SWEATING', 'TREMOR', 'EXCESSIVE_THIRST', 'FATIGUE',
  'HEADACHE', 'BLURRED_VISION', 'PALPITATIONS', 'NAUSEA', 'OTHER',
]);
export const symptomSeverityEnum = pgEnum('symptom_severity', ['MILD', 'MODERATE', 'SEVERE']);
export const dailyFactorTypeEnum = pgEnum('daily_factor_type', ['ILLNESS', 'STRESS', 'TRAVEL', 'MENSTRUATION', 'OTHER']);

export const labTestTypeEnum = pgEnum('lab_test_type', [
  'HBA1C', 'CREATININE', 'EGFR', 'URINE_ACR', 'BLOOD_PRESSURE', 'TOTAL_CHOLESTEROL',
  'LDL', 'HDL', 'TRIGLYCERIDES', 'OTHER',
]);

export const recoveryStatusEnum = pgEnum('recovery_status', [
  'PENDING', 'VERIFIED', 'COMPLETED', 'REJECTED', 'EXPIRED',
]);

export const auditActorRoleEnum = pgEnum('audit_actor_role', ['PATIENT', 'ADMIN', 'SYSTEM']);

/* ------------------------------------------------------------------ users */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('PATIENT'),
  status: userStatusEnum('status').notNull().default('ACTIVE'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUnique: uniqueIndex('users_email_lower_unique').on(sql`lower(${t.email})`),
  roleIdx: index('users_role_idx').on(t.role, t.status),
}));

export const sessions = pgTable('sessions', {
  /** SHA-256 لتوكن الجلسة — لا يُخزَّن التوكن الصريح أبدًا */
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  csrfToken: text('csrf_token').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({ userIdx: index('sessions_user_idx').on(t.userId) }));

/* --------------------------------------------------------------- patients */

export const patientProfiles = pgTable('patient_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  gender: genderEnum('gender').notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  heightCm: numeric('height_cm', { precision: 5, scale: 1 }).notNull(),
  /** الرقم الوطني مشفَّر بـ AES-256-GCM ويُعرض مقنّعًا فقط */
  nationalIdProtected: text('national_id_protected').notNull(),
  /** HMAC-SHA256 للرقم الوطني — يُستخدم لكشف التكرار دون تخزين الرقم صريحًا */
  nationalIdHash: text('national_id_hash').notNull(),
  nationalIdLast4: varchar('national_id_last4', { length: 4 }).notNull(),
  phoneNumber: text('phone_number').notNull(),
  phoneNorm: text('phone_norm').notNull(),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  preferredGlucoseUnit: glucoseUnitEnum('preferred_glucose_unit').notNull().default('MG_DL'),
  numeralSystem: numeralSystemEnum('numeral_system').notNull().default('LATIN'),
  timezone: text('timezone').notNull().default('Asia/Baghdad'),
  // المجموعة (د): معلومات إضافية
  allergies: text('allergies'),
  smokingStatus: smokingStatusEnum('smoking_status').notNull().default('NOT_SPECIFIED'),
  familyHistoryDiabetes: yesNoUnsureEnum('family_history_diabetes').notNull().default('UNSURE'),
  healthNotes: text('health_notes'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nationalIdHashUnique: uniqueIndex('patient_national_id_hash_unique').on(t.nationalIdHash),
  phoneIdx: index('patient_phone_idx').on(t.phoneNorm),
  nameIdx: index('patient_name_idx').on(t.fullName),
}));

export const diabetesProfiles = pgTable('diabetes_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().unique().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  diabetesType: diabetesTypeEnum('diabetes_type').notNull().default('UNKNOWN'),
  diagnosisDate: date('diagnosis_date'),
  diagnosisYear: smallint('diagnosis_year'),
  monitoringMethod: monitoringMethodEnum('monitoring_method').notNull().default('NOT_SPECIFIED'),
  hypoglycemiaHistory: yesNoUnsureEnum('hypoglycemia_history').notNull().default('UNSURE'),
  hypoglycemiaAwareness: hypoAwarenessEnum('hypoglycemia_awareness').notNull().default('NOT_SPECIFIED'),
  treatmentApproach: treatmentApproachEnum('treatment_approach').notNull().default('NOT_SPECIFIED'),
  notes: text('notes'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patientConditions = pgTable('patient_conditions', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  conditionType: conditionTypeEnum('condition_type').notNull(),
  status: conditionStatusEnum('status').notNull().default('UNKNOWN'),
  notes: text('notes'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ unique: uniqueIndex('patient_conditions_unique').on(t.patientId, t.conditionType) }));

export const reproductiveHistory = pgTable('reproductive_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().unique().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  pregnancyStatus: pregnancyStatusEnum('pregnancy_status').notNull().default('NOT_SPECIFIED'),
  gestationalDiabetesHistory: yesNoUnsureEnum('gestational_diabetes_history').notNull().default('UNSURE'),
  notes: text('notes'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------ medications */

export const medications = pgTable('medications', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  medicationName: text('medication_name').notNull(),
  category: medicationCategoryEnum('category').notNull().default('OTHER'),
  /** تركيز/قوة الدواء — مثال: 500 ملغم أو 100 وحدة/مل */
  strength: numeric('strength', { precision: 10, scale: 3 }),
  strengthUnit: doseUnitEnum('strength_unit'),
  /** الجرعة الموصوفة — منفصلة تمامًا عن الجرعة الفعلية المسجَّلة */
  prescribedDose: numeric('prescribed_dose', { precision: 10, scale: 3 }),
  doseUnit: doseUnitEnum('dose_unit'),
  route: administrationRouteEnum('route').notNull().default('ORAL'),
  frequency: medicationFrequencyEnum('frequency').notNull().default('OTHER'),
  usualTime: time('usual_time'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  prescriberName: text('prescriber_name'),
  insulinFormulation: text('insulin_formulation'),
  notes: text('notes'),
  status: medicationStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('medications_patient_idx').on(t.patientId, t.status) }));

export const medicationAdministrations = pgTable('medication_administrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  medicationId: uuid('medication_id').notNull().references(() => medications.id, { onDelete: 'restrict' }),
  actualDose: numeric('actual_dose', { precision: 10, scale: 3 }),
  doseUnit: doseUnitEnum('dose_unit'),
  administrationDatetime: timestamp('administration_datetime', { withTimezone: true }).notNull(),
  status: administrationStatusEnum('status').notNull().default('TAKEN'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('med_admin_patient_idx').on(t.patientId, t.administrationDatetime) }));

/* ------------------------------------------------------ glucose & vitals */

export const glucoseReadings = pgTable('glucose_readings', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  /** القيمة كما أدخلها المستخدم مع وحدته الأصلية */
  glucoseValue: numeric('glucose_value', { precision: 7, scale: 2 }).notNull(),
  glucoseUnit: glucoseUnitEnum('glucose_unit').notNull(),
  /** تمثيل موحّد داخليًا بوحدة mg/dL بدقة عالية للمقارنة والرسوم */
  standardizedValueMgdl: numeric('standardized_value_mgdl', { precision: 8, scale: 3 }).notNull(),
  measurementDatetime: timestamp('measurement_datetime', { withTimezone: true }).notNull(),
  measurementContext: measurementContextEnum('measurement_context').notNull().default('OTHER'),
  minutesAfterMeal: integer('minutes_after_meal'),
  source: glucoseSourceEnum('source').notNull().default('NOT_SPECIFIED'),
  symptomsText: text('symptoms_text'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('glucose_patient_idx').on(t.patientId, t.measurementDatetime) }));

export const weightRecords = pgTable('weight_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  weightKg: numeric('weight_kg', { precision: 5, scale: 2 }).notNull(),
  measurementDate: date('measurement_date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('weight_patient_idx').on(t.patientId, t.measurementDate) }));

export const labResults = pgTable('lab_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  testType: labTestTypeEnum('test_type').notNull(),
  value: numeric('value', { precision: 10, scale: 3 }).notNull(),
  /** للضغط: القيمة الانقباضية في value والانبساطية هنا */
  valueSecondary: numeric('value_secondary', { precision: 10, scale: 3 }),
  unit: text('unit').notNull(),
  testDate: date('test_date').notNull(),
  referenceRange: text('reference_range'),
  notes: text('notes'),
  /** هل أدخل المريض النتيجة يدويًا؟ (MVP: نعم دائمًا) */
  enteredByPatient: boolean('entered_by_patient').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('lab_patient_idx').on(t.patientId, t.testType, t.testDate) }));

/* ----------------------------------------------------------- daily journal */

export const mealRecords = pgTable('meal_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  mealType: mealTypeEnum('meal_type').notNull(),
  description: text('description'),
  carbohydrateGrams: numeric('carbohydrate_grams', { precision: 6, scale: 1 }),
  mealDatetime: timestamp('meal_datetime', { withTimezone: true }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('meal_patient_idx').on(t.patientId, t.mealDatetime) }));

export const activityRecords = pgTable('activity_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  activityType: text('activity_type').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  intensity: activityIntensityEnum('intensity').notNull().default('MODERATE'),
  activityDatetime: timestamp('activity_datetime', { withTimezone: true }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('activity_patient_idx').on(t.patientId, t.activityDatetime) }));

export const sleepRecords = pgTable('sleep_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  /** مدة النوم بالدقائق (تُعرض بالساعات) */
  durationMinutes: integer('duration_minutes').notNull(),
  quality: sleepQualityEnum('quality').notNull().default('NOT_SPECIFIED'),
  sleepDate: date('sleep_date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('sleep_patient_idx').on(t.patientId, t.sleepDate) }));

export const symptomRecords = pgTable('symptom_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  symptomType: symptomTypeEnum('symptom_type').notNull(),
  severity: symptomSeverityEnum('severity').notNull().default('MILD'),
  symptomDatetime: timestamp('symptom_datetime', { withTimezone: true }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('symptom_patient_idx').on(t.patientId, t.symptomDatetime) }));

export const dailyFactors = pgTable('daily_factors', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patientProfiles.id, { onDelete: 'cascade' }),
  factorType: dailyFactorTypeEnum('factor_type').notNull(),
  description: text('description'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ patientIdx: index('factor_patient_idx').on(t.patientId, t.recordedAt) }));

/* -------------------------------------------------------- password recovery */

export const passwordRecoveryRequests = pgTable('password_recovery_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientUserId: uuid('patient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  patientProfileId: uuid('patient_profile_id').references(() => patientProfiles.id, { onDelete: 'set null' }),
  requestDate: timestamp('request_date', { withTimezone: true }).notNull().defaultNow(),
  status: recoveryStatusEnum('status').notNull().default('PENDING'),
  verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  requestIp: text('request_ip'),
}, (t) => ({
  statusIdx: index('recovery_status_idx').on(t.status, t.requestDate),
  userIdx: index('recovery_user_idx').on(t.patientUserId, t.status),
}));

export const passwordRecoveryTokens = pgTable('password_recovery_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').notNull().references(() => passwordRecoveryRequests.id, { onDelete: 'cascade' }),
  /** SHA-256 للرمز — الرمز الصريح لا يُخزَّن ولا يُسجَّل */
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ requestIdx: index('recovery_token_request_idx').on(t.requestId), hashIdx: index('recovery_token_hash_idx').on(t.tokenHash) }));

/* ------------------------------------------------------------------ audit */

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorRole: auditActorRoleEnum('actor_role').notNull().default('SYSTEM'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  /** لا تُخزَّن هنا أي بيانات صحية حساسة غير لازمة للمراجعة */
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actorIdx: index('audit_actor_idx').on(t.actorUserId, t.createdAt),
  targetIdx: index('audit_target_idx').on(t.targetType, t.targetId),
}));

/** محدد معدل الطلبات (rate limiting) المدعوم بقاعدة البيانات */
export const rateLimitCounters = pgTable('rate_limit_counters', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  counter: integer('counter').notNull().default(0),
}, (t) => ({ windowIdx: index('rate_limit_window_idx').on(t.windowStart) }));

export type User = typeof users.$inferSelect;
export type PatientProfile = typeof patientProfiles.$inferSelect;
export type GlucoseReading = typeof glucoseReadings.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type MedicationAdministration = typeof medicationAdministrations.$inferSelect;
