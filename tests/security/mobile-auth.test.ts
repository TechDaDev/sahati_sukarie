import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../../src/server/db';
import { glucoseReadings, mobileRefreshTokens, mobileSessions, patientProfiles, rateLimitCounters, users } from '../../src/server/db/schema';
import { hashPassword } from '../../src/server/auth/session';
import { authenticateBearer, loginMobile, refreshMobile } from '../../src/server/services/mobile-auth';
import { GET as mobileApi, POST as mobileApiPost } from '../../src/app/api/v1/[...path]/route';

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;

test('mobile authentication rotates opaque tokens and isolates patient records', async (t) => {
  if (!databaseUrl) return t.skip('Set SECURITY_TEST_DATABASE_URL to an isolated local PostgreSQL database.');
  const parsedUrl = new URL(databaseUrl);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname), 'Refusing mobile tests against non-local database');
  assert.match(parsedUrl.pathname, /security[_-]test/i, 'Refusing database without security_test name');

  const passwordHash = await hashPassword('Synthetic-Mobile-Password-917!');
  const suffix = randomUUID();
  const rateIp = `198.51.100.${1 + Math.floor(Math.random() * 200)}`;
  const ips = [rateIp, ...Array.from({ length: 9 }, (_, index) => `198.51.100.${42 + index}`)];
  const emails = [`mobile-a-${suffix}@example.invalid`, `mobile-b-${suffix}@example.invalid`, `mobile-admin-${suffix}@example.invalid`];
  const [patientA, patientB, admin] = await db.insert(users).values([
    { email: emails[0]!, passwordHash, role: 'PATIENT', status: 'ACTIVE' },
    { email: emails[1]!, passwordHash, role: 'PATIENT', status: 'ACTIVE' },
    { email: emails[2]!, passwordHash, role: 'ADMIN', status: 'ACTIVE' },
  ]).returning({ id: users.id });
  const [profileA, profileB] = await db.insert(patientProfiles).values([
    { userId: patientA!.id, fullName: 'Synthetic Patient A', gender: 'MALE', dateOfBirth: '1980-01-01', heightCm: '170', nationalIdProtected: 'synthetic-only', nationalIdHash: `test-a-${suffix}`, nationalIdLast4: '1001', phoneNumber: '+9647000000001', phoneNorm: '+9647000000001' },
    { userId: patientB!.id, fullName: 'Synthetic Patient B', gender: 'FEMALE', dateOfBirth: '1982-01-01', heightCm: '165', nationalIdProtected: 'synthetic-only', nationalIdHash: `test-b-${suffix}`, nationalIdLast4: '1002', phoneNumber: '+9647000000002', phoneNorm: '+9647000000002' },
  ]).returning({ id: patientProfiles.id });
  const [privateReading] = await db.insert(glucoseReadings).values({ patientId: profileB!.id, glucoseValue: '123', glucoseUnit: 'MG_DL', standardizedValueMgdl: '123', measurementDatetime: new Date() }).returning({ id: glucoseReadings.id });
  const tiedAt = new Date('2026-01-01T12:00:00.000Z');
  const ownReadings = await db.insert(glucoseReadings).values([110, 111, 112].map((value) => ({ patientId: profileA!.id, glucoseValue: String(value), glucoseUnit: 'MG_DL' as const, standardizedValueMgdl: String(value), measurementDatetime: tiedAt }))).returning({ id: glucoseReadings.id });
  let registeredUserId: string | undefined;

  t.after(async () => {
    await db.delete(users).where(eq(users.id, patientA!.id));
    await db.delete(users).where(eq(users.id, patientB!.id));
    await db.delete(users).where(eq(users.id, admin!.id));
    if (registeredUserId) await db.delete(users).where(eq(users.id, registeredUserId));
    await db.delete(users).where(eq(users.email, `mobile-register-${suffix}@example.invalid`));
    await db.delete(rateLimitCounters).where(inArray(rateLimitCounters.key, [...ips.flatMap((ip) => [`mobile-login:${ip}`, `mobile-refresh:${ip}`]), 'mobile-login:203.0.113.55', 'mobile-register:203.0.113.55', `mobile-pwchange:${patientB!.id}`]));
    await pool.end();
  });

  const signedIn = await loginMobile(emails[0]!, 'Synthetic-Mobile-Password-917!', { ip: rateIp, deviceLabel: 'Synthetic handset' });
  const storedSession = await db.query.mobileSessions.findFirst({ where: eq(mobileSessions.userId, patientA!.id) });
  assert.ok(storedSession);
  assert.equal(storedSession.accessTokenHash, (await import('../../src/server/lib/crypto')).sha256Hex(signedIn.accessToken));
  assert.notEqual(storedSession.accessTokenHash, signedIn.accessToken);
  const storedRefresh = await db.query.mobileRefreshTokens.findFirst({ where: eq(mobileRefreshTokens.mobileSessionId, storedSession.id) });
  assert.equal(storedRefresh?.tokenHash, (await import('../../src/server/lib/crypto')).sha256Hex(signedIn.refreshToken));

  const registerResponse = await mobileApiPost(new Request('https://example.test/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.55' },
    body: JSON.stringify({ fullName: 'Synthetic New Patient', gender: 'MALE', dateOfBirth: '1981-02-03', heightCm: 172, nationalId: String(randomInt(100_000_000_000, 999_999_999_999)), email: `mobile-register-${suffix}@example.invalid`, phone: '07000000003', password: 'Synthetic-Mobile-Password-917!', confirmPassword: 'Synthetic-Mobile-Password-917!', nationalIdConsent: true }),
  }), { params: Promise.resolve({ path: ['auth', 'register'] }) });
  assert.equal(registerResponse.status, 201);
  assert.match(registerResponse.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(registerResponse.headers.get('set-cookie'), null, 'Mobile registration must not create browser cookies');
  const registered = (await registerResponse.json() as { data: { user: { id: string }; accessToken: string; refreshToken: string } }).data;
  registeredUserId = registered.user.id;
  assert.ok(registered.accessToken.startsWith('sat_') && registered.refreshToken.startsWith('srt_'));
  const auth = await authenticateBearer(new Request('https://example.test/api/v1/auth/me', { headers: { authorization: `Bearer ${signedIn.accessToken}` } }));
  assert.equal(auth.session.user.id, patientA!.id);

  for (const collection of ['medications', 'administrations', 'activities', 'factors', 'labs', 'meals', 'sleep', 'symptoms', 'weight']) {
    const response = await mobileApi(new Request(`https://example.test/api/v1/${collection}?limit=10`, { headers: { authorization: `Bearer ${signedIn.accessToken}` } }), { params: Promise.resolve({ path: [collection] }) });
    assert.equal(response.status, 200, `Paged ${collection} query should work`);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const payload = await response.json() as { data: { items: unknown[]; pagination: { limit: number } } };
    assert.ok(Array.isArray(payload.data.items));
    assert.equal(payload.data.pagination.limit, 10);
  }

  const meResponse = await mobileApi(new Request('https://example.test/api/v1/profile', { headers: { authorization: `Bearer ${signedIn.accessToken}` } }), { params: Promise.resolve({ path: ['profile'] }) });
  assert.equal(meResponse.status, 200);
  assert.match(meResponse.headers.get('cache-control') ?? '', /no-store/);
  for (const path of [['profile', 'diabetes'], ['profile', 'conditions'], ['profile', 'reproductive'], ['dashboard']]) {
    const response = await mobileApi(new Request(`https://example.test/api/v1/${path.join('/')}`, { headers: { authorization: `Bearer ${signedIn.accessToken}` } }), { params: Promise.resolve({ path }) });
    assert.equal(response.status, 200, `GET ${path.join('/')} should work for patient`);
  }
  const privateResponse = await mobileApi(new Request(`https://example.test/api/v1/glucose/${privateReading!.id}`, { headers: { authorization: `Bearer ${signedIn.accessToken}` } }), { params: Promise.resolve({ path: ['glucose', privateReading!.id] }) });
  assert.equal(privateResponse.status, 404, 'Patient A must not read Patient B glucose');
  const firstPageResponse = await mobileApi(new Request('https://example.test/api/v1/glucose?limit=2&sort=desc', { headers: { authorization: `Bearer ${signedIn.accessToken}` } }), { params: Promise.resolve({ path: ['glucose'] }) });
  const firstPage = (await firstPageResponse.json() as { data: { items: Array<{ id: string }>; pagination: { hasMore: boolean; nextCursor: string | null } } }).data;
  assert.equal(firstPage.items.length, 2);
  assert.equal(firstPage.pagination.hasMore, true);
  assert.ok(firstPage.pagination.nextCursor);
  const secondPageResponse = await mobileApi(new Request(`https://example.test/api/v1/glucose?limit=2&sort=desc&cursor=${encodeURIComponent(firstPage.pagination.nextCursor!)}`, { headers: { authorization: `Bearer ${signedIn.accessToken}` } }), { params: Promise.resolve({ path: ['glucose'] }) });
  const secondPage = (await secondPageResponse.json() as { data: { items: Array<{ id: string }>; pagination: { hasMore: boolean } } }).data;
  const pagedIds = [...firstPage.items, ...secondPage.items].map((item) => item.id);
  assert.deepEqual(new Set(pagedIds), new Set(ownReadings.map((row) => row.id)));
  assert.equal(new Set(pagedIds).size, 3, 'Keyset cursor must not duplicate tied timestamps');
  const badPage = await mobileApi(new Request('https://example.test/api/v1/glucose?limit=101', { headers: { authorization: `Bearer ${signedIn.accessToken}` } }), { params: Promise.resolve({ path: ['glucose'] }) });
  assert.equal(badPage.status, 400);
  const cookieOnly = await mobileApi(new Request('https://example.test/api/v1/profile', { headers: { cookie: 'sahati_session=not-a-token' } }), { params: Promise.resolve({ path: ['profile'] }) });
  assert.equal(cookieOnly.status, 401, 'Mobile routes must not fall back to browser cookies');
  const mixedAuth = await mobileApi(new Request('https://example.test/api/v1/profile', { headers: { authorization: `Bearer ${signedIn.accessToken}`, cookie: 'sahati_session=browser-token' } }), { params: Promise.resolve({ path: ['profile'] }) });
  assert.equal(mixedAuth.status, 400, 'Mixed browser and bearer authentication must be rejected');
  const queryToken = await mobileApi(new Request(`https://example.test/api/v1/profile?access_token=${encodeURIComponent(signedIn.accessToken)}`), { params: Promise.resolve({ path: ['profile'] }) });
  assert.equal(queryToken.status, 400, 'Tokens in query strings must be rejected');

  const requestId = randomUUID();
  const rotated = await refreshMobile(signedIn.refreshToken, requestId, rateIp);
  assert.notEqual(rotated.accessToken, signedIn.accessToken);
  await assert.rejects(() => refreshMobile(signedIn.refreshToken, requestId, rateIp), (error: unknown) => (error as { code?: string }).code === 'REFRESH_ALREADY_ROTATED');
  await assert.rejects(() => authenticateBearer(new Request('https://example.test/api/v1/auth/me', { headers: { authorization: `Bearer ${signedIn.accessToken}` } })), (error: unknown) => (error as { status?: number }).status === 401);
  await assert.rejects(() => loginMobile(emails[2]!, 'Synthetic-Mobile-Password-917!', { ip: rateIp }), (error: unknown) => (error as { status?: number }).status === 403);

  const secondDevice = await loginMobile(emails[1]!, 'Synthetic-Mobile-Password-917!', { ip: '198.51.100.42' });
  const concurrent = await Promise.allSettled([
    refreshMobile(secondDevice.refreshToken, randomUUID(), '198.51.100.43'),
    refreshMobile(secondDevice.refreshToken, randomUUID(), '198.51.100.44'),
  ]);
  assert.equal(concurrent.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((entry) => entry.status === 'rejected').length, 1);
  const secondSessions = await db.select().from(mobileSessions).where(eq(mobileSessions.userId, patientB!.id));
  assert.ok(secondSessions.every((entry) => entry.revokedAt), 'Refresh replay must revoke the device family');

  const logoutLogin = await loginMobile(emails[1]!, 'Synthetic-Mobile-Password-917!', { ip: '198.51.100.45' });
  const logoutResponse = await mobileApiPost(new Request('https://example.test/api/v1/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${logoutLogin.accessToken}` } }), { params: Promise.resolve({ path: ['auth', 'logout'] }) });
  assert.equal(logoutResponse.status, 200);
  const logoutRow = await db.query.mobileSessions.findFirst({ where: eq(mobileSessions.accessTokenHash, (await import('../../src/server/lib/crypto')).sha256Hex(logoutLogin.accessToken)) });
  assert.ok(logoutRow?.revokedAt, 'Logout must revoke current device');

  const logoutAllLogin = await loginMobile(emails[1]!, 'Synthetic-Mobile-Password-917!', { ip: '198.51.100.46' });
  const logoutAllResponse = await mobileApiPost(new Request('https://example.test/api/v1/auth/logout-all', { method: 'POST', headers: { authorization: `Bearer ${logoutAllLogin.accessToken}` } }), { params: Promise.resolve({ path: ['auth', 'logout-all'] }) });
  assert.equal(logoutAllResponse.status, 200);
  const logoutAllRows = await db.select().from(mobileSessions).where(eq(mobileSessions.userId, patientB!.id));
  assert.ok(logoutAllRows.every((entry) => entry.revokedAt), 'Logout all must revoke every mobile device');

  const expiring = await loginMobile(emails[1]!, 'Synthetic-Mobile-Password-917!', { ip: '198.51.100.47' });
  const expiringHash = (await import('../../src/server/lib/crypto')).sha256Hex(expiring.accessToken);
  const expiringSession = await db.query.mobileSessions.findFirst({ where: eq(mobileSessions.accessTokenHash, expiringHash) });
  assert.ok(expiringSession);
  await db.update(mobileSessions).set({ accessExpiresAt: new Date(Date.now() - 60_000), refreshExpiresAt: new Date(Date.now() - 60_000) }).where(eq(mobileSessions.id, expiringSession.id));
  await db.update(mobileRefreshTokens).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(mobileRefreshTokens.mobileSessionId, expiringSession.id));
  await assert.rejects(() => refreshMobile(expiring.refreshToken, randomUUID(), '198.51.100.48'), (error: unknown) => (error as { status?: number }).status === 401);

  const passwordChangeLogin = await loginMobile(emails[1]!, 'Synthetic-Mobile-Password-917!', { ip: '198.51.100.49' });
  const passwordChangeResponse = await mobileApiPost(new Request('https://example.test/api/v1/auth/change-password', {
    method: 'POST', headers: { authorization: `Bearer ${passwordChangeLogin.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword: 'Synthetic-Mobile-Password-917!', newPassword: 'Synthetic-Mobile-Password-918!', confirmPassword: 'Synthetic-Mobile-Password-918!' }),
  }), { params: Promise.resolve({ path: ['auth', 'change-password'] }) });
  assert.equal(passwordChangeResponse.status, 200);
  const changedPasswordSessions = await db.select().from(mobileSessions).where(eq(mobileSessions.userId, patientB!.id));
  assert.ok(changedPasswordSessions.every((entry) => entry.revokedAt), 'Password change must revoke all device families');
  const roleLogin = await loginMobile(emails[1]!, 'Synthetic-Mobile-Password-918!', { ip: '198.51.100.50' });
  await db.update(users).set({ role: 'ADMIN' }).where(eq(users.id, patientB!.id));
  const roleRevokedSession = await db.query.mobileSessions.findFirst({ where: eq(mobileSessions.accessTokenHash, (await import('../../src/server/lib/crypto')).sha256Hex(roleLogin.accessToken)) });
  assert.ok(roleRevokedSession?.revokedAt, 'Changing patient role must revoke mobile family');
  await assert.rejects(() => authenticateBearer(new Request('https://example.test/api/v1/auth/me', { headers: { authorization: `Bearer ${roleLogin.accessToken}` } })), (error: unknown) => (error as { status?: number }).status === 401);

  await db.update(users).set({ status: 'SUSPENDED' }).where(eq(users.id, patientA!.id));
  const afterSuspension = await db.query.mobileSessions.findFirst({ where: eq(mobileSessions.id, auth.mobileSessionId) });
  assert.ok(afterSuspension?.revokedAt, 'Suspension trigger must revoke mobile session');
  await assert.rejects(() => authenticateBearer(new Request('https://example.test/api/v1/auth/me', { headers: { authorization: `Bearer ${rotated.accessToken}` } })), (error: unknown) => (error as { status?: number }).status === 401 || (error as { status?: number }).status === 403);
  await pool.query('SELECT 1');
});
