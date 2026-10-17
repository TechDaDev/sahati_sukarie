/** Create the first platform administrator and send a single-use setup invitation. */
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { Client } from 'pg';
import { loadEnvFiles } from './load-env';

const ADMIN_EMAIL = 'admin@sahati.iq';
const INVITATION_TTL_MINUTES = 30;

async function main() {
  await loadEnvFiles();
  const url = process.env.DATABASE_URL;
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.APP_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  if (email !== ADMIN_EMAIL) throw new Error(`INITIAL_ADMIN_EMAIL must be ${ADMIN_EMAIL}.`);
  if (!apiKey || !from || !appUrl) throw new Error('Resend and APP_URL configuration are required.');

  const inviteUrl = new URL('/admin/accept-invitation', appUrl);
  if (inviteUrl.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL must use HTTPS in production.');
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MINUTES * 60_000);
  const randomInitialPassword = randomBytes(48).toString('base64url');
  const passwordHash = await bcrypt.hash(randomInitialPassword, 12);
  const client = new Client({ connectionString: url });
  await client.connect();

  let userId: string;
  let invitationId: string;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sahati-initial-admin-invitation'))");
    const admins = await client.query("SELECT id, email, status, must_change_password FROM users WHERE role = 'ADMIN' FOR UPDATE");
    if (admins.rows.length > 1 || (admins.rows.length === 1 && admins.rows[0].email.toLowerCase() !== ADMIN_EMAIL)) {
      throw new Error('An administrator already exists; refusing first-admin provisioning.');
    }

    if (admins.rows.length === 1) {
      const existing = admins.rows[0];
      if (existing.status === 'ACTIVE' && !existing.must_change_password) {
        await client.query('COMMIT');
        await client.end();
        console.log('The initial administrator is already initialized; no invitation sent.');
        return;
      }
      if (existing.status !== 'ACTIVE' || !existing.must_change_password) {
        throw new Error('The administrator account is already initialized.');
      }
      userId = existing.id;
    } else {
      const emailMatch = await client.query('SELECT id FROM users WHERE lower(email) = $1 FOR UPDATE', [ADMIN_EMAIL]);
      if (emailMatch.rowCount) throw new Error('The administrator email belongs to a non-administrator account.');
      const created = await client.query(
        `INSERT INTO users (email, password_hash, role, status, must_change_password, email_activation_required)
         VALUES ($1, $2, 'ADMIN', 'ACTIVE', true, false) RETURNING id`,
        [ADMIN_EMAIL, passwordHash],
      );
      userId = created.rows[0].id;
    }

    await client.query('UPDATE admin_invitations SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL', [userId]);
    const invite = await client.query(
      'INSERT INTO admin_invitations (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id',
      [userId, tokenHash, expiresAt],
    );
    invitationId = invite.rows[0].id;
    await client.query(
      `INSERT INTO audit_logs (actor_role, action, target_type, target_id, metadata)
       VALUES ('SYSTEM', 'INITIAL_ADMIN_INVITATION_CREATED', 'user', $1, $2::jsonb)`,
      [userId, JSON.stringify({ expiresInMinutes: INVITATION_TTL_MINUTES })],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
    throw error;
  }
  await client.end();

  inviteUrl.hash = new URLSearchParams({ token }).toString();
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [ADMIN_EMAIL],
    subject: 'Sahati wa Sukari — Administrator setup invitation',
    text: `Use this secure link to set your administrator password. It expires in ${INVITATION_TTL_MINUTES} minutes. If you did not expect this invitation, ignore this message.\n\n${inviteUrl.toString()}`,
    html: `<p>Use this secure link to set your administrator password. It expires in ${INVITATION_TTL_MINUTES} minutes.</p><p><a href="${inviteUrl.toString()}">Set administrator password</a></p><p>If you did not expect this invitation, ignore this message.</p>`,
  });
  if (result.error || !result.data?.id) {
    const failedClient = new Client({ connectionString: url });
    await failedClient.connect();
    await failedClient.query('UPDATE admin_invitations SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL', [invitationId]);
    await failedClient.query(
      `INSERT INTO audit_logs (actor_role, action, target_type, target_id, metadata)
       VALUES ('SYSTEM', 'INITIAL_ADMIN_INVITATION_DELIVERY_FAILED', 'user', $1, $2::jsonb)`,
      [userId, JSON.stringify({ providerError: result.error?.name ?? 'unknown' })],
    );
    await failedClient.end();
    throw new Error(`Resend did not accept the administrator invitation (${result.error?.name ?? 'unknown'}).`);
  }

  const auditClient = new Client({ connectionString: url });
  await auditClient.connect();
  await auditClient.query(
    `INSERT INTO audit_logs (actor_role, action, target_type, target_id, metadata)
     VALUES ('SYSTEM', 'INITIAL_ADMIN_INVITATION_ACCEPTED_BY_PROVIDER', 'user', $1, $2::jsonb)`,
    [userId, JSON.stringify({ providerMessageId: result.data.id })],
  );
  await auditClient.end();
  console.log(`Invitation accepted by Resend for ${ADMIN_EMAIL}; message ID ${result.data.id}.`);
}

main().catch((error) => {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : 'unknown failure';
  console.error(`${name}: ${message}`);
  process.exitCode = 1;
});
