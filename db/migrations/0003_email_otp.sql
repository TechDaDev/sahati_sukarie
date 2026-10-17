-- Additive email-OTP schema. Existing account status and password fields stay unchanged.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_activation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_activation_exemption varchar(32) DEFAULT 'LEGACY_CUTOFF';
ALTER TABLE users ALTER COLUMN email_activation_exemption DROP DEFAULT;

CREATE INDEX IF NOT EXISTS users_email_activation_idx
  ON users (email_activation_required, status);

DO $$ BEGIN
  CREATE TYPE email_otp_purpose AS ENUM ('ACCOUNT_ACTIVATION', 'PASSWORD_RESET');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose email_otp_purpose NOT NULL,
  code_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  resend_available_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  consumed_at timestamptz,
  delivery_status varchar(24) NOT NULL DEFAULT 'PENDING',
  provider_message_id text,
  delivery_error_code varchar(64),
  ip_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_otp_user_purpose_idx
  ON email_otp_challenges (user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS email_otp_expiry_idx ON email_otp_challenges (expires_at);
CREATE INDEX IF NOT EXISTS email_otp_delivery_idx
  ON email_otp_challenges (delivery_status, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_authorization_user_idx
  ON password_reset_authorizations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_invitation_user_idx
  ON admin_invitations (user_id, created_at DESC);
