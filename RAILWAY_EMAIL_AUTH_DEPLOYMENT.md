# Railway Email Authentication Deployment

**Updated:** 2026-10-17

## Production configuration

- Railway project: `sahati-wa-sukari`; environment: `production`; app service: `sahati_sukarie`.
- Runtime contains `RESEND_API_KEY`; its value was never printed. Owner confirms this replacement was created after revoking the exposed key.
- Runtime sender matches `noreply@sahati.techda.dev`. Owner confirms sender domain verification.
- `EMAIL_OTP_ENABLED`, `EMAIL_PASSWORD_RECOVERY_ENABLED`, and `EMAIL_ACTIVATION_REQUIRED` are false/unset.
- One authorized harmless test email was accepted by Resend (HTTP 200), message ID `01a14a77-e270-75db-ba7f-de969e307f31`. The send-only key cannot read delivery status; inbox delivery remains unconfirmed.
- Admin invitation to owner-approved `admin@sahati.iq` was accepted by Resend, message ID `01a14a8c-ddac-7289-bd72-eb7c0ea9d13c`. Delivery and redemption remain unconfirmed.

## Migration and data safety

- Railway pre-deploy migration `npm run db:migrate` applied `0003_email_otp.sql`; migration history includes `0001`-`0003`.
- A pre-migration encrypted PostgreSQL dump was restored successfully in isolated PostgreSQL 18. Path: `/home/zeus3000/.local/state/sahati-prod-backups/sahati-production-20261017T153157Z.dump.gpg`; SHA-256 `ab6a478087e421af3cbda5325b1eacc5b35f0dda9770d71995ffa4af1666afe7`.
- Current aggregate: 4 accounts, 3 active patients, 3 legacy exemptions, 0 verified patient-email timestamps, 0 pending/suspended/disabled accounts, 1 admin, 1 active invitation. Admin requires first password change. No patient identifiers were queried or printed.
- Existing patient passwords, sessions, statuses, and medical records were preserved.

## Deployment and route checks

- Latest application commit: `c2c91d1cea5fbae10023c37f8a4e91d9486c96eb`.
- Railway deployment `0adb4faa-e517-4c69-8995-a9cd8e49a5c8`: `SUCCESS`.
- `/`, `/login`, `/register`, `/forgot-password`, `/admin/login`, `/admin/accept-invitation`, `/api/health`, `/api/openapi.json`: HTTP 200.
- `/admin`: HTTP 307 to login. Unauthenticated admin APIs: HTTP 401.
- These public checks do not prove authenticated OTP, password recovery, or admin workflows.

## Verification limits

`npm run typecheck`, production build, and isolated PostgreSQL security suite passed (19 passed, 0 failed, 0 skipped). The suite mocks Resend. Production OTP activation, password recovery, admin invitation redemption, admin login, and authenticated permissions remain unverified. Keep all email-auth flags off until approved synthetic-account end-to-end checks pass. Do not enable mandatory activation without separate explicit owner authorization.
