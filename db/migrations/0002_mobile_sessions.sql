CREATE TABLE IF NOT EXISTS mobile_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label varchar(120),
  access_token_hash varchar(64) NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent varchar(400),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revocation_reason varchar(40)
);
CREATE INDEX IF NOT EXISTS mobile_sessions_user_idx ON mobile_sessions(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS mobile_sessions_expiry_idx ON mobile_sessions(refresh_expires_at);

CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  token_hash varchar(64) PRIMARY KEY,
  mobile_session_id uuid NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  rotation_request_id uuid,
  CONSTRAINT mobile_refresh_request_unique UNIQUE (mobile_session_id, rotation_request_id)
);
CREATE INDEX IF NOT EXISTS mobile_refresh_session_idx ON mobile_refresh_tokens(mobile_session_id, generation);
CREATE INDEX IF NOT EXISTS mobile_refresh_expiry_idx ON mobile_refresh_tokens(expires_at);

CREATE OR REPLACE FUNCTION revoke_mobile_sessions_on_user_status_change() RETURNS trigger AS $$
BEGIN
  IF (NEW.status <> 'ACTIVE' OR NEW.role <> 'PATIENT')
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.role IS DISTINCT FROM OLD.role) THEN
    UPDATE mobile_sessions
      SET revoked_at = COALESCE(revoked_at, now()), revocation_reason = 'account_unavailable'
      WHERE user_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_revoke_mobile_sessions ON users;
CREATE TRIGGER users_revoke_mobile_sessions
  AFTER UPDATE OF status, role ON users
  FOR EACH ROW EXECUTE FUNCTION revoke_mobile_sessions_on_user_status_change();
