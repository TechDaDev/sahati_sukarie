# Email OTP Production Rollout Result

**Status: PASS WITH LIMITATIONS**
**Updated:** 2026-10-17

## Resend

- Replacement `RESEND_API_KEY` is present in the Railway runtime. Owner confirmed it replaced the exposed key. Secret value was not read or printed.
- Runtime `RESEND_FROM_EMAIL` matches `noreply@sahati.techda.dev`; owner confirms sender domain verification.
- One approved harmless test email to `osamaismail80@gmail.com` was accepted by Resend: message ID `01a14a77-e270-75db-ba7f-de969e307f31`.
- Resend returned HTTP 200. Delivery is **not confirmed**: send-only key cannot read message status. Owner inbox receipt remains unconfirmed.
- Admin invitation to `admin@sahati.iq` was accepted by Resend: message ID `01a14a8c-ddac-7289-bd72-eb7c0ea9d13c`. Delivery and redemption are unconfirmed.

## Database and existing accounts

- Production migration `0003_email_otp.sql`: applied by Railway pre-deploy migration; migrations `0001`-`0003` are present.
- Encrypted pre-migration backup restored successfully in isolated PostgreSQL 18. Artifact: `/home/zeus3000/.local/state/sahati-prod-backups/sahati-production-20261017T153157Z.dump.gpg`; SHA-256 `ab6a478087e421af3cbda5325b1eacc5b35f0dda9770d71995ffa4af1666afe7`.
- Current aggregate: 4 accounts, 3 patients, 3 active patients, 3 legacy activation exemptions, 0 historically verified patient emails, 0 pending, 0 suspended, 0 disabled, 1 admin. Admin requires password change. No patient rows or identifying information were returned.
- The three existing patients remain active and exempt. No password, session, patient ID, or medical record was changed. No fabricated verification timestamps were added.
- One unconsumed admin invitation exists. Admin mailbox ownership and invitation were approved by the owner.

## Authentication and administration

- Local isolated PostgreSQL security suite: **19 passed, 0 failed, 0 skipped**. Covers activation OTP, expiry, invalid/replay/concurrent verification, cooldown and attempt limits, recovery, session revocation, admin authorization, and suspension/restore. Provider calls are mocked.
- Production registration OTP redemption and password recovery end-to-end flows remain unverified. No production synthetic patient was created and no OTP was retrieved.
- Admin invitation endpoint is public for setup; invitation acceptance, first password setup, authenticated admin login, and admin permissions remain unverified pending owner redemption.
- Production runtime flags `EMAIL_OTP_ENABLED`, `EMAIL_PASSWORD_RECOVERY_ENABLED`, and `EMAIL_ACTIVATION_REQUIRED` are all false/unset. Mandatory activation remains disabled pending end-to-end verification and separate explicit owner authorization.

## Build and deployment

- `npm run typecheck`: passed.
- `APP_URL=https://sahatisukarie.up.railway.app npm run build`: passed.
- `npm run test:security`: 19 passed, 0 failed, 0 skipped.
- `git diff --check`: passed; secret-pattern scan clean.
- Application commit: `c2c91d1cea5fbae10023c37f8a4e91d9486c96eb` (`fix(auth): allow secure admin invitation setup`).
- Railway deployment `0adb4faa-e517-4c69-8995-a9cd8e49a5c8`: **SUCCESS**, latest live commit `c2c91d1`.
- Current public checks: `/`, `/login`, `/register`, `/forgot-password`, `/admin/login`, `/admin/accept-invitation`, `/api/health`, and `/api/openapi.json` return 200. `/admin` redirects to login (307); unauthenticated admin APIs return 401.
- Public checks prove route availability and access control response only. They do not prove authenticated production OTP, reset, or administrator workflows.

## Owner follow-up

1. Confirm receipt of the harmless test message and administrator invitation in owner-controlled inboxes.
2. Redeem the administrator invitation and verify first login and role-limited dashboard access.
3. Authorize and run approved synthetic-account production OTP and password-recovery end-to-end checks. Keep mandatory activation disabled until those checks pass.
4. Provide separate explicit authorization before setting `EMAIL_ACTIVATION_REQUIRED=true`.
