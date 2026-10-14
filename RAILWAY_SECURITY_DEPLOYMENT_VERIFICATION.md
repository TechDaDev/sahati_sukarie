# Railway Security Deployment Verification

**Verification date:** 2026-10-14
**Repository:** `TechDaDev/sahati_sukarie` (`main`)
**Audited base:** `61659b269f49a51846a29eb4ae1f0c4a819dce14`
**Remediation commits:** `2f573e3008dd322164e477690358a78b4274c300`, `246365fee9f558568dd6687c09adb111b87ae395`, `463d1ec` (`463d1ec` honors Railway's runtime port)
**Successful deployment:** `4c180cdc-2183-4ea4-8779-999d2c333a20` (`SUCCESS`, commit `463d1ec`)
**Railway project:** `sahati-wa-sukari` (`5e9ef7e5-ed19-4106-b194-ed5e2574ddeb`)
**Environment:** `production` (`24ebb066-c0a5-4317-b213-a04470b870e0`)
**Application service:** `sahati_sukarie` (`5ebd7d71-4c2f-4d38-b9ad-8a0d45d806cd`)
**Database service:** `Postgres` (`040a255f-3dbb-4630-b079-41818d4a5391`)

## Deployment

| Gate | Result | Evidence |
|---|---|---|
| Source repository / branch | VERIFIED | Railway source is `TechDaDev/sahati_sukarie`, branch `main`. |
| Production URL | VERIFIED | `https://sahatisukarie.up.railway.app` |
| Database networking | VERIFIED | PostgreSQL has private endpoint `postgres`; no public domain/TCP proxy listed. |
| Existing patient data | VERIFIED | No production patient data was read, changed, or used in tests. |
| Build | PASS | Railway built commit `463d1ec`; local `npm run build` and `npm run typecheck` also passed. |
| Runtime | PASS | Next.js 15.5.27 became ready on Railway-assigned port `8080`; `RAILWAY_RUN_UID=1000`. |
| Migration | PASS | `npm run db:migrate` reported database up to date; no migration or patient data was created. |
| Health check | PASS | `/api/health` returned 200; this confirms DB readiness and that the process is not root. |
| Non-root Chromium sandbox | PASS (runtime configuration) | UID 1000 is active and Chromium sandbox-disabling flags were removed; authenticated production PDF generation remains unverified. |
| Domain forwarding | PASS | Corrected Railway domain target port from `3000` to `8080` after observing 502 connection-refused responses. |

## Production checks

| Check | Result | Evidence |
|---|---|---|
| HTTPS availability | PASS | HTTPS GETs completed against the production Railway domain. |
| Security headers / nonce CSP | PASS | `/`, `/login`, `/register`, `/admin/login`, and `/api/health` returned HSTS and CSP with a nonce. |
| Homepage and Arabic RTL | PASS | Homepage returned 200; HTML is the Arabic application page. |
| Login / registration pages | PASS | `/login`, `/register`, `/admin/login` each returned 200. |
| Protected route redirect | PASS | Unauthenticated `/dashboard` returned 307 to `/login`; `/admin` returned 307 to `/admin/login`. |
| Health / database connectivity | PASS | `/api/health` returned 200 with status only. |
| Session cookie flags | NOT VERIFIED | No production authentication performed. |
| Positive authentication / authorization | NOT VERIFIED | No authorized test-account credentials available. |
| PDF functional generation | NOT VERIFIED | No authenticated production test account available; local synthetic Chromium PDF passed. |
| Runtime logs | PASS | Startup reached Ready; migration reported no changes; no secrets or patient data were exposed in this review. |

## Deployment diagnosis

The first two source deployments failed their health checks because the start command forced port `3000` while Railway assigned port `8080`. The app was running, but Railway health probes could not reach it. The app start script now uses `${PORT:-3000}`. After that deployment succeeded, public requests still returned 502 because the Railway domain continued targeting port `3000`; the domain target was updated to `8080`, after which all safe smoke checks passed. A manual redeploy attempt also hit a Railpack cache error while `HOME=/tmp`; `HOME` was aligned to `/root` before the successful source deployment.

No production patient account was used, and no fake patient was created in production. Positive authentication, session cookie flags, and authenticated PDF generation remain **NOT VERIFIED** because no authorized test credentials were available.
