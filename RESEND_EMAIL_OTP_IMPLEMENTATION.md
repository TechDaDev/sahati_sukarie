# Resend Email OTP Implementation

## Architecture

Email OTP uses shared `emailOtpChallenges` table and Resend Node SDK. Challenges bind user, purpose, expiry, retry count, resend delay, delivery state, and provider message ID. OTP storage uses HMAC-SHA-256 derived from `SESSION_SECRET` and challenge ID. Plain codes are sent only to Resend; they are never stored or logged.

Service supports `ACCOUNT_ACTIVATION` and `PASSWORD_RESET`. Codes contain six cryptographically random digits, expire after five minutes, allow five failed attempts, and use sixty-second resend delay. Database limits apply by IP, account, and keyed email hash. Successful verification consumes challenge atomically.

Arabic email templates use RTL layout and contain no medical information. Delivery records and audit events store status, safe provider error code, and Resend message ID. They omit recipient email and OTP.

## Configuration

Required variables when OTP is enabled:

- `EMAIL_OTP_ENABLED=true`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `EMAIL_ACTIVATION_REQUIRED=true` to require activation for new accounts
- `EMAIL_PASSWORD_RECOVERY_ENABLED=true` to enable email reset

All flags default to `false`. Activation and recovery flags require `EMAIL_OTP_ENABLED=true`. Startup validation rejects enabled workflows without Resend credentials and sender email.

## Resend verification

Railway runtime has `RESEND_API_KEY`; its value was not printed. Owner confirms it replaces the exposed key. Runtime sender matches `noreply@sahati.techda.dev`; owner confirms sender domain verification.

One approved harmless test email to `osamaismail80@gmail.com` was accepted by Resend (HTTP 200), message ID `01a14a77-e270-75db-ba7f-de969e307f31`. Send-only key cannot read delivery status; accepted does not mean delivered. Owner inbox receipt remains unconfirmed. Do not retry without approval.

Use the [official Resend Node.js documentation](https://resend.com/docs/send-with-nodejs) for SDK behavior. Keep replacement key in Railway secrets only.

## Routes

Browser routes:

- `POST /api/auth/register`
- `POST /api/auth/activation/verify`
- `POST /api/auth/activation/resend`
- `POST /api/forgot-password`
- `POST /api/auth/password-reset/verify`
- `POST /api/auth/password-reset/complete`

Mobile routes mirror these under `/api/v1/auth/`. Activation and reset verification do not create a general session. Password reset revokes browser and mobile sessions.

## Verification status

Typecheck and production build pass. Isolated PostgreSQL security suite: 19 passed, 0 failed, 0 skipped. Tests cover activation, OTP failures, expiry, replay, cooldown, attempts, concurrency, password reset, browser/mobile revocation, and admin authorization; provider calls are mocked.

Production code is deployed at commit `c2c91d1` in Railway deployment `0adb4faa-e517-4c69-8995-a9cd8e49a5c8` (`SUCCESS`). Runtime feature flags remain false/unset. Production activation OTP, recovery, and authenticated admin workflows remain unverified. Keep mandatory activation disabled until synthetic-account end-to-end checks pass and owner gives separate explicit authorization.
