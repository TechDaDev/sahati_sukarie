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

The live service source is `TechDaDev/sahati_sukarie`, branch `main`. Railway readback showed no staged configuration. Existing service and database will be reused.

## New deployment

Pending Git push and Railway rollout.

## Smoke verification

Pending new deployment. Required safe checks: `/api/health`, `/api/v1/config`, `/api/openapi.json`, unauthenticated patient endpoint, invalid bearer token, HTTPS domain, and website login page. Do not read production patient rows or use unapproved production credentials.

## Authentication verification

Positive production mobile authentication is not verified. No controlled production test account was provided. Registration or patient-data writes will not be attempted in production.

## Status

Deployment and production smoke checks pending.
