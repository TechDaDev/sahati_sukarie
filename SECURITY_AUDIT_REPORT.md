# Security Audit Report — صحتي وسكري

**Assessment date:** 2026-10-14
**Audited base commit:** `61659b269f49a51846a29eb4ae1f0c4a819dce14`
**Remediation commit:** recorded after deployment below
**Scope:** Next.js app, API routes, server services, PostgreSQL schema/migrations, auth/session/recovery, report rendering, dependencies, and existing Railway production service.
**Method:** graph-guided source review, route inventory, dependency audit, isolated PostgreSQL concurrency tests, local Chromium rendering, local HTTP smoke checks, safe live Railway checks.

## Executive summary

The review found races in rate limiting, login lockout, and recovery-token redemption. It also found spoofable forwarding-header use, role and registration enumeration, unbounded JSON body reads, session-expiry mismatch, and Chromium running without its sandbox. Fixes were implemented and exercised in a synthetic local PostgreSQL database. Patient record queries use the authenticated patient profile as their SQL ownership filter; nested medication association checks use the same owner.

The app now requires strong production secrets, HTTPS `APP_URL`, and bounded session settings. API JSON reads have a 1 MiB cap and reject excess bodies with 413. A nonce-based CSP and HSTS are set. Chromium runs without `--no-sandbox`; Railway is configured to run the app as UID 1000. A health endpoint checks database reachability and refuses root execution in production.

Production data was not modified. Production deployment status and live verification are recorded in `RAILWAY_SECURITY_DEPLOYMENT_VERIFICATION.md`. Full dependency audit still reports 5 high and 6 moderate advisories in development/build tooling; production dependency audit reports zero. No major dependency upgrade was applied because available automated fixes require breaking Tailwind/drizzle-kit changes.

## Scope and method

The code graph was ready at 1,002 nodes and 3,298 edges. It identified `assertRateLimit`, `clientIp`, `getCurrentSession`, `authenticate`, `redeemRecoveryCode`, `parseBody`, and `renderHealthReportPdf` as principal review points. The route inventory below includes every exported API method found under `src/app/api/**/route.ts`.

The review used source inspection and local synthetic fixtures. It did not run brute force, load, fuzz, or data mutation tests against production. Git history was not exhaustively scanned for leaked secrets; no credential values were accessed or reported. Railway secret values were redacted by the connected service.

## Attack surface and route inventory

The table lists each route method separately. `Patient self` means the handler derives the profile from the authenticated session and scopes the query to that profile. `CSRF` applies to authenticated state-changing requests; public credential/recovery routes accept JSON and have no session-authenticated action. All API responses receive `Cache-Control: no-store` through Next configuration. JSON body size is capped at 1 MiB by `parseBody`.

