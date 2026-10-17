# Email Activation Final Verification

**Status: BLOCKED — fix awaits production deployment and activation retest**
**Updated:** 2026-10-17

## Production configuration

- Railway project: `sahati-wa-sukari`; production app URL: `https://sahatisukarie.up.railway.app`.
- Runtime confirmed `EMAIL_OTP_ENABLED=true`, `EMAIL_PASSWORD_RECOVERY_ENABLED=true`, and `EMAIL_ACTIVATION_REQUIRED=false` after rollback. `APP_URL` matches production; Resend key is present but its value was not read.
- Activation canary deployments `9fa4ec41-e91e-4149-b37b-7ba7f114e513` and `13dfe7ee-98c7-4e4d-9181-55313d78e839` succeeded. Final rollback deployment `f4a06cfc-622d-4b76-9cfd-0696b3b78bf3` succeeded with mandatory activation disabled. Current app commit remains `b930091c6e26fd19de1120d32710c0fe8e9344de`.
- The source fix has passed locally and awaits commit, push, and deployment.

## Live synthetic account check

- One approved synthetic patient registration was created. Resend accepted the activation email (message ID `01a14b08-ef7c-7247-9d14-665f1f8a6553`). Provider acceptance does not establish inbox delivery.
- After the owner reported verification, a read-only production check still showed the account unverified. The newest activation challenge was created at `2026-10-17 18:03:59 UTC`, expired at `18:08:59 UTC`, remains unconsumed, and has zero attempts. No replacement challenge had been issued at the time of the check.
- The owner reported the resend button stayed inactive. Browser reproduction confirmed the email value could be entered while resend remained disabled. Production `/verify-email` HTML was cached for one year (`s-maxage=31536000`, cache hit) and omitted script CSP nonces; other auth pages had matching nonces. The `script-src ... 'strict-dynamic'` policy therefore blocked hydration and left React state empty.
- No OTP, password, session token, or account identifier is recorded here. The synthetic patient remains test-only. The three pre-existing patient accounts remain active and exempt; no patient records were changed.
- Because the database did not confirm activation, browser/mobile sign-in after activation and the authenticated patient workflow were not tested. Mandatory activation was rolled back rather than left enabled without live proof.

## Verification results

- `npm run typecheck`: PASS.
- `npm run build` with production `APP_URL`: PASS.
- `npm run test:security`: PASS, 19 passed, 0 failed, 0 skipped. Resend is mocked in this suite.
- `npm run test:browser`: PASS, 1 passed, 0 failed, 0 skipped. Regression checks nonce-bearing verification scripts, input enabling resend, and the resend handler on an isolated local build.
- Public `/api/health`: HTTP 200.
- Public `/verify-email`: HTTP 200.
- Unauthenticated `/api/admin/users` and `/api/admin/security-events`: HTTP 401.
- Live OTP redemption, post-activation browser/mobile login, production password recovery, and authenticated admin authorization: NOT VERIFIED.
- Local code changes: `src/app/verify-email/page.tsx` forces dynamic rendering; browser regression coverage verifies the fix. Security tests also cover pending mobile login and Resend timeout/rejection fail-closed behavior. The changes await commit and deployment; production does not yet contain the fix.

## Remaining action

Deploy the fix, temporarily enable mandatory activation for the synthetic E2E window, then request a fresh OTP from the verification page and submit it there. Confirm success against production before leaving `EMAIL_ACTIVATION_REQUIRED` enabled; then run browser and mobile login checks and revoke test sessions. Do not send OTPs in chat or retrieve them from logs or the database.
