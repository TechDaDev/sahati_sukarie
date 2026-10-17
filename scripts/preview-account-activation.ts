/** Read-only aggregate preview. This script does not update account records. */
import { Client } from 'pg';
import { loadEnvFiles } from './load-env';

async function main() {
  await loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL غير محدد.');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const columns = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('email_activation_required','email_verified_at','email_activation_exemption')",
    );
    const present = new Set(columns.rows.map((row) => row.column_name));
    const activationSql = present.has('email_activation_required') && present.has('email_verified_at')
      ? `COUNT(*) FILTER (WHERE email_activation_required AND email_verified_at IS NULL)::int AS pending_activation, COUNT(*) FILTER (WHERE email_verified_at IS NOT NULL)::int AS email_verified, COUNT(*) FILTER (WHERE NOT email_activation_required AND email_verified_at IS NULL)::int AS active_without_email_verification`
      : `0::int AS pending_activation, 0::int AS email_verified, 0::int AS active_without_email_verification`;
    const summary = await client.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE email IS NULL OR btrim(email) = '')::int AS missing_email, COUNT(*) FILTER (WHERE email IS NOT NULL AND btrim(email) <> '' AND email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$')::int AS malformed_email, COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active, COUNT(*) FILTER (WHERE status::text = 'PENDING')::int AS pending_status, COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended, COUNT(*) FILTER (WHERE status = 'DISABLED')::int AS disabled, ${activationSql} FROM users`,
    );
    const byRole = await client.query("SELECT role::text AS role, COUNT(*)::int AS count FROM users GROUP BY role ORDER BY role");
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ previewOnly: true, emailActivationColumnsPresent: present.size === 3, accounts: summary.rows[0], byRole: byRole.rows, deletedOrArchived: 'not represented in current users schema; no rows classified', migrationChangesExistingStatuses: false }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

main().catch((error) => {
  const code = error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code) : 'UNKNOWN';
  console.error(`تعذر إعداد معاينة الحسابات (${code}).`);
  process.exitCode = 1;
});
