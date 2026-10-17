# Platform Administration

**Updated:** 2026-10-17

## Authorization model

Platform administration uses existing `ADMIN` role and server-side authorization. Patient medical APIs require `PATIENT`. Admin dashboards expose account and authentication operations without medical records. User search is paginated; suspension/restoration revokes sessions and writes audit events. Sensitive status changes require a recent browser session and completed initial password change.

Delivery views expose purpose, status, safe provider error code, provider message ID, and timestamp. They omit recipient addresses and OTP values. Security event views expose selected auth/admin metadata. Admin APIs reject unauthenticated requests with HTTP 401.

## Secure first-admin invitation

`scripts/create-admin.ts` now provisions only `admin@sahati.iq` and creates a random unusable initial password hash. It generates a cryptographically random, short-lived, single-use invitation; stores only the token hash; emails the HTTPS setup link; and does not log token/password. Acceptance atomically consumes the invitation, enforces a strong password, revokes prior sessions, and audits the event. There is no public admin signup route.

Production aggregate after provisioning: one ADMIN, one active invitation, and admin must change password. The invitation email was accepted by Resend (message ID `01a14a8c-ddac-7289-bd72-eb7c0ea9d13c`); delivery and redemption are not confirmed. Owner must redeem invitation to verify first login and dashboard access.

## Production checks and limits

- Latest deployment: `0adb4faa-e517-4c69-8995-a9cd8e49a5c8` (`SUCCESS`), commit `c2c91d1`.
- `/admin/accept-invitation` and `/admin/login` return HTTP 200; `/admin` redirects to login (307); unauthenticated admin APIs return 401.
- Isolated security suite passed 19 tests, including admin authorization and suspend/restore. No production authenticated admin session was tested.
- Existing three patient accounts remain active. No patient passwords or medical records were changed or accessed.
- Admin email-delivery metadata, failed OTP monitoring, audit views, and role restrictions still need verification after invitation redemption. Do not treat public route checks as authenticated admin verification.
