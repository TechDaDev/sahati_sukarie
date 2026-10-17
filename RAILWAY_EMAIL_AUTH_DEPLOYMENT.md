# Railway Email Authentication Deployment

**Updated:** 2026-10-17

## Production configuration

- Railway project: `sahati-wa-sukari`; environment: `production`; app service: `sahati_sukarie`.
- Runtime contains `RESEND_API_KEY`; its value was never printed. Owner confirms this replacement was created after revoking the exposed key.
- Runtime sender matches `noreply@sahati.techda.dev`. Owner confirms sender domain verification.
- Public `/api/v1/config` confirms `EMAIL_OTP_ENABLED=true`, `EMAIL_PASSWORD_RECOVERY_ENABLED=true`, and `EMAIL_ACTIVATION_REQUIRED=true`. Synthetic activation completed; browser and mobile sign-in passed, and test sessions were logged out.
- One authorized harmless test email was accepted by Resend (HTTP 200), message ID `01a14a77-e270-75db-ba7f-de969e307f31`. The send-only key cannot read delivery status; inbox delivery remains unconfirmed.
- Admin invitation to owner-approved `admin@sahati.iq` was accepted by Resend, message ID `01a14a8c-ddac-7289-bd72-eb7c0ea9d13c`. Delivery and redemption remain unconfirmed.

## Migration and data safety

- Railway pre-deploy migration `npm run db:migrate` applied `0003_email_otp.sql`; migration history includes `0001`-`0003`.
- A pre-migration encrypted PostgreSQL dump was restored successfully in isolated PostgreSQL 18. Path: `/home/zeus3000/.local/state/sahati-prod-backups/sahati-production-20261017T153157Z.dump.gpg`; SHA-256 `ab6a478087e421af3cbda5325b1eacc5b35f0dda9770d71995ffa4af1666afe7`.
- Earlier safe aggregate snapshot showed 5 accounts, 4 active patients, and 3 legacy exemptions; at that snapshot the synthetic test patient was awaiting verification. The owner later confirmed activation in production, and browser/mobile patient login both passed. No patient identifiers were queried or printed.
- Existing patient passwords, sessions, statuses, and medical records were preserved.

## Deployment and route checks

- Latest application commit: `eead9fca14417074e1224001ef0536c66ac9ab30` (`fix(auth): hydrate email verification form under CSP`).
- Fix deployment `89ce5d41-02ee-4a73-ae6b-e8cba5e10899` and activation-enabled config deployment `890e5aec-01d1-4008-87cf-e6d045814c3a`: `SUCCESS`.
- Current checks: `/api/health` and `/verify-email`: HTTP 200; `/api/admin/users` and `/api/admin/security-events`: HTTP 401 unauthenticated.
- Owner completed live activation in the page. Browser and mobile patient login passed; patient sessions received 403 on administrative APIs and were logged out. Password recovery and administrator invitation redemption remain unverified.

## Verification limits

`npm run typecheck`, production build, isolated PostgreSQL security suite (19 passed, 0 failed, 0 skipped), and browser suite (1 passed) passed locally. The browser suite verifies the dynamic CSP nonce and resend interaction. Production `/verify-email` now renders dynamically with matching CSP nonces, and Chrome confirmed input and resend interaction. One synthetic activation email was accepted; the owner requested a fresh code and the production page confirmed activation. Browser and mobile login passed and sessions were revoked. Production password recovery and administrator invitation redemption remain unverified. The three legacy patient accounts and patient records were not modified.