| Method | Path | Authentication / role | Permission | CSRF | Rate limit | Input validation | Ownership boundary | Sensitive response |
|---|---|---|---|---|---|---|---|---|
| GET, POST | `/api/activities` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON; GET query handling | Patient self | Activity records |
| DELETE | `/api/activities/:id` | Session / PATIENT | Patient self | Yes | None explicit | Path ID; ownership query | Patient self | Delete status only |
| GET | `/api/admin/password-requests` | Session / ADMIN | Recovery workflow | No | None explicit | No body | Admin workflow only | Name, contact, email, national-ID last four, recovery state |
| GET | `/api/admin/password-requests/:id/audit` | Session / ADMIN | Recovery audit | No | None explicit | Path ID | Admin workflow only | Recovery audit metadata |
| POST | `/api/admin/password-requests/generate-code` | Session / ADMIN | Issue recovery code after verification | Yes | None explicit | Zod JSON | Request ID checked | One-time recovery code |
| POST | `/api/admin/password-requests/reject` | Session / ADMIN | Reject recovery request | Yes | None explicit | Zod JSON | Request ID checked | Status only |
| POST | `/api/admin/password-requests/verify` | Session / ADMIN | Verify recovery request | Yes | None explicit | Zod JSON | Request ID checked | Status only |
| GET | `/api/admin/users` | Session / ADMIN | Account administration | No | None explicit | No body | Admin account scope | Account metadata, no medical record payload identified |
| GET, POST | `/api/administrations` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON | Patient self; medication ownership checked | Medication administration history |
| DELETE | `/api/administrations/:id` | Session / PATIENT | Patient self | Yes | None explicit | Path ID; ownership query | Patient self | Delete status only |
| POST | `/api/auth/admin-login` | Public | Authenticate administrator | N/A | 15 per IP / 15 min | Zod JSON | N/A | Generic failure; own role on success |
| POST | `/api/auth/change-password` | Session / PATIENT or ADMIN | Change own password | Yes | None explicit | Zod JSON | Session user | Status only |
| POST | `/api/auth/login` | Public | Authenticate patient | N/A | 15 per IP / 15 min | Zod JSON | N/A | Generic failure; own role on success |
| POST | `/api/auth/logout` | Session cookie if present | Revoke current session | No token check; `SameSite=Lax` limits cross-site cookie sending | None explicit | No body | Current session only | Status only |
| POST | `/api/auth/register` | Public | Create patient account | N/A | 10 per IP / hour | Zod JSON | New account owns new profile | New account IDs and CSRF token |
| GET | `/api/auth/session` | Optional session | Read own session state | Safe method | None explicit | No body | Current session only | Own email, role, and password-change flag |
| GET, POST | `/api/factors` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON | Patient self | Daily factors |
| DELETE | `/api/factors/:id` | Session / PATIENT | Patient self | Yes | None explicit | Path ID; ownership query | Patient self | Delete status only |
| POST | `/api/forgot-password` | Public | Request manual recovery | N/A | 10 per IP / 15 min; 3 per email / day; 5 per IP / hour | Zod JSON | Email lookup; generic response | Generic response |
| GET, POST | `/api/glucose` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON; query filters reviewed | Patient self | Glucose readings |
| PATCH, DELETE | `/api/glucose/:id` | Session / PATIENT | Patient self | Yes | None explicit | PATCH Zod JSON; path ID for DELETE | Patient self | Updated reading or delete status |
| GET | `/api/health` | Public | Operational readiness only | Safe method | None explicit | No input | N/A | `ok` / `unavailable` only |
| GET, POST | `/api/labs` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON | Patient self | Lab results |
| DELETE | `/api/labs/:id` | Session / PATIENT | Patient self | Yes | None explicit | Path ID; ownership query | Patient self | Delete status only |
| GET, POST | `/api/meals` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON | Patient self | Meal records |
| DELETE | `/api/meals/:id` | Session / PATIENT | Patient self | Yes | None explicit | Path ID; ownership query | Patient self | Delete status only |
| GET, POST | `/api/medications` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON | Patient self | Medication list |
| PATCH, DELETE | `/api/medications/:id` | Session / PATIENT | Patient self | Yes | None explicit | PATCH Zod JSON; path ID for DELETE | Patient self; administration links owner-scoped | Medication data or delete status |
| GET | `/api/profile` | Session / PATIENT | Patient self | No | None explicit | No body | Patient self | Profile and identity data |
| PATCH | `/api/profile` | Session / PATIENT | Patient self | Yes | None explicit | Zod JSON | Patient self | Updated profile data |
| GET, PUT | `/api/profile/conditions` | Session / PATIENT | Patient self | GET: no; PUT: yes | None explicit | PUT Zod JSON | Patient self | Medical conditions |
| GET, PUT | `/api/profile/diabetes` | Session / PATIENT | Patient self | GET: no; PUT: yes | None explicit | PUT Zod JSON | Patient self | Diabetes profile |
| PUT | `/api/profile/additional` | Session / PATIENT | Patient self | Yes | None explicit | Zod JSON | Patient self | Sensitive profile notes |
| PUT | `/api/profile/reproductive` | Session / PATIENT | Patient self | Yes | None explicit | Zod JSON | Patient self | Reproductive health information |
| POST | `/api/redeem-recovery` | Public | Redeem one-time code | N/A | 20 per IP / 15 min; 5 attempts per recovery token | Zod JSON | Email-bound user and locked token/request | Status only |
| GET | `/api/reports/pdf` | Session / PATIENT | Patient self | No | None explicit | Query/date validation | Patient self | Full medical report PDF |
| GET | `/api/reports/summary` | Session / PATIENT | Patient self | No | None explicit | Query/date validation | Patient self | Medical summary |
| PATCH | `/api/settings/contact` | Session / PATIENT | Patient self | Yes | None explicit | Zod JSON | Patient self | Contact details |
| GET, POST | `/api/sleep` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON | Patient self | Sleep records |
| DELETE | `/api/sleep/:id` | Session / PATIENT | Patient self | Yes | None explicit | Path ID; ownership query | Patient self | Delete status only |
| GET, POST | `/api/symptoms` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON | Patient self | Symptoms and notes |
| DELETE | `/api/symptoms/:id` | Session / PATIENT | Patient self | Yes | None explicit | Path ID; ownership query | Patient self | Delete status only |
| GET, POST | `/api/weight` | Session / PATIENT | Patient self | GET: no; POST: yes | None explicit | POST Zod JSON | Patient self | Weight records |
| DELETE | `/api/weight/:id` | Session / PATIENT | Patient self | Yes | None explicit | Path ID; ownership query | Patient self | Delete status only |

