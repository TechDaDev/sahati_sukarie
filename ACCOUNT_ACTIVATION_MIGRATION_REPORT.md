# Account Activation Migration Report

**Status: PASS WITH LIMITATIONS**
**Updated:** 2026-10-17

## Production migration

`db/migrations/0003_email_otp.sql` ran through Railway's pre-deploy migration command `npm run db:migrate`. Production history now contains `0001_init.sql`, `0002_mobile_sessions.sql`, and `0003_email_otp.sql`.

Before migration, production had 3 accounts, all ACTIVE PATIENTs, and no administrators. An encrypted PostgreSQL dump was created before migration and restored successfully in an isolated PostgreSQL 18 container. Backup: `/home/zeus3000/.local/state/sahati-prod-backups/sahati-production-20261017T153157Z.dump.gpg`; SHA-256 `ab6a478087e421af3cbda5325b1eacc5b35f0dda9770d71995ffa4af1666afe7`.

## Current aggregate

| Measure | Count |
|---|---:|
| Total accounts | 4 |
| Patients | 3 |
| Active patients | 3 |
| Legacy activated patients | 3 |
| Patients requiring activation | 0 |
| Patient email timestamps marked verified | 0 |
| Pending / suspended / disabled accounts | 0 / 0 / 0 |
| Administrators | 1 |

The three pre-existing patients remain ACTIVE and use the `LEGACY_CUTOFF` exemption. This preserves existing access without inventing email-verification evidence. Their passwords, sessions, IDs, and medical records were not modified. No patient-identifying rows were returned.

## Verification and boundary

Local PostgreSQL migration coverage confirmed existing accounts retain exemption with null verification timestamps, while future accounts can require activation. Production aggregate confirms the same three patients remain active and exempt after deployment.

Production `EMAIL_ACTIVATION_REQUIRED` is false/unset. New-account OTP redemption has not passed production end-to-end verification; mandatory activation awaits successful synthetic-account testing and separate explicit owner authorization.
