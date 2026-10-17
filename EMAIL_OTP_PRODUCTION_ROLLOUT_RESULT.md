# Email OTP Production Rollout Result

**Status: PASS WITH LIMITATIONS — activation E2E pending**
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
- Current aggregate: 5 accounts, 4 active patients, 3 legacy activation exemptions, 1 synthetic activation-test patient, 0 verified patient emails, 1 admin. The synthetic patient remains unverified with activation required; no patient identifying information was returned.
- The three existing patients remain active and exempt. No password, session, patient ID, or medical record was changed. No fabricated verification timestamps were added.
- One unconsumed admin invitation exists. Admin mailbox ownership and invitation were approved by the owner.

## Authentication and administration

- Local isolated PostgreSQL security suite: **19 passed, 0 failed, 0 skipped**. Covers activation OTP, expiry, invalid/replay/concurrent verification, cooldown and attempt limits, recovery, session revocation, admin authorization, and suspension/restore. Provider calls are mocked.
- One approved synthetic registration was created for live activation testing. Resend accepted its activation email (message ID `01a14b08-ef7c-7247-9d14-665f1f8a6553`); inbox delivery is not independently available through the send-only key. Production still shows the synthetic patient unverified. Its latest challenge is expired, unconsumed, and has zero verification attempts. No OTP was retrieved or included in this report. Browser/mobile login after activation and production password recovery remain unverified.
- Admin invitation endpoint is public for setup; invitation acceptance, first password setup, authenticated admin login, and admin permissions remain unverified pending owner redemption.
- Current production flags: `EMAIL_OTP_ENABLED=true`, `EMAIL_PASSWORD_RECOVERY_ENABLED=true`, `EMAIL_ACTIVATION_REQUIRED=false`. Mandatory activation was briefly enabled for two canary windows, then rolled back because production verification remained incomplete. Keep it disabled until live activation and post-activation checks pass.
- Root cause of the resend control being disabled: `/verify-email` was statically cached for a year. Its HTML omitted the CSP nonce from Next.js scripts, blocking React hydration. Other auth pages were dynamic and had valid script nonces. The source fix is local and awaits deployment.

## Build and deployment

- `npm run typecheck`: passed.
- `APP_URL=https://sahatisukarie.up.railway.app npm run build`: passed.
- `npm run test:security`: 19 passed, 0 failed, 0 skipped.
- `npm run test:browser`: 1 passed, 0 failed, 0 skipped. Includes CSP nonce and resend-button interaction regression checks against a local production build.
- `git diff --check`: passed; secret-pattern scan clean.
- Application commit: `b930091c6e26fd19de1120d32710c0fe8e9344de` (`fix(auth): hydrate password recovery form under CSP`).
- Activation canary deployments `9fa4ec41-e91e-4149-b37b-7ba7f114e513` and `13dfe7ee-98c7-4e4d-9181-55313d78e839`: **SUCCESS**. Final rollback deployment `f4a06cfc-622d-4b76-9cfd-0696b3b78bf3`: **SUCCESS**, with mandatory activation disabled.
- Current public checks: `/api/health` and `/verify-email` return 200. `/api/admin/users` and `/api/admin/security-events` return 401 unauthenticated.
- Public checks prove route availability and access control response only. They do not prove authenticated production OTP, reset, or administrator workflows.

## Owner follow-up

1. Deploy the `/verify-email` dynamic-rendering fix and confirm script nonces and resend interaction in production.
2. Complete a fresh OTP redemption for the synthetic test account, then verify browser and mobile sign-in. The prior challenge expired unused.
3. Keep `EMAIL_ACTIVATION_REQUIRED=false` until live verification and post-verification security checks pass; then enable it under the authorization already provided.
4. Administrator invitation redemption and first admin login remain separate owner workflows.
