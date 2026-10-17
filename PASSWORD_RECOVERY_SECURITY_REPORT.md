# Password Recovery Security Report

**Updated:** 2026-10-17

## Implementation

Public recovery uses email OTP and returns the same response for known and unknown addresses. OTP verification issues a short-lived, single-use reset authorization, not a login session. Password reset updates the hash, clears lockout counters, revokes browser and mobile sessions, and writes an audit event.

Admin-generated recovery codes and the legacy redemption endpoint return HTTP 410. The recovery queue is removed from the dashboard; historical recovery tables and audit rows remain intact.

Controls include five-minute six-digit codes, five failed attempts, sixty-second resend cooldown, IP/account/keyed-email limits, purpose-bound HMAC digests, row-locked atomic consumption, and ten-minute single-use reset authorization. OTPs and passwords are not logged or emailed as passwords.

## Verification

- Isolated PostgreSQL security suite: 19 passed, 0 failed, 0 skipped. It covers enumeration resistance, mocked OTP issuance, wrong/expired/replayed/concurrent challenges, attempt limits, reset authorization replay, password update, and browser/mobile session revocation.
- Typecheck and production build passed.
- Railway contains Resend credentials; runtime sender matches `noreply@sahati.techda.dev`. One approved harmless test email was accepted by Resend. Delivery is unconfirmed because the send-only key cannot query status.
- `EMAIL_OTP_ENABLED` and `EMAIL_PASSWORD_RECOVERY_ENABLED` are false/unset in production. No production password recovery flow was run; no real patient account was reset.

## Release status

Recovery code is deployed at commit `c2c91d1` in Railway deployment `0adb4faa-e517-4c69-8995-a9cd8e49a5c8` (`SUCCESS`). Production recovery remains unverified until an approved synthetic account completes the full flow. Keep recovery disabled until that end-to-end test passes.
