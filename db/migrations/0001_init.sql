-- ============================================================================
-- صحتي وسكري — الترحيل رقم 1: البنية الأساسية الكاملة لقاعدة البيانات
-- PostgreSQL • جميع الطوابع الزمنية timestamptz (UTC)
-- ملاحظة: الجداول مُصمَّمة بحيث يمكن إضافة دور "طبيب" مستقبلًا عبر
--        جدول الإحالات على patient_profiles.id دون تغيير بنية السجلات الطبية.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('PATIENT','ADMIN','DOCTOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE','SUSPENDED','DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE gender AS ENUM ('MALE','FEMALE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE glucose_unit AS ENUM ('MG_DL','MMOL_L');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE numeral_system AS ENUM ('LATIN','ARABIC_INDIC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE diabetes_type AS ENUM ('TYPE_1','TYPE_2','OTHER','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE monitoring_method AS ENUM ('FINGERSTICK','CGM','BOTH','NOT_SPECIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE yes_no_unsure AS ENUM ('YES','NO','UNSURE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE hypo_awareness AS ENUM ('NORMAL','REDUCED','UNSURE','NOT_SPECIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE treatment_approach AS ENUM ('INSULIN','NON_INSULIN_MEDICATION','BOTH','LIFESTYLE_ONLY','NOT_SPECIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE condition_type AS ENUM ('HYPERTENSION','HEART_DISEASE','KIDNEY_DISEASE','HIGH_CHOLESTEROL','RETINOPATHY','NEUROPATHY','FOOT_PROBLEMS','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE condition_status AS ENUM ('DIAGNOSED','NOT_DIAGNOSED','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE smoking_status AS ENUM ('NEVER','CURRENT','FORMER','NOT_SPECIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE pregnancy_status AS ENUM ('NOT_APPLICABLE','NOT_PREGNANT','PREGNANT','BREASTFEEDING','NOT_SPECIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE measurement_context AS ENUM ('FASTING','BEFORE_BREAKFAST','AFTER_BREAKFAST','BEFORE_LUNCH','AFTER_LUNCH','BEFORE_DINNER','AFTER_DINNER','BEFORE_SLEEP','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE glucose_source AS ENUM ('FINGERSTICK_METER','CGM','LAB','OTHER','NOT_SPECIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE medication_category AS ENUM ('INSULIN','BIGUANIDE','SULFONYLUREA','DPP4_INHIBITOR','SGLT2_INHIBITOR','GLP1_AGONIST','TZD','MEGLITINIDE','ALPHA_GLUCOSIDASE_INHIBITOR','ANTIHYPERTENSIVE','STATIN','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE dose_unit AS ENUM ('UNIT','MG','MCG','G','ML','TABLET','CAPSULE','DROP','PUFF','SACHET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE administration_route AS ENUM ('SUBCUTANEOUS','INTRAVENOUS','INTRAMUSCULAR','ORAL','INHALED','TOPICAL','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE medication_frequency AS ENUM ('ONCE_DAILY','TWICE_DAILY','THREE_TIMES_DAILY','FOUR_TIMES_DAILY','WITH_MEALS','BEFORE_MEALS','AT_BEDTIME','AS_NEEDED','WEEKLY','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE medication_status AS ENUM ('ACTIVE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE administration_status AS ENUM ('TAKEN','MISSED','DELAYED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE meal_type AS ENUM ('BREAKFAST','LUNCH','DINNER','SNACK','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE activity_intensity AS ENUM ('LIGHT','MODERATE','VIGOROUS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE sleep_quality AS ENUM ('GOOD','FAIR','POOR','NOT_SPECIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE symptom_type AS ENUM ('DIZZINESS','SWEATING','TREMOR','EXCESSIVE_THIRST','FATIGUE','HEADACHE','BLURRED_VISION','PALPITATIONS','NAUSEA','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE symptom_severity AS ENUM ('MILD','MODERATE','SEVERE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE daily_factor_type AS ENUM ('ILLNESS','STRESS','TRAVEL','MENSTRUATION','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE lab_test_type AS ENUM ('HBA1C','CREATININE','EGFR','URINE_ACR','BLOOD_PRESSURE','TOTAL_CHOLESTEROL','LDL','HDL','TRIGLYCERIDES','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE recovery_status AS ENUM ('PENDING','VERIFIED','COMPLETED','REJECTED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE audit_actor_role AS ENUM ('PATIENT','ADMIN','SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'PATIENT',
  status user_status NOT NULL DEFAULT 'ACTIVE',
  must_change_password boolean NOT NULL DEFAULT false,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role, status);

-- ------------------------------------------------------------- sessions
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,                          -- SHA-256 لتوكن الجلسة
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- ------------------------------------------------------- patient_profiles
CREATE TABLE IF NOT EXISTS patient_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  gender gender NOT NULL,
  date_of_birth date NOT NULL,
  height_cm numeric(5,1) NOT NULL CHECK (height_cm >= 50 AND height_cm <= 260),
  national_id_protected text NOT NULL,          -- AES-256-GCM
  national_id_hash text NOT NULL,               -- HMAC-SHA256 (فهرس أعمى)
  national_id_last4 varchar(4) NOT NULL,
  phone_number text NOT NULL,                   -- صيغة دولية موحّدة +964...
  phone_norm text NOT NULL,
  phone_verified boolean NOT NULL DEFAULT false, -- لا يوجد تحقق إلكتروني في هذه النسخة
  preferred_glucose_unit glucose_unit NOT NULL DEFAULT 'MG_DL',
  numeral_system numeral_system NOT NULL DEFAULT 'LATIN',
  timezone text NOT NULL DEFAULT 'Asia/Baghdad',
  allergies text,
  smoking_status smoking_status NOT NULL DEFAULT 'NOT_SPECIFIED',
  family_history_diabetes yes_no_unsure NOT NULL DEFAULT 'UNSURE',
  health_notes text,
  onboarding_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_dob_not_future CHECK (date_of_birth <= CURRENT_DATE),
  CONSTRAINT patient_national_id_hash_unique UNIQUE (national_id_hash)
);
CREATE INDEX IF NOT EXISTS patient_phone_idx ON patient_profiles (phone_norm);
CREATE INDEX IF NOT EXISTS patient_name_idx ON patient_profiles (full_name);

-- ------------------------------------------------------ diabetes_profiles
CREATE TABLE IF NOT EXISTS diabetes_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL UNIQUE REFERENCES patient_profiles(id) ON DELETE CASCADE,
  diabetes_type diabetes_type NOT NULL DEFAULT 'UNKNOWN',
  diagnosis_date date,
  diagnosis_year smallint,
  monitoring_method monitoring_method NOT NULL DEFAULT 'NOT_SPECIFIED',
  hypoglycemia_history yes_no_unsure NOT NULL DEFAULT 'UNSURE',
  hypoglycemia_awareness hypo_awareness NOT NULL DEFAULT 'NOT_SPECIFIED',
  treatment_approach treatment_approach NOT NULL DEFAULT 'NOT_SPECIFIED',
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------- patient_conditions
CREATE TABLE IF NOT EXISTS patient_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  condition_type condition_type NOT NULL,
  status condition_status NOT NULL DEFAULT 'UNKNOWN',
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_conditions_unique UNIQUE (patient_id, condition_type)
);

-- ---------------------------------------------------- reproductive_history
CREATE TABLE IF NOT EXISTS reproductive_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL UNIQUE REFERENCES patient_profiles(id) ON DELETE CASCADE,
  pregnancy_status pregnancy_status NOT NULL DEFAULT 'NOT_SPECIFIED',
  gestational_diabetes_history yes_no_unsure NOT NULL DEFAULT 'UNSURE',
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ medications
CREATE TABLE IF NOT EXISTS medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  medication_name text NOT NULL,
  category medication_category NOT NULL DEFAULT 'OTHER',
  strength numeric(10,3) CHECK (strength IS NULL OR strength > 0),
  strength_unit dose_unit,
  prescribed_dose numeric(10,3) CHECK (prescribed_dose IS NULL OR prescribed_dose > 0),
  dose_unit dose_unit,
  route administration_route NOT NULL DEFAULT 'ORAL',
  frequency medication_frequency NOT NULL DEFAULT 'OTHER',
  usual_time time,
  start_date date,
  end_date date,
  prescriber_name text,
  insulin_formulation text,
  notes text,
  status medication_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT med_dates_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS medications_patient_idx ON medications (patient_id, status);

-- --------------------------------------------- medication_administrations
CREATE TABLE IF NOT EXISTS medication_administrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE RESTRICT,
  actual_dose numeric(10,3) CHECK (actual_dose IS NULL OR actual_dose > 0),
  dose_unit dose_unit,
  administration_datetime timestamptz NOT NULL,
  status administration_status NOT NULL DEFAULT 'TAKEN',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS med_admin_patient_idx ON medication_administrations (patient_id, administration_datetime DESC);

-- -------------------------------------------------------- glucose_readings
CREATE TABLE IF NOT EXISTS glucose_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  glucose_value numeric(7,2) NOT NULL CHECK (glucose_value > 0),
  glucose_unit glucose_unit NOT NULL,
  standardized_value_mgdl numeric(8,3) NOT NULL CHECK (standardized_value_mgdl > 0),
  measurement_datetime timestamptz NOT NULL,
  measurement_context measurement_context NOT NULL DEFAULT 'OTHER',
  minutes_after_meal integer CHECK (minutes_after_meal IS NULL OR (minutes_after_meal >= 0 AND minutes_after_meal <= 480)),
  source glucose_source NOT NULL DEFAULT 'NOT_SPECIFIED',
  symptoms_text text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS glucose_patient_idx ON glucose_readings (patient_id, measurement_datetime DESC);

-- ---------------------------------------------------------- weight_records
CREATE TABLE IF NOT EXISTS weight_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  weight_kg numeric(5,2) NOT NULL CHECK (weight_kg >= 20 AND weight_kg <= 400),
  measurement_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weight_date_not_future CHECK (measurement_date <= CURRENT_DATE + 1)
);
CREATE INDEX IF NOT EXISTS weight_patient_idx ON weight_records (patient_id, measurement_date DESC);

-- -------------------------------------------------------------- lab_results
CREATE TABLE IF NOT EXISTS lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  test_type lab_test_type NOT NULL,
  value numeric(10,3) NOT NULL CHECK (value >= 0),
  value_secondary numeric(10,3),
  unit text NOT NULL,
  test_date date NOT NULL,
  reference_range text,
  notes text,
  entered_by_patient boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_patient_idx ON lab_results (patient_id, test_type, test_date DESC);

-- ------------------------------------------------------------ meal_records
CREATE TABLE IF NOT EXISTS meal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  meal_type meal_type NOT NULL,
  description text,
  carbohydrate_grams numeric(6,1) CHECK (carbohydrate_grams IS NULL OR (carbohydrate_grams >= 0 AND carbohydrate_grams <= 1000)),
  meal_datetime timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meal_patient_idx ON meal_records (patient_id, meal_datetime DESC);

-- -------------------------------------------------------- activity_records
CREATE TABLE IF NOT EXISTS activity_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  intensity activity_intensity NOT NULL DEFAULT 'MODERATE',
  activity_datetime timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_patient_idx ON activity_records (patient_id, activity_datetime DESC);

-- ----------------------------------------------------------- sleep_records
CREATE TABLE IF NOT EXISTS sleep_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  duration_minutes integer NOT NULL CHECK (duration_minutes >= 0 AND duration_minutes <= 1440),
  quality sleep_quality NOT NULL DEFAULT 'NOT_SPECIFIED',
  sleep_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sleep_patient_idx ON sleep_records (patient_id, sleep_date DESC);

-- --------------------------------------------------------- symptom_records
CREATE TABLE IF NOT EXISTS symptom_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  symptom_type symptom_type NOT NULL,
  severity symptom_severity NOT NULL DEFAULT 'MILD',
  symptom_datetime timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS symptom_patient_idx ON symptom_records (patient_id, symptom_datetime DESC);

-- ------------------------------------------------------------ daily_factors
CREATE TABLE IF NOT EXISTS daily_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  factor_type daily_factor_type NOT NULL,
  description text,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS factor_patient_idx ON daily_factors (patient_id, recorded_at DESC);

-- --------------------------------------------- password_recovery_requests
CREATE TABLE IF NOT EXISTS password_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_profile_id uuid REFERENCES patient_profiles(id) ON DELETE SET NULL,
  request_date timestamptz NOT NULL DEFAULT now(),
  status recovery_status NOT NULL DEFAULT 'PENDING',
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  request_ip text
);
CREATE INDEX IF NOT EXISTS recovery_status_idx ON password_recovery_requests (status, request_date DESC);
CREATE INDEX IF NOT EXISTS recovery_user_idx ON password_recovery_requests (patient_user_id, status);

-- ----------------------------------------------- password_recovery_tokens
CREATE TABLE IF NOT EXISTS password_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES password_recovery_requests(id) ON DELETE CASCADE,
  token_hash text NOT NULL,                     -- SHA-256 فقط — لا يُخزَّن الرمز الصريح
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_token_request_idx ON password_recovery_tokens (request_id);
CREATE INDEX IF NOT EXISTS recovery_token_hash_idx ON password_recovery_tokens (token_hash);

-- ------------------------------------------------------------- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role audit_actor_role NOT NULL DEFAULT 'SYSTEM',
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_target_idx ON audit_logs (target_type, target_id);

-- ---------------------------------------------------- rate_limit_counters
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  counter integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS rate_limit_window_idx ON rate_limit_counters (window_start);

-- ------------------------------------------------------- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','patient_profiles','diabetes_profiles','patient_conditions',
    'reproductive_history','medications','medication_administrations','glucose_readings','lab_results']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- ملاحظة تصميمية: للسماح بدور "طبيب" في نسخة لاحقة، يمكن إضافة جدول إحالات
-- مثل care_links (doctor_user_id, patient_id, status) دون أي تغيير في بنية
-- السجلات الطبية أعلاه، لأنها مرتبطة بـ patient_profiles.id فقط.
-- ============================================================================
