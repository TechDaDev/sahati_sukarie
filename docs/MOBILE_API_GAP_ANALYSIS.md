# Mobile API gap analysis

Inventory date: 2026-10-15. This audit maps the current patient website to a native Android client. It creates no Android project.

## Patient feature inventory

| Screen | Displayed information and data source | Existing browser API | Mobile status | Auth and ownership |
|---|---|---|---|---|
| Dashboard | Latest glucose, today counts, last administration, activities, meals, sleep, symptoms, 14-day glucose trend, latest weight and HbA1c, profile completion, active medicines, descriptive event comparisons. Existing dashboard queries patient services and record tables. | No dashboard JSON endpoint; server page queried DB. | REQUIRES ADAPTATION: `/api/v1/dashboard` now shares `getPatientDashboard` with website. | Patient bearer token; profile ID derived server-side. |
| Profile | Personal contact and health profile, diabetes, conditions, reproductive history, additional data. `patient.ts` and profile routes. | `GET/PATCH /api/profile`; diabetes `GET/PUT`; conditions `GET/PUT`; reproductive `PUT`; additional `PUT`. | REQUIRES ADAPTATION: v1 dispatch reuses existing handlers. Reproductive read remains available from profile/dashboard responses; no dedicated GET route. | Patient only; profile lookup by session user. Sensitive national ID fields excluded from profile summary. |
| Glucose | Timestamp, value/unit, context, source, notes, trend, create/edit/delete. `records.ts`, glucose validation and patient route handlers. | `GET/POST /api/glucose`; `PATCH/DELETE /api/glucose/{id}`. | REQUIRES ADAPTATION: writes reuse handlers; v1 list applies context/date filters and SQL keyset pagination. | Patient only; handler scopes writes and paged reads to own profile. |
| Medications | Medicine list, prescribed dose and schedule, status, administrations. | `GET/POST /api/medications`; `PATCH/DELETE /api/medications/{id}`; `GET/POST /api/administrations`; `DELETE /api/administrations/{id}`. | REQUIRES ADAPTATION: writes reuse existing handlers; v1 lists use SQL keyset pagination. | Patient only; ownership checked by existing handlers and patient-filtered list queries. |
| Daily log | Meals, activity, sleep, symptoms, and daily factors. | Collection `GET/POST` and owned-record `DELETE` under `/api/{meals,activities,sleep,symptoms,factors}`. | REQUIRES ADAPTATION: writes reuse existing handlers; v1 lists use SQL keyset pagination. | Patient only; ownership checked by existing handlers and patient-filtered list queries. |
| Reports | Range summary and downloadable Arabic RTL PDF with disclaimers. | `GET /api/reports/summary`; `GET /api/reports/pdf`. | REQUIRES ADAPTATION: `/api/v1/reports/summary` and `/api/v1/reports/pdf` dispatch to existing handlers; binary PDF response preserved. | Patient bearer; existing report range and ownership checks. |
| Settings | Contact updates and account preferences. | `PATCH /api/settings/contact`. | REQUIRES ADAPTATION: v1 contact route reused. No dedicated mobile preferences endpoint exists. | Patient only. |
| Navigation and urgent help | Patient shell has dashboard, profile, glucose, medications, daily log, reports, settings, and urgent help. | Urgent-help page is static and needs no private API. | EXISTS / OUT OF SCOPE: UI references documented separately. |

## Authentication and platform gaps

| Capability | Status | Notes |
|---|---|---|
| Versioned namespace | EXISTS | Catch-all dispatcher serves supported `/api/v1/*` routes. |
| Opaque access and rotating refresh | EXISTS, local verification pending | 15-minute access and fixed 30-day refresh expiry; only SHA-256 token hashes stored. Refresh requires `X-Refresh-Request-ID` UUID. |
| Device sessions, logout, replay handling | EXISTS, local verification pending | Session list/revoke, current logout, logout-all, row-locked one-time rotation, and replay family revocation. Same-request retry returns 409 without family revocation. |
| Patient-only authorization | EXISTS, local verification pending | Bearer authentication checks active account and PATIENT role on every request; DB trigger revokes sessions after status changes. |
| Cookie/CSRF compatibility | EXISTS by design | Existing browser handlers run under an async request-local mobile session. Browser requests still use existing cookie and CSRF path. |
| No-store | EXISTS | Mobile JSON and PDF responses set `Cache-Control: no-store`; query-string tokens are rejected. |
| Registration/recovery/password | EXISTS, local verification pending | Registration reuses existing Zod schema and protected national ID storage. Recovery handlers reuse the existing manually verified admin workflow. Password changes and recovery revoke mobile families. |
| OpenAPI | EXISTS, schema coverage incomplete | `/api/openapi.json` lists mobile operations, bearer auth, pagination, responses, and binary PDF. Request bodies currently use generic object schemas; generate them from Zod for full contract precision. |
| Cursor pagination | EXISTS | Mobile v1 record lists use SQL keyset pagination with stable timestamp/date + UUID ordering; default 50, maximum 100. Existing browser response contracts remain unpaged. |
| Isolated integration test suite | REQUIRES ADAPTATION | Isolated PostgreSQL 16 synthetic tests cover registration, login, token hashes/rotation/replay, concurrency, expiry, logout, ownership, role denial, cookie fallback, and suspension. Broader CRUD/PDF/settings integration cases remain. |
| Rate limiting | REQUIRES ADAPTATION | Login, refresh, registration, and password change have DB-backed limits. Recovery reuses existing controls. Per-list read throttling is not implemented. |
| Production API verification | NOT VERIFIED | No mobile credentials were used. Production patient data was not read or modified. |

## Existing and added route inventory

The v1 dispatcher currently exposes auth register/login/refresh/me/logout/logout-all/change-password/sessions, forgot-password/redeem-recovery, config, dashboard, profile, diabetes profile, conditions, reproductive update, additional profile update, glucose, medications, administrations, meals, activities, sleep, symptoms, factors, weight, labs, reports, PDF, and contact settings. Supported methods mirror existing browser handlers. See `/api/openapi.json` for the current route list.

## Source areas inspected

- `src/components/patient-shell.tsx`
- `src/app/(patient)/dashboard/page.tsx`
- `src/app/(patient)/profile/`, `glucose/`, `medications/`, `daily-log/`, `reports/`, and `settings/`
- `src/app/api/`
- `src/server/auth/session.ts`, `src/server/http.ts`
- `src/server/db/schema.ts`, `db/migrations/`
- `src/server/services/{auth-service,dashboard,patient,records,recovery,reports}.ts`
- `src/server/validation/schemas.ts`
