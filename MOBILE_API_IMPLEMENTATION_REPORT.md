# Mobile API implementation report

Date: 2026-10-15

Repository: `TechDaDev/sahati_sukarie`

Branch: `main`

## Scope examined

Reviewed patient navigation and dashboard, profile, glucose, medication, daily log, report, settings, urgent-help, API route, database, service, auth, validation, and UI token sources. Feature mapping and endpoint classifications are in `docs/MOBILE_API_GAP_ANALYSIS.md`.

## Implementation

- Added versioned `/api/v1/*` route dispatch. Existing patient route handlers continue to perform writes and owned-record checks under a validated async-local mobile session.
- Added patient login and registration, 15-minute opaque access tokens, fixed 30-day rotating refresh tokens, device list/revoke, logout, logout-all, password change, recovery delegation, `me`, and public config.
- Stores only SHA-256 access and refresh token hashes. Refresh rotation locks token/session rows, keeps rotation transactional, and revokes device family after replay. Same request ID retry returns a conflict without family revocation.
- Added patient-only bearer validation on each request, mixed cookie/bearer rejection, query-token rejection, DB-backed rate limits, no-store responses, account-status trigger, and revocation after password recovery/change.
- Added additive tracked migration `db/migrations/0002_mobile_sessions.sql`. It preserves existing rows and does not touch production data.
- Extracted `getPatientDashboard` and updated website dashboard and mobile API to share the same dashboard calculations and timezone behavior.
- Added SQL keyset pagination for v1 glucose, medications, administrations, activities, factors, labs, meals, sleep, symptoms, and weight lists. Default page size 50, maximum 100, stable date/timestamp plus UUID ordering.
- Added `/api/openapi.json`, a mobile integration guide, an Android UI reference, and the API gap analysis.
- Added isolated synthetic PostgreSQL mobile authentication, ownership, pagination, role, replay, expiry, logout, password-change, and suspension tests.

## APIs

Existing browser endpoints remain available with their existing response shapes. V1 reuses their create/update/delete handlers and validation. Mobile list endpoints use bounded keyset pagination. `/api/v1/dashboard` returns the shared dashboard data and safe profile summary. `/api/v1/reports/pdf` preserves the existing private binary PDF response.

OpenAPI currently documents all v1 paths and methods, bearer auth, role extension, pagination, response/error envelope, and binary PDF. Request body schemas still use generic objects rather than generated per-route Zod schemas. This is a documentation precision gap.

## Local validation

Database: isolated PostgreSQL 16 cluster at `127.0.0.1:55432`, database named `sahati_security_test_mobile`; migrations applied there only. Synthetic records are removed by tests.

- `npm ci`: passed. npm reported 11 total development-inclusive advisories; `npm audit --omit=dev` reported 0 production dependency vulnerabilities.
- `npm run typecheck`: passed after implementation changes.
- `npm run build`: passed with a one-command `APP_URL=https://sahatisukarie.up.railway.app` override. The local `.env.local` `APP_URL` fails HTTPS URL validation; it was not changed.
- `npm run test:security`: passed 13, failed 0, skipped 0 with `SECURITY_TEST_CHROMIUM_PATH=/usr/bin/google-chrome`. Includes existing security tests and new mobile/OpenAPI coverage.
- Migration repeatability: passed; second `db:migrate` reported no new migrations.
- Local HTTP smoke against production build and synthetic DB: health, config, OpenAPI, browser login, invalid bearer, unauthenticated medical route, and mixed-auth rejection returned expected statuses. Production API and authenticated patient flows are not yet verified; no production credentials or patient records were used.

## Remaining limitations

1. Full CRUD and report/PDF flows for every resource need more API-level integration tests, though v1 delegates writes to the tested browser handlers and existing ownership policy.
2. OpenAPI body schemas should be generated from Zod or fully specified per route.
3. PDF renderer integration remains skipped without a local Chromium executable.
4. Railway deployment, production smoke checks, Git push, and deployment metadata are pending.
5. Production positive mobile authentication is not verified because no controlled production test account was provided. Production patient records were not accessed.

## Final status

**PASS WITH LIMITATIONS** after successful deployment and safe public smoke checks; authenticated production behavior remains not verified.
