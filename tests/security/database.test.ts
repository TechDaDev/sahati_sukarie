import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../../src/server/db';
import { auditLogs, glucoseReadings, medications, patientProfiles, passwordRecoveryRequests, passwordRecoveryTokens, rateLimitCounters, sessions, users } from '../../src/server/db/schema';
import { ApiError, checkRateLimit, createSession, hashPassword, verifyPassword } from '../../src/server/auth/session';
import { authenticate } from '../../src/server/services/auth-service';
import { redeemRecoveryCode } from '../../src/server/services/recovery';
import { deleteOwnedRecord, getMedication, listGlucose } from '../../src/server/services/records';
import { randomToken, sha256Hex } from '../../src/server/lib/crypto';
import { blindIndex } from '../../src/server/lib/crypto';
import { POST as register } from '../../src/app/api/auth/register/route';

const testDatabaseUrl = process.env.SECURITY_TEST_DATABASE_URL;

test('database concurrency regressions (isolated local PostgreSQL only)', async (t) => {
  if (!testDatabaseUrl) return t.skip('Set SECURITY_TEST_DATABASE_URL to an isolated local PostgreSQL database.');
  const databaseUrl = new URL(testDatabaseUrl);
  const hostname = databaseUrl.hostname;
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(hostname), 'Refusing security tests against non-local database');
  assert.match(databaseUrl.pathname, /security[_-]test/i, 'Refusing database without security_test name');

  const ownedUserIds: string[] = [];
  const rateKey = `security-test:${randomToken(12)}`;
  const trackedRateKeys = [rateKey];
  const rateLimitedIp = (prefix: 'login' | 'register') => {
    const ip = `192.0.2.${randomInt(1, 255)}`;
    trackedRateKeys.push(`${prefix}:${ip}`);
    return ip;
  };
  try {
    const rateResults = await Promise.all(Array.from({ length: 40 }, () => checkRateLimit({
      key: rateKey, limit: 7, windowSeconds: 60,
    })));
    assert.equal(rateResults.filter(Boolean).length, 7, 'Concurrent requests must not exceed configured rate limit');

    const passwordHash = await hashPassword('Synthetic-Initial-Password-917!');
    const [loginUser] = await db.insert(users).values({
      email: `security-login-${randomToken(8)}@example.invalid`, passwordHash, role: 'PATIENT', status: 'ACTIVE',
    }).returning({ id: users.id, email: users.email });
    ownedUserIds.push(loginUser!.id);
    const outcomes = await Promise.allSettled(Array.from({ length: 10 }, () => authenticate(
      loginUser!.email,
      'Synthetic-Wrong-Password-917!',
      { ip: rateLimitedIp('login') },
    )));
    assert.ok(outcomes.every((item) => item.status === 'rejected'));
    const [loginState] = await db.select({ count: users.failedLoginCount, locked: users.lockedUntil })
      .from(users).where(eq(users.id, loginUser!.id));
    assert.equal(loginState!.count, 5, 'Concurrent failures must atomically reach and cap lockout threshold');
    assert.ok(loginState!.locked);
    await assert.rejects(authenticate(loginUser!.email, 'Synthetic-Initial-Password-917!', {
      ip: rateLimitedIp('login'),
    }), (error: unknown) => error instanceof ApiError && error.status === 429);

    const [roleUser] = await db.insert(users).values({
      email: `security-role-${randomToken(8)}@example.invalid`, passwordHash, role: 'PATIENT', status: 'ACTIVE',
    }).returning({ id: users.id, email: users.email });
    ownedUserIds.push(roleUser!.id);
    const roleMismatch = await authenticate(roleUser!.email, 'Synthetic-Initial-Password-917!', {
      ip: rateLimitedIp('login'), requireRole: 'ADMIN',
    }).then(() => null, (error: ApiError) => ({ status: error.status, code: error.code, message: error.message }));
    const badPassword = await authenticate(roleUser!.email, 'Synthetic-Wrong-Password-917!', {
      ip: rateLimitedIp('login'), requireRole: 'ADMIN',
    }).then(() => null, (error: ApiError) => ({ status: error.status, code: error.code, message: error.message }));
    assert.deepEqual(roleMismatch, badPassword, 'Wrong portal and wrong password must return identical public errors');

    const [ownerA] = await db.insert(users).values({
      email: `security-owner-a-${randomToken(8)}@example.invalid`, passwordHash, role: 'PATIENT', status: 'ACTIVE',
    }).returning({ id: users.id });
    const [ownerB] = await db.insert(users).values({
      email: `security-owner-b-${randomToken(8)}@example.invalid`, passwordHash, role: 'PATIENT', status: 'ACTIVE',
    }).returning({ id: users.id });
    ownedUserIds.push(ownerA!.id, ownerB!.id);
    const createdSession = await createSession(ownerA!.id);
    const [sessionExpiry] = await db.select({ idle: sessions.idleExpiresAt, absolute: sessions.absoluteExpiresAt })
      .from(sessions).where(eq(sessions.id, sha256Hex(createdSession.token)));
    assert.equal(createdSession.expiresAt.getTime(), sessionExpiry!.absolute.getTime(), 'Cookie expiry must use absolute expiry');
    assert.ok(sessionExpiry!.idle <= sessionExpiry!.absolute, 'Idle expiry must not exceed absolute expiry');
    const createProfile = (userId: string) => db.insert(patientProfiles).values({
      userId, fullName: 'Synthetic Patient', gender: 'MALE', dateOfBirth: '1980-01-01', heightCm: '170.0',
      nationalIdProtected: 'synthetic-only', nationalIdHash: randomToken(32), nationalIdLast4: '1234',
      phoneNumber: '+9647000000000', phoneNorm: '+9647000000000',
    }).returning({ id: patientProfiles.id });
    const [profileA] = await createProfile(ownerA!.id);
    const [profileB] = await createProfile(ownerB!.id);
    const registeredNationalId = '123456789012';
    await db.update(patientProfiles).set({ nationalIdHash: blindIndex(registeredNationalId) })
      .where(eq(patientProfiles.id, profileA!.id));
    const registrationPayload = (email: string, nationalId: string) => ({
      fullName: 'Synthetic New Patient', gender: 'MALE', dateOfBirth: '1980-01-01', heightCm: 170,
      nationalId, email, phone: '07000000000', password: 'Synthetic-Registration-917!',
      confirmPassword: 'Synthetic-Registration-917!', nationalIdConsent: true,
    });
    const registerAttempt = async (email: string, nationalId: string) => {
      const response = await register(new Request('https://example.test/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': rateLimitedIp('register') },
        body: JSON.stringify(registrationPayload(email, nationalId)),
      }));
      return { status: response.status, body: await response.json() };
    };
    const duplicateEmail = await registerAttempt((await db.query.users.findFirst({ where: eq(users.id, ownerA!.id) }))!.email, '223456789012');
    const duplicateNationalId = await registerAttempt(`unique-${randomToken(8)}@example.invalid`, registeredNationalId);
    assert.equal(duplicateEmail.status, 409);
    assert.deepEqual(duplicateNationalId, duplicateEmail, 'Registration must not distinguish duplicate national ID from duplicate email');
    const [recordA] = await db.insert(glucoseReadings).values({
      patientId: profileA!.id, glucoseValue: '111', glucoseUnit: 'MG_DL', standardizedValueMgdl: '111',
      measurementDatetime: new Date(),
    }).returning({ id: glucoseReadings.id });
    const [recordB] = await db.insert(glucoseReadings).values({
      patientId: profileB!.id, glucoseValue: '222', glucoseUnit: 'MG_DL', standardizedValueMgdl: '222',
      measurementDatetime: new Date(),
    }).returning({ id: glucoseReadings.id });
    const [medicationB] = await db.insert(medications).values({
      patientId: profileB!.id, medicationName: 'Synthetic medication',
    }).returning({ id: medications.id });
    assert.deepEqual((await listGlucose(profileA!.id)).map((row) => row.id), [recordA!.id]);
    await assert.rejects(deleteOwnedRecord(glucoseReadings, profileA!.id, recordB!.id), (error: unknown) => error instanceof ApiError && error.status === 404);
    await assert.rejects(getMedication(profileA!.id, medicationB!.id), (error: unknown) => error instanceof ApiError && error.status === 404);

    const [recoveryUser] = await db.insert(users).values({
      email: `security-recovery-${randomToken(8)}@example.invalid`, passwordHash, role: 'PATIENT', status: 'ACTIVE',
    }).returning({ id: users.id, email: users.email });
    ownedUserIds.push(recoveryUser!.id);
    const [recoveryRequest] = await db.insert(passwordRecoveryRequests).values({
      patientUserId: recoveryUser!.id, status: 'VERIFIED', requestIp: '127.0.0.1',
    }).returning({ id: passwordRecoveryRequests.id });
    const code = '86753091';
    const [token] = await db.insert(passwordRecoveryTokens).values({
      requestId: recoveryRequest!.id, tokenHash: sha256Hex(code),
      expiresAt: new Date(Date.now() + 60_000), maxAttempts: 5,
    }).returning({ id: passwordRecoveryTokens.id });
    const sessionId = sha256Hex(randomToken(32));
    await db.insert(sessions).values({
      id: sessionId, userId: recoveryUser!.id, csrfToken: randomToken(24),
      idleExpiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: new Date(Date.now() + 120_000),
    });

    const redemptions = await Promise.allSettled([
      redeemRecoveryCode({ email: recoveryUser!.email, code, newPassword: 'Synthetic-Recovered-Password-1!', ip: '127.0.0.1' }),
      redeemRecoveryCode({ email: recoveryUser!.email, code, newPassword: 'Synthetic-Recovered-Password-2!', ip: '127.0.0.1' }),
    ]);
    assert.equal(redemptions.filter((item) => item.status === 'fulfilled').length, 1, 'A recovery token must redeem once under concurrency');
    const [tokenState] = await db.select({ usedAt: passwordRecoveryTokens.usedAt })
      .from(passwordRecoveryTokens).where(eq(passwordRecoveryTokens.id, token!.id));
    assert.ok(tokenState!.usedAt);
    const [requestState] = await db.select({ status: passwordRecoveryRequests.status })
      .from(passwordRecoveryRequests).where(eq(passwordRecoveryRequests.id, recoveryRequest!.id));
    assert.equal(requestState!.status, 'COMPLETED');
    const [sessionState] = await db.select({ revokedAt: sessions.revokedAt })
      .from(sessions).where(eq(sessions.id, sessionId));
    assert.ok(sessionState!.revokedAt, 'Recovery must revoke existing sessions in same transaction');
    const [storedPassword] = await db.select({ passwordHash: users.passwordHash })
      .from(users).where(eq(users.id, recoveryUser!.id));
    assert.ok(await verifyPassword('Synthetic-Recovered-Password-1!', storedPassword!.passwordHash)
      || await verifyPassword('Synthetic-Recovered-Password-2!', storedPassword!.passwordHash));

    const [attemptUser] = await db.insert(users).values({
      email: `security-attempt-${randomToken(8)}@example.invalid`, passwordHash, role: 'PATIENT', status: 'ACTIVE',
    }).returning({ id: users.id, email: users.email });
    ownedUserIds.push(attemptUser!.id);
    const [attemptRequest] = await db.insert(passwordRecoveryRequests).values({
      patientUserId: attemptUser!.id, status: 'VERIFIED', requestIp: '127.0.0.1',
    }).returning({ id: passwordRecoveryRequests.id });
    const [attemptToken] = await db.insert(passwordRecoveryTokens).values({
      requestId: attemptRequest!.id, tokenHash: sha256Hex('86753092'),
      expiresAt: new Date(Date.now() + 60_000), maxAttempts: 5,
    }).returning({ id: passwordRecoveryTokens.id });
    await Promise.allSettled(Array.from({ length: 12 }, () => redeemRecoveryCode({
      email: attemptUser!.email, code: '00000000', newPassword: 'Synthetic-Recovered-Password-3!', ip: '127.0.0.1',
    })));
    const [attemptState] = await db.select({ count: passwordRecoveryTokens.attemptCount, usedAt: passwordRecoveryTokens.usedAt })
      .from(passwordRecoveryTokens).where(eq(passwordRecoveryTokens.id, attemptToken!.id));
    assert.equal(attemptState!.count, 5, 'Concurrent invalid codes must not exceed maximum attempts');
    assert.ok(attemptState!.usedAt, 'Recovery token must invalidate at attempt limit');
  } finally {
    for (const userId of ownedUserIds) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    for (const key of trackedRateKeys) await db.delete(rateLimitCounters).where(eq(rateLimitCounters.key, key));
    await pool.end();
  }
});
