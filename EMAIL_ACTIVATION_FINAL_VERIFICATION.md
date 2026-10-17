# Email Activation Final Verification

**Status: PASS — synthetic activation verified in production**
**Updated:** 2026-10-17

## Production configuration

- Railway project: `sahati-wa-sukari`; production app URL: `https://sahatisukarie.up.railway.app`.
- Public mobile config endpoint confirms `EMAIL_OTP_ENABLED=true`, `EMAIL_PASSWORD_RECOVERY_ENABLED=true`, and `EMAIL_ACTIVATION_REQUIRED=true`. Railway variable values are redacted for this connector; no secret was read. `APP_URL` matches production.
- Fix commit `eead9fca14417074e1224001ef0536c66ac9ab30` is pushed to `main`. Fix deployment `89ce5d41-02ee-4a73-ae6b-e8cba5e10899` and activation-enabled configuration deployment `890e5aec-01d1-4008-87cf-e6d045814c3a` both reached `SUCCESS`.

## Live synthetic account check

- One approved synthetic patient registration was created. Resend accepted the activation email (message ID `01a14b08-ef7c-7247-9d14-665f1f8a6553`). Provider acceptance does not establish inbox delivery.
- The original activation challenge expired unused. The owner requested a fresh OTP in the production page and reported successful verification. The page showed “تم تفعيل الحساب”; browser login returned HTTP 200 with PATIENT role, and mobile login returned HTTP 201 with PATIENT role. Both test sessions were explicitly logged out. These successful checks confirm the synthetic account passed activation and sign-in gates; no OTP or token was read from logs or database.
- The owner reported the resend button stayed inactive. Browser reproduction confirmed the email value could be entered while resend remained disabled. Production `/verify-email` HTML had been cached for a year and omitted script CSP nonces; other auth pages had matching nonces. This blocked React hydration. The page now renders dynamically. Production HTML returns `private, no-cache, no-store`, and all 12 scripts carry a nonce matching the response CSP.
- Real Chrome interaction after deployment: typing into the email field enabled resend. Clicking it with a non-deliverable `.invalid` synthetic address showed the expected generic response; no live activation email was sent during this UI check.
- No OTP, password, session token, or account identifier is recorded here. The synthetic patient remains test-only. The three pre-existing patient accounts remain active and exempt; no patient records were changed.
- Mandatory activation remains enabled after successful live verification. Direct unauthenticated checks returned 401 for admin APIs; authenticated synthetic PATIENT requests returned 403. Health and verification routes returned 200. Three legacy patient accounts and patient data were not modified.

## Verification results

- `npm run typecheck`: PASS.
- `npm run build` with production `APP_URL`: PASS.
- `npm run test:security`: PASS, 19 passed, 0 failed, 0 skipped. Resend is mocked in this suite.
- `npm run test:browser`: PASS, 1 passed, 0 failed, 0 skipped. Regression checks nonce-bearing verification scripts, input enabling resend, and the resend handler on an isolated local build.
- Public `/api/health`: HTTP 200.
- Public `/verify-email`: HTTP 200.
- Unauthenticated `/api/admin/users` and `/api/admin/security-events`: HTTP 401.
- Live activation: PASS (owner-confirmed page success). Browser and mobile patient login: PASS; sessions logged out. Production password recovery and authenticated administrator authorization: NOT VERIFIED.
- Local code changes: `src/app/verify-email/page.tsx` forces dynamic rendering; browser regression coverage verifies the fix. Security tests also cover pending mobile login and Resend timeout/rejection fail-closed behavior. The fix is committed, pushed, and deployed in production.

## Remaining action

No activation follow-up remains. Production password recovery and administrator invitation redemption are separate owner workflows. Do not send OTPs in chat or retrieve them from logs or the database.
