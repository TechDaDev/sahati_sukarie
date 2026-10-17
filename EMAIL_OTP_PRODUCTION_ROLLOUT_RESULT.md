# Email OTP Production Rollout Result

**Status: PASS WITH LIMITATIONS — activation passed; recovery and admin invitation remain**
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
- Current aggregate before owner OTP redemption: 5 accounts, 4 active patients, 3 legacy activation exemptions, 1 synthetic activation-test patient, 0 verified patient emails, 1 admin. After owner-confirmed OTP redemption, the synthetic patient signed in successfully through browser and mobile; no patient identifying information was returned.
- The three existing patients remain active and exempt. No existing patient password, patient ID, or medical record was changed. Synthetic browser and mobile sessions were logged out. No fabricated verification timestamps were added.
- One unconsumed admin invitation exists. Admin mailbox ownership and invitation were approved by the owner.

## Authentication and administration

- Local isolated PostgreSQL security suite: **19 passed, 0 failed, 0 skipped**. Covers activation OTP, expiry, invalid/replay/concurrent verification, cooldown and attempt limits, recovery, session revocation, admin authorization, and suspension/restore. Provider calls are mocked.
- One approved synthetic registration was created. Resend accepted the activation email (message ID `01a14b08-ef7c-7247-9d14-665f1f8a6553`). The owner requested a fresh OTP and confirmed the production page showed activation success. Browser login returned HTTP 200 and mobile login returned HTTP 201, both as PATIENT. Both sessions were logged out. No OTP, password, or token is recorded here. Production password recovery remains unverified.
- Administrator invitation acceptance, first password setup, authenticated admin login, and administrator authorization remain unverified pending owner redemption.
- Public `/api/v1/config` confirms `EMAIL_OTP_ENABLED=true`, `EMAIL_PASSWORD_RECOVERY_ENABLED=true`, and `EMAIL_ACTIVATION_REQUIRED=true`. Synthetic activation and browser/mobile sign-in passed. Keep activation enabled.
- Root cause of the resend control being disabled: `/verify-email` was statically cached for a year. Its HTML omitted CSP nonces from Next.js scripts, blocking React hydration. The dynamic-rendering fix is deployed; production HTML is no-cache and all scripts carry a matching nonce.

## Build and deployment

- `npm run typecheck`: passed.
- `APP_URL=https://sahatisukarie.up.railway.app npm run build`: passed.
- `npm run test:security`: 19 passed, 0 failed, 0 skipped.
- `npm run test:browser`: 1 passed, 0 failed, 0 skipped. Includes CSP nonce and resend-button interaction regression checks against a local production build.
- `git diff --check`: passed; secret-pattern scan clean.
- Application commit: `eead9fca14417074e1224001ef0536c66ac9ab30` (`fix(auth): hydrate email verification form under CSP`), pushed to `main`.
- Fix deployment `89ce5d41-02ee-4a73-ae6b-e8cba5e10899`: **SUCCESS**. Activation-enabled config deployment `890e5aec-01d1-4008-87cf-e6d045814c3a`: **SUCCESS**.
- Current public checks: `/api/health` and `/verify-email` return 200. `/api/admin/users` and `/api/admin/security-events` return 401 unauthenticated.
- Public checks prove route availability and unauthenticated access response. Authenticated synthetic PATIENT checks returned 403 for `/api/admin/users` and `/api/admin/security-events`. Activation and browser/mobile sign-in passed. Production password recovery and administrator invitation redemption remain unverified.

## Owner follow-up

1. Production password recovery remains unverified.
2. Administrator invitation redemption and first admin login remain separate owner workflows.
