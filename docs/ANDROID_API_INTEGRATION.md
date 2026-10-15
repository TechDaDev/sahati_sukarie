# Android API integration guide

API base URL: `https://sahatisukarie.up.railway.app/api/v1`

Version: `v1`

OpenAPI: `https://sahatisukarie.up.railway.app/api/openapi.json`

Use HTTPS. All protected operations are patient-only and derive patient ownership from the bearer token. Do not send patient IDs to select another account.

## Authentication

1. `POST /auth/login` with `{ "email": "patient@example.test", "password": "...", "deviceLabel": "Pixel" }`.
2. Store `accessToken` and `refreshToken` in Android Keystore-backed encrypted storage. Never store either in logs, analytics, URLs, screenshots, or ordinary preferences.
3. Send `Authorization: Bearer <accessToken>` on protected requests. Access tokens expire after 15 minutes.
4. When access expires, call `POST /auth/refresh` with `{ "refreshToken": "..." }` and a new UUID in `X-Refresh-Request-ID`. Persist both returned tokens atomically before retrying the original request.
5. Allow only one refresh request at a time. A repeated request ID against a rotated token returns `409 REFRESH_ALREADY_ROTATED`; it does not revoke the session. A reused old refresh token with another request ID triggers replay detection and revokes that device session. If the refresh response is lost, sign in again.
6. `POST /auth/logout` revokes current device. `POST /auth/logout-all` revokes all mobile and browser sessions. `GET /auth/sessions` and `DELETE /auth/sessions/{id}` manage devices.
7. Password change and recovery revoke all device sessions. Sign in again afterward.

Refresh expiry is fixed at 30 days from login; rotation does not extend it. Use device time only for UX. Server expiry is authoritative.

## Error contract

JSON success: `{ "ok": true, "data": ... }`. JSON error: `{ "ok": false, "error": "Arabic message", "code": "STABLE_CODE", "fields": {} }`. Treat `code` as stable and `error` as display text. Common statuses: 400 invalid request, 401 expired/invalid authentication, 403 role or account restriction, 404 missing/foreign record, 409 conflict/replayed refresh, 413 body too large, 429 rate limit, 500 server error, 503 unavailable. Responses use `Cache-Control: no-store`.

## Patient operations

| Screen | Operations |
|---|---|
| Dashboard | `GET /dashboard` |
| Profile | `GET/PATCH /profile`; `GET/PUT /profile/diabetes`; `GET/PUT /profile/conditions`; `PUT /profile/reproductive`; `PUT /profile/additional` |
| Glucose | `GET/POST /glucose`; `PATCH/DELETE /glucose/{id}` |
| Medications | `GET/POST /medications`; `PATCH/DELETE /medications/{id}`; `GET/POST /administrations`; `DELETE /administrations/{id}` |
| Daily records | `GET/POST /meals`, `/activities`, `/sleep`, `/symptoms`, `/factors`; `DELETE /{collection}/{id}` |
| Reports | `GET /reports/summary`; `GET /reports/pdf` returns binary `application/pdf` attachment |
| Settings | `PATCH /settings/contact`; `GET /config` is public |

Use the legacy website's Zod schemas as the source of request field names and enum values until OpenAPI schemas are generated directly from those validators. Unknown fields and invalid values are rejected by shared handlers. The API does not calculate medication doses or make diagnostic claims.

## Dates, units, and pagination

Send calendar dates as `YYYY-MM-DD`, timestamps as ISO 8601 with `Z` or explicit offset. Dashboard day boundaries use each profile's timezone; the default is `Asia/Baghdad`. Date-filtered existing list endpoints accept `from`, `to`, and where supported `tz`. Glucose values carry `MG_DL` or `MMOL_L`; the dashboard trend converts standardized mg/dL using the website's `18.0182` factor.

Record list endpoints support SQL keyset pagination. Omit `limit` for 50 items; maximum is 100. Pass returned opaque `nextCursor` as `cursor`, and keep the same filters and `sort` across pages. `sort` accepts `asc` or `desc` and defaults to `desc`. Page data is `{ "items": [], "pagination": { "limit": 50, "hasMore": true, "nextCursor": "...", "sort": "desc" } }`. Timestamp/date plus UUID tie-break ordering prevents duplicates when records share a timestamp. `from` and `to` filter calendar dates; `tz` accepts an IANA timezone and defaults to the profile timezone. Glucose also accepts `context`; medication list accepts `status`. Cursor is invalid if sort changes. Reports retain their own bounded date-range rules.

## Empty states, offline use, and Android structure

Empty collections are returned as empty arrays where the existing endpoint does so. Show the website's existing empty-state message and do not infer that no event occurred when no record exists. Read data may be cached locally with clear freshness indicators and encrypted storage. Do not queue medical writes offline for automatic replay: endpoints do not yet define idempotency keys, and duplicate clinical records are possible. Require a fresh authenticated response before reporting a write as saved.

Recommended future stack: Kotlin, Jetpack Compose, Retrofit, OkHttp, Kotlin Coroutines, ViewModel, Room only where justified, and Android Keystore-backed credential protection. Add a single-flight refresh interceptor, redact authorization headers in every logger, and keep refresh tokens out of WorkManager input and crash reports.

No Android source or Android Studio project is included in this phase.
