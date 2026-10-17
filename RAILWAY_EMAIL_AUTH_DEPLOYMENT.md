# Railway Email Authentication Deployment

**Updated:** 2026-10-17

## Production configuration

- Railway project: `sahati-wa-sukari`; environment: `production`; app service: `sahati_sukarie`.
- Runtime contains `RESEND_API_KEY`; its value was never printed. Owner confirms this replacement was created after revoking the exposed key.
- Runtime sender matches `noreply@sahati.techda.dev`. Owner confirms sender domain verification.
- Current runtime flags: `EMAIL_OTP_ENABLED=true`, `EMAIL_PASSWORD_RECOVERY_ENABLED=true`, `EMAIL_ACTIVATION_REQUIRED=false`. The activation flag was enabled for a live canary, then rolled back after production remained unverified.
- One authorized harmless test email was accepted by Resend (HTTP 200), message ID `01a14a77-e270-75db-ba7f-de969e307f31`. The send-only key cannot read delivery status; inbox delivery remains unconfirmed.
- Admin invitation to owner-approved `admin@sahati.iq` was accepted by Resend, message ID `01a14a8c-ddac-7289-bd72-eb7c0ea9d13c`. Delivery and redemption remain unconfirmed.

## Migration and data safety

- Railway pre-deploy migration `npm run db:migrate` applied `0003_email_otp.sql`; migration history includes `0001`-`0003`.
- A pre-migration encrypted PostgreSQL dump was restored successfully in isolated PostgreSQL 18. Path: `/home/zeus3000/.local/state/sahati-prod-backups/sahati-production-20261017T153157Z.dump.gpg`; SHA-256 `ab6a478087e421af3cbda5325b1eacc5b35f0dda9770d71995ffa4af1666afe7`.
- Current aggregate: 5 accounts, 4 active patients, 3 legacy exemptions, 0 verified patient-email timestamps, 1 admin, 1 active invitation, plus 1 synthetic activation-test patient with activation required. No patient identifiers were queried or printed.
- Existing patient passwords, sessions, statuses, and medical records were preserved.

## Deployment and route checks

- Latest application commit: `b930091c6e26fd19de1120d32710c0fe8e9344de`.
- Activation canary deployments `9fa4ec41-e91e-4149-b37b-7ba7f114e513` and `13dfe7ee-98c7-4e4d-9181-55313d78e839`: `SUCCESS`; final rollback deployment `f4a06cfc-622d-4b76-9cfd-0696b3b78bf3`: `SUCCESS` with mandatory activation disabled.
- Current checks: `/api/health` and `/verify-email`: HTTP 200; `/api/admin/users` and `/api/admin/security-events`: HTTP 401 unauthenticated.
- These public checks do not prove authenticated OTP, password recovery, or admin workflows.

## Verification limits

`npm run typecheck`, production build, isolated PostgreSQL security suite (19 passed, 0 failed, 0 skipped), and browser suite (1 passed) passed locally. The browser suite verifies the dynamic CSP nonce and resend interaction. Production `/verify-email` was statically cached for one year without script nonces, blocking hydration; the source fix is not deployed yet. One synthetic activation email was accepted, but the account remains unverified and its challenge expired unused. Browser/mobile login after activation, production password recovery, invitation redemption, admin login, and authenticated permissions remain unverified. Keep mandatory activation disabled until the production fix and synthetic end-to-end checks pass.