All patient-record read routes observed derive the owner from the server session. State-changing patient routes also scope updates/deletes to the same profile. A POST to medication administrations checks that the referenced medication belongs to the active profile. Admin routes are limited to account/recovery operations; no admin endpoint returning clinical records was found. The table is source-derived and does not replace a full dynamic test of every method.

## Findings

### SEC-001 — Non-atomic rate limiting

- **Severity:** HIGH (estimated CVSS 7.5; network abuse can exceed configured threshold)
- **CWE:** CWE-362
- **Affected component:** `src/server/auth/session.ts`, `checkRateLimit`
- **Evidence:** Previous read-then-update could let concurrent requests observe the same counter. Replaced with a single PostgreSQL upsert and returned counter decision.
- **Exploitability / impact:** Concurrent requests could exceed a route's per-key limit.
- **Remediation:** Atomic upsert; counter capped at `limit + 1`.
- **Test:** 40 concurrent requests against an isolated PostgreSQL instance; exactly 7 allowed for a limit of 7.
- **Status:** FIXED

### SEC-002 — Spoofable forwarding headers

- **Severity:** HIGH (estimated CVSS 6.5)
- **CWE:** CWE-807
- **Affected component:** `src/server/auth/session.ts`, `clientIp`
- **Evidence:** Previous code trusted the leftmost `X-Forwarded-For`, which clients can supply. Railway documents `X-Real-IP` as the client's remote IP; `X-Railway-Edge` is only the edge POP.
- **Exploitability / impact:** Header spoofing could split rate-limit buckets and falsify audit IPs.
- **Remediation:** Use only validated `X-Real-IP`; reject malformed values; ignore `X-Forwarded-For` and `X-Railway-Edge`.
- **Test:** Unit checks reject spoofed/malformed values and accept valid IPv4/IPv6; Railway header contract checked against [Railway public networking docs](https://docs.railway.com/networking/public-networking/specs-and-limits).
- **Status:** FIXED

### SEC-003 — Concurrent login failure tracking

- **Severity:** MEDIUM (estimated CVSS 6.5)
- **CWE:** CWE-362
- **Affected component:** `src/server/services/auth-service.ts`, `authenticate`
- **Evidence:** Previous code calculated `failedLoginCount + 1` from a stale user row.
- **Exploitability / impact:** Concurrent bad passwords could lose increments and delay lockout.
- **Remediation:** Atomic SQL increment, threshold-based lock timestamp, and bounded counter.
- **Test:** Ten simultaneous bad-password attempts against synthetic account; counter reached 5 and lockout timestamp was set.
- **Status:** FIXED

### SEC-004 — Recovery-token redemption race and replay

- **Severity:** HIGH (estimated CVSS 8.1 if a valid code is shared or observed)
- **CWE:** CWE-362, CWE-294
- **Affected component:** `src/server/services/recovery.ts`, `redeemRecoveryCode`
- **Evidence:** Token lookup, attempt count, consumption, password change, request completion, and session revocation were not one locked operation.
- **Exploitability / impact:** Parallel requests could race token consumption or attempts; session revocation was outside the password transaction.
- **Remediation:** Lock the current token/request in a database transaction, atomically increment/cap attempts, consume once, complete request, change password, and revoke sessions before commit.
- **Test:** Concurrent valid redemption produced exactly one success; concurrent wrong codes stopped at 5 and invalidated the token; existing session was revoked.
- **Status:** FIXED

### SEC-005 — Chromium sandbox disabled

- **Severity:** HIGH (estimated CVSS 7.5; browser compromise could reach app process)
- **CWE:** CWE-250
- **Affected component:** `src/server/reports/pdf.ts`; Railway app runtime
- **Evidence:** Launch arguments included `--no-sandbox` and `--disable-setuid-sandbox`.
- **Exploitability / impact:** A Chromium exploit would have weaker process isolation while rendering report content.
- **Remediation:** Removed both sandbox-disabling flags. Railway app service now uses `RAILWAY_RUN_UID=1000`; CSP in generated report blocks script and remote-resource execution. Railway health endpoint returns unavailable if production process runs as root.
- **Test:** Local Google Chrome launched and generated a PDF without sandbox-disabling flags using hostile synthetic text; runtime UID and live PDF require deployment verification.
- **Status:** MITIGATED pending live health verification

### SEC-006 — Weak production environment validation

- **Severity:** MEDIUM (estimated CVSS 5.3)
- **CWE:** CWE-798, CWE-1189
- **Affected component:** `src/server/env.ts`
- **Evidence:** Prior schema accepted short production secrets, non-HTTPS app URLs, and invalid session bounds.
- **Exploitability / impact:** Weak keys and misconfigured URL/session lifetime could undermine identity and transport controls.
- **Remediation:** Production validation requires 32-byte session secret and national-ID pepper, 32-byte AES key (base64 or compatible 32-byte raw form), HTTPS `APP_URL`, idle 1–168 hours, and absolute 1–30 days. Existing key was not read or rotated.
- **Test:** Production build passed with synthetic valid values; Railway startup/health after deploy validates configured values without revealing them.
- **Status:** FIXED

### SEC-007 — Account-role disclosure at login

- **Severity:** MEDIUM (estimated CVSS 5.3)
- **CWE:** CWE-204
- **Affected component:** `src/server/services/auth-service.ts`, `authenticate`
- **Evidence:** Wrong-portal response distinguished patient and administrator accounts.
- **Exploitability / impact:** An attacker could learn account role from login response.
- **Remediation:** Wrong-portal and bad-password responses now share status, code, and message.
- **Test:** Isolated DB test deep-compared both public error responses.
- **Status:** FIXED

### SEC-008 — Registration email and national-ID enumeration

- **Severity:** MEDIUM (estimated CVSS 5.3)
- **CWE:** CWE-204
- **Affected component:** `src/app/api/auth/register/route.ts`
- **Evidence:** Duplicate email and duplicate national ID produced distinguishable messages; a concurrent unique-key conflict used a separate generic duplicate response.
- **Exploitability / impact:** Public registration could confirm whether an identity value was registered.
- **Remediation:** Both duplicate paths and database uniqueness conflicts return the same status, code, and message.
- **Test:** Isolated DB route test compared duplicate-email and duplicate-national-ID responses.
- **Status:** FIXED

### SEC-009 — Unbounded JSON body read

- **Severity:** MEDIUM (estimated CVSS 5.3)
- **CWE:** CWE-400
- **Affected component:** `src/server/http.ts`, `parseBody`
- **Evidence:** Previous implementation called `request.json()` without checking declared or streamed body size.
- **Exploitability / impact:** Large bodies could consume excess application memory.
- **Remediation:** 1 MiB declared and streaming cap; 413 on excess; reject non-JSON content type; bound memory before parsing.
- **Test:** Valid JSON, oversized Content-Length, oversized streamed body, and wrong content type covered.
- **Status:** FIXED

### SEC-010 — Idle and absolute session expiry mismatch

- **Severity:** LOW (estimated CVSS 3.1)
- **CWE:** CWE-613
- **Affected component:** `src/server/auth/session.ts`, `createSession` and `getCurrentSession`
- **Evidence:** Sliding idle expiry could exceed absolute expiry, while browser cookie used initial idle expiration.
- **Exploitability / impact:** Browser and database session lifetime could diverge.
- **Remediation:** Cookie expiry uses absolute expiry; refreshed idle expiry is capped at absolute expiry; server rejects either expired timestamp.
- **Test:** Isolated DB check verified cookie expiry equals absolute expiry and idle expiry is not later.
- **Status:** FIXED

### DEP-001 — Development/build dependency advisories

- **Severity:** MEDIUM in developer/build environments; no production dependency advisory reported
- **CWE:** CWE-400, CWE-1221 (advisory-specific)
- **Affected component:** Tailwind CSS 3.4.19 dependency tree, drizzle-kit 0.31.11 dependency tree
- **Evidence:** `npm audit --json`: 5 high, 6 moderate, 0 critical overall; `npm audit --omit=dev --json`: 0 findings. High advisories include `braces`/`chokidar`/`micromatch`; moderate advisories include `esbuild` via drizzle-kit and `postcss-selector-parser`.
- **Exploitability / impact:** Development server/build tooling may be exposed to denial of service or dev-server request risks; these packages are development-only and not shipped as runtime dependencies.
- **Remediation:** `npm audit fix` found no compatible fixes. Automated fixes require breaking Tailwind CSS 4 and drizzle-kit 0.18 changes, so no blind major downgrade/upgrade was applied.
- **Test:** Full and production-only npm audit JSON reports recorded.
- **Status:** ACCEPTED RISK for current production release; schedule a tested tooling migration

## Additional security review

- **Authorization / IDOR:** Patient record API handlers observed use session-derived profile IDs in SQL filters. Medication administration POST verifies medication ownership. Synthetic service tests verified one patient's list excludes the other patient's glucose record, foreign record deletion returns 404, and foreign medication lookup returns 404. Full browser-driven CRUD matrix was not run.
- **Admin separation:** Admin APIs cover user/account metadata and supervised password recovery. No admin clinical-record API was found. Recovery queue exposes limited identity/contact details, including national-ID last four, to admins because workflow requires identity verification.
- **CSRF:** Session mutations use double-submit token and same-origin checks. Safe methods bypass CSRF. Public login/register/recovery handlers do not mutate an existing authenticated session; JSON content type and browser CORS rules constrain cross-site forms.
- **Input/output:** Mutations use Zod schemas; identifiers in path routes are database-scoped. PDF strings use HTML escaping; report HTML has a restrictive CSP. No `dangerouslySetInnerHTML` sink was identified in reviewed app components. Generated PDF uses local embedded fonts.
- **Cryptography:** AES-256-GCM uses random 12-byte IV and authentication tag. National-ID blind index uses HMAC-SHA256. Session tokens use cryptographic random bytes and only SHA-256 hashes are stored. Existing encryption keys were preserved.
- **Database:** Production PostgreSQL is a separate Railway service; app and DB use Railway service networking; no PostgreSQL public domain/TCP proxy was listed. Migration is idempotent and ran before the prior deployment. New migration was not required.
- **Secrets:** Railway connector redacted values; no secret values were printed. Production value strength is not independently inspectable. Successful post-change startup/health is the runtime evidence for env validation.
- **Headers:** Middleware emits per-request nonce CSP; `script-src` has nonce and `strict-dynamic`, no `unsafe-eval`; inline styles remain allowed for current component/chart styles. HSTS, `nosniff`, frame protection, referrer policy, and permissions policy are configured.
- **External links:** Patient login, registration, and public page static assets passed local runtime smoke checks. Production auth, recovery, and authenticated PDF actions require credentials and were not tested with real patient accounts.
- **History and backups:** Full Git secret-history scan, backup restore drill, PostgreSQL least-privilege role review, and backup retention/protection inspection were not verified.

## Validation results

- `PUPPETEER_SKIP_DOWNLOAD=true npm ci`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS with synthetic production env values; Next.js 15.5.27.
- `npm run test:security`: 11 passed using local isolated PostgreSQL 16 and local Chromium; includes rate-limit/login/recovery concurrency, registration enumeration, data ownership, CSRF, request limits, IP parsing, session-expiry invariant, and PDF rendering.
- Local HTTP smoke: `/`, `/login`, `/register`, `/admin/login` returned 200 with Arabic text and nonce CSP; `/dashboard` redirected to login; health returned 503 only because test run used unreachable dummy DB URL.
- Full `npm audit --json`: 5 high, 6 moderate, 0 critical (development/build dependency tree).
- `npm audit --omit=dev --json`: 0 vulnerabilities.
- Railway production checks: see deployment verification report.

## Residual risks and limitations

1. Admin and patient positive login, password recovery workflow, and PDF generation could not be tested in production without authorized test-account credentials. No such credentials were available; no production fake accounts were created.
2. Railway secret values are redacted. Source validation now enforces strength at runtime, but values were not independently inspected.
3. Chromium sandbox and UID 1000 were validated locally; live readiness confirms non-root and DB connection, but authenticated production PDF rendering remains unverified.
4. Six moderate and five high advisories remain in development/build dependencies. Production dependency tree is clean.
5. No backup restore drill, PostgreSQL least-privilege grant audit, or full Git history secret scan was performed.
6. CSP allows inline styles for existing Next.js/chart UI. Script execution remains nonce-protected.
7. The API inventory is source-derived; exhaustive method-by-method dynamic authorization/CSRF tests remain future work.

## Final assessment

**Result:** pending final production runtime checks. Do not treat the app as fully production-verified until the deployment report records health, database, public route, header, and protected-route checks.
