# Mobile API Railway verification

Verification date: 2026-10-15

## Target

- Railway project: `sahati-wa-sukari` (`5e9ef7e5-ed19-4106-b194-ed5e2574ddeb`)
- Service: `sahati_sukarie` (`5ebd7d71-4c2f-4d38-b9ad-8a0d45d806cd`)
- Environment: `production` (`24ebb066-c0a5-4317-b213-a04470b870e0`)
- PostgreSQL service: existing `Postgres` (`040a255f-3dbb-4630-b079-41818d4a5391`)
- Public URL: `https://sahatisukarie.up.railway.app`
- Domain target port: 8080
- Health check: `/api/health`
- Pre-deploy migration command: `npm run db:migrate`
- Current live deployment before this change: `7b893b95-8d79-4721-9710-d40c809bcf27` (`SUCCESS`, 2026-10-14)

The live service source is `TechDaDev/sahati_sukarie`, branch `main`. Existing service and database were reused. A pre-existing zero-change staged Railway patch remained untouched.

## New deployment

Deployment: `46e5e9cb-3996-4c83-b22f-bff81590a04b` (`SUCCESS`, region `us-east4-eqdc4a`), commit `c126b81bebce398f3e5fcff05aa57b879ed8c402`.

Railway ran the configured `npm run db:migrate` pre-deploy command before starting the app container. The deployment's `/api/health` health check passed.

## Smoke verification

All checks against `https://sahatisukarie.up.railway.app` passed:

| Check | Result |
|---|---|
| `GET /api/health` | 200, `{"status":"ok"}`, `Cache-Control: no-store` |
| `GET /api/v1/config` | 200, API v1 config, `Cache-Control: no-store` |
| `GET /api/openapi.json` | 200, OpenAPI 3.1.0, `Cache-Control: no-store` |
| `GET /api/v1/glucose` without credentials | 401 `UNAUTHENTICATED` |
| `GET /api/v1/glucose` with invalid bearer | 401 `UNAUTHENTICATED` |
| `GET /login` | 200 |
| HTTP `/api/health` | 301 redirect to HTTPS |
| HTTPS `/api/health` | 200, HSTS `max-age=31536000` |

No production patient rows were read. No credentials were sent other than the deliberately invalid placeholder token.

## Authentication verification

Positive production mobile authentication is not verified. No controlled production test account was provided. Registration or patient-data writes will not be attempted in production.

## Status

**PASS WITH LIMITATIONS** — deployment and unauthenticated production checks passed. Positive production authentication and authenticated patient behavior remain unverified.
