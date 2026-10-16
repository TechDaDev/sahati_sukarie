import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { db, pool } from '../../src/server/db';
import { auditLogs, glucoseReadings, mealRecords, patientProfiles, sessions, users } from '../../src/server/db/schema';
import { hashPassword } from '../../src/server/auth/session';
import { randomToken, sha256Hex } from '../../src/server/lib/crypto';

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test('production dashboard second visit and session recovery regression', async (t) => {
  if (!databaseUrl) return t.skip('Set SECURITY_TEST_DATABASE_URL to an isolated local PostgreSQL database.');
  const target = new URL(databaseUrl);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(target.hostname), 'Refusing non-local test database');
  assert.match(target.pathname, /security[_-]test/i, 'Refusing database without security_test name');
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL !== databaseUrl) {
    return t.skip('Run through npm run test:security so DATABASE_URL targets the isolated test database.');
  }

  const password = 'Synthetic-Dashboard-Regression-917!';
  const email = `dashboard-${randomToken(8)}@example.invalid`;
  const [user] = await db.insert(users).values({
    email, passwordHash: await hashPassword(password), role: 'PATIENT', status: 'ACTIVE',
  }).returning({ id: users.id });
  assert.ok(user);
  let child: ChildProcess | undefined;
  let ownedCookies = '';
  try {
    const [profile] = await db.insert(patientProfiles).values({
      userId: user.id, fullName: 'Synthetic Dashboard Patient', gender: 'MALE', dateOfBirth: '1980-01-01',
      heightCm: '170.0', nationalIdProtected: 'synthetic-only', nationalIdHash: randomToken(32),
      nationalIdLast4: '1234', phoneNumber: '+9647000000000', phoneNorm: '+9647000000000',
    }).returning({ id: patientProfiles.id });
    assert.ok(profile);
    const now = Date.now();
    await db.insert(glucoseReadings).values([
      { patientId: profile.id, glucoseValue: '111', glucoseUnit: 'MG_DL', standardizedValueMgdl: '111', measurementDatetime: new Date(now - 2 * 3600_000) },
      { patientId: profile.id, glucoseValue: '124', glucoseUnit: 'MG_DL', standardizedValueMgdl: '124', measurementDatetime: new Date(now - 30 * 60_000) },
    ]);
    await db.insert(mealRecords).values({ patientId: profile.id, mealType: 'LUNCH', mealDatetime: new Date(now - 60 * 60_000) });

    const port = await freePort();
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverOutput = '';
    child.stdout?.on('data', (chunk: Buffer) => { serverOutput += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { serverOutput += chunk.toString(); });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`${base}/login`);
        if (response.status === 200) { ready = true; break; }
      } catch { /* Wait for Next.js to bind. */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, `Production server did not become ready. ${serverOutput}`);

    const firstAnonymous = await fetch(`${base}/dashboard`, { redirect: 'manual' });
    assert.equal(firstAnonymous.status, 307, 'Unauthenticated first visit must redirect to login');
    assert.match(firstAnonymous.headers.get('location') ?? '', /\/login/);

    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.test', 'x-real-ip': '192.0.2.81' },
      body: JSON.stringify({ email, password }),
    });
    const loginText = await login.text();
    assert.equal(login.status, 200, loginText);
    const setCookies = login.headers.getSetCookie();
    const sessionCookie = setCookies.find((value) => value.startsWith('sahati_session='));
    const csrfCookie = setCookies.find((value) => value.startsWith('sahati_csrf='));
    assert.ok(sessionCookie && csrfCookie);
    const sessionToken = decodeURIComponent(sessionCookie.split(';', 1)[0]!.split('=', 2)[1]!);
    const sessionId = sha256Hex(sessionToken);
    const sessionValue = sessionCookie.split(';', 1)[0]!;
    const csrfValue = csrfCookie.split(';', 1)[0]!;
    ownedCookies = `${sessionValue}; ${csrfValue}`;

    for (const visit of ['authenticated first dashboard visit', 'dashboard second visit/page refresh']) {
      const dashboard = await fetch(`${base}/dashboard`, { headers: { cookie: ownedCookies } });
      const html = await dashboard.text();
      assert.equal(dashboard.status, 200, `${visit} failed: ${html.slice(0, 400)} ${serverOutput}`);
      assert.match(html, /فروق متوسط القراءات حول الأحداث المسجّلة/, `${visit} must render the event-delta branch`);
    }

    await db.update(sessions).set({ idleExpiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, sessionId));
    const expired = await fetch(`${base}/dashboard`, { headers: { cookie: ownedCookies }, redirect: 'manual' });
    assert.equal(expired.status, 307, 'Expired browser session must redirect without a server exception');
    assert.match(expired.headers.get('location') ?? '', /\/login/);

    const invalidCookie = await fetch(`${base}/dashboard`, { headers: { cookie: 'sahati_session=invalid-token' }, redirect: 'manual' });
    assert.equal(invalidCookie.status, 307, 'Invalid cookie must redirect without a server exception');

    const loginAgain = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.test', 'x-real-ip': '192.0.2.83' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(loginAgain.status, 200);
    const logoutCookies = loginAgain.headers.getSetCookie();
    const logoutSession = logoutCookies.find((value) => value.startsWith('sahati_session='))!;
    const logoutCsrf = logoutCookies.find((value) => value.startsWith('sahati_csrf='))!;
    const logoutCookieHeader = `${logoutSession.split(';', 1)[0]}; ${logoutCsrf.split(';', 1)[0]}`;
    const logout = await fetch(`${base}/api/auth/logout`, {
      method: 'POST', headers: { cookie: logoutCookieHeader, origin: 'https://example.test', 'x-real-ip': '192.0.2.84' },
    });
    assert.equal(logout.status, 200, await logout.text());
    const afterLogout = await fetch(`${base}/dashboard`, { headers: { cookie: logoutCookieHeader }, redirect: 'manual' });
    assert.equal(afterLogout.status, 307, 'Logged-out browser session must be rejected on return');
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    await db.delete(auditLogs).where(eq(auditLogs.actorUserId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
    await pool.end();
  }
});
