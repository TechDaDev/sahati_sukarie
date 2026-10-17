import assert from 'node:assert/strict';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import test from 'node:test';

const testDatabaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
process.env.DATABASE_URL ??= testDatabaseUrl ?? 'postgresql://test:test@127.0.0.1:1/sahati_security_test';
process.env.SESSION_SECRET ??= 'security-test-session-secret-with-32-bytes';
process.env.FIELD_ENCRYPTION_KEY ??= 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
process.env.NATIONAL_ID_PEPPER ??= 'security-test-national-id-pepper-with-32-bytes';
process.env.APP_URL ??= 'https://example.test';
process.env.EMAIL_OTP_ENABLED = 'true';
process.env.EMAIL_ACTIVATION_REQUIRED = 'true';
process.env.EMAIL_PASSWORD_RECOVERY_ENABLED = 'true';
process.env.RESEND_API_KEY = 'test-placeholder';
process.env.RESEND_FROM_EMAIL = 'noreply@example.invalid';

test('OTP digest binds challenge, purpose, account, and code', async () => {
  const { otpDigest } = await import('../../src/server/services/email-otp');
  const digest = otpDigest('challenge-1', 'ACCOUNT_ACTIVATION', 'user-1', '123456');
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, otpDigest('challenge-2', 'ACCOUNT_ACTIVATION', 'user-1', '123456'));
  assert.notEqual(digest, otpDigest('challenge-1', 'PASSWORD_RESET', 'user-1', '123456'));
  assert.notEqual(digest, otpDigest('challenge-1', 'ACCOUNT_ACTIVATION', 'user-2', '123456'));
  assert.notEqual(digest, otpDigest('challenge-1', 'ACCOUNT_ACTIVATION', 'user-1', '654321'));
});

test('OTP email template uses Arabic RTL and contains no medical details', async () => {
  const { buildEmailOtpTemplate } = await import('../../src/server/services/email-otp');
  const template = buildEmailOtpTemplate('001234', 'PASSWORD_RESET');
  assert.match(template.html, /lang="ar" dir="rtl"/);
  assert.match(template.html, /001234/);
  assert.match(template.html, /خمس دقائق/);
  assert.doesNotMatch(template.html, /glucose|diabetes|سكر الدم|قياس/iu);
});

test('legacy administrator recovery endpoints stay retired', async () => {
  const [{ POST: generateAdminRecoveryCode }, { POST: redeemLegacyRecoveryCode }] = await Promise.all([
    import('../../src/app/api/admin/password-requests/generate-code/route'),
    import('../../src/app/api/redeem-recovery/route'),
  ]);
  const [adminResponse, publicResponse] = await Promise.all([
    generateAdminRecoveryCode(),
    redeemLegacyRecoveryCode(),
  ]);
  assert.equal(adminResponse.status, 410);
  assert.equal(publicResponse.status, 410);
});

test('email OTP activation, limits, replay, reset, and session revocation (isolated PostgreSQL only)', async (t) => {
  if (!testDatabaseUrl) return t.skip('Set SECURITY_TEST_DATABASE_URL to an isolated local PostgreSQL database.');
  const databaseUrl = new URL(testDatabaseUrl);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname), 'Refusing OTP tests against non-local database');
  assert.match(databaseUrl.pathname, /security[_-]test/i, 'Refusing database without security_test name');

  const [{ and, desc, eq, inArray }, { db, pool }, schema, auth, authService, otp, mobileAuth, registrationRoute, forgotRoute, adminStatusRoute, crypto, adminInvitation] = await Promise.all([
    import('drizzle-orm'),
    import('../../src/server/db'),
    import('../../src/server/db/schema'),
    import('../../src/server/auth/session'),
    import('../../src/server/services/auth-service'),
    import('../../src/server/services/email-otp'),
    import('../../src/server/services/mobile-auth'),
    import('../../src/app/api/auth/register/route'),
    import('../../src/app/api/forgot-password/route'),
    import('../../src/app/api/admin/users/[id]/status/route'),
    import('../../src/server/lib/crypto'),
    import('../../src/server/services/admin-invitation'),
  ]);
  const { adminInvitations, auditLogs, emailOtpChallenges, mobileSessions, passwordResetAuthorizations, rateLimitCounters, sessions, users } = schema;
  const { ApiError, createSession, hashPassword, verifyPassword, withMobileSession } = auth;
  const { authenticate } = authService;
  const { completePasswordReset, otpDigest, requestActivationOtp, verifyEmailOtp } = otp;
  const { loginMobile } = mobileAuth;
  const { POST: register } = registrationRoute;
  const { POST: forgotPassword } = forgotRoute;
  const { POST: changeAccountStatus } = adminStatusRoute;
  const { sha256Hex } = crypto;
  const { acceptAdminInvitation } = adminInvitation;

  const originalFetch = globalThis.fetch;
  const delivered: Array<{ html: string; to: string[] }> = [];
  let providerMode: 'success' | 'timeout' | 'rejection' = 'success';
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== 'https://api.resend.com/emails') return originalFetch(input, init);
    if (providerMode === 'timeout') throw new TypeError('synthetic provider timeout');
    if (providerMode === 'rejection') {
      return new Response(JSON.stringify({ name: 'validation_error', message: 'synthetic provider rejection' }), {
        status: 422, headers: { 'content-type': 'application/json' },
      });
    }
    const payload = JSON.parse(String(init?.body)) as { html: string; to: string[] };
    delivered.push(payload);
    return new Response(JSON.stringify({ id: `mock-message-${delivered.length}` }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };

  const ownedUserIds: string[] = [];
  const cleanupKeys = new Set<string>();
  const addRateKeys = (userId: string, email: string, ip: string) => {
    const secret = process.env.SESSION_SECRET!;
    const ipHash = createHmac('sha256', secret).update(ip).digest('hex');
    const emailHash = createHmac('sha256', secret).update(email.toLowerCase()).digest('hex');
    for (const key of [
      `register:${ip}`, `login:${ip}`, `mobile-login:${ip}`, `forgot:${ip}`,
      `email-otp-ip:${ipHash}`, `email-otp-account:${userId}`, `email-otp-email:${emailHash}`,
      `email-otp-verify-ip:${ipHash}`, `activation-resend-ip:${ipHash}`, `activation-resend-email:${emailHash}`,
    ]) cleanupKeys.add(key);
  };
  const makeUser = async (email: string, activationRequired = true) => {
    const [user] = await db.insert(users).values({
      email, passwordHash: await hashPassword('Synthetic-OTP-Password-917!'), role: 'PATIENT', status: 'ACTIVE',
      emailActivationRequired: activationRequired,
    }).returning({ id: users.id, email: users.email });
    ownedUserIds.push(user!.id);
    return user!;
  };
  const makeChallenge = async (userId: string, purpose: 'ACCOUNT_ACTIVATION' | 'PASSWORD_RESET', code: string, overrides: { expiresAt?: Date; attemptCount?: number } = {}) => {
    const [challenge] = await db.insert(emailOtpChallenges).values({
      userId, purpose, codeHash: 'pending', expiresAt: overrides.expiresAt ?? new Date(Date.now() + 5 * 60_000),
      resendAvailableAt: new Date(Date.now() + 60_000), deliveryStatus: 'SENT', ipHash: 'synthetic-test-ip-hash',
      attemptCount: overrides.attemptCount ?? 0,
    }).returning({ id: emailOtpChallenges.id });
    await db.update(emailOtpChallenges).set({ codeHash: otpDigest(challenge!.id, purpose, userId, code) })
      .where(eq(emailOtpChallenges.id, challenge!.id));
    return challenge!;
  };
  const verify = (email: string, purpose: 'ACCOUNT_ACTIVATION' | 'PASSWORD_RESET', code: string, ip = '198.51.100.101') =>
    verifyEmailOtp({ email, purpose, code, ip });

  try {
    const suffix = randomUUID();
    const email = `otp-activation-${suffix}@example.invalid`;
    const registrationIp = `192.0.2.${randomInt(1, 255)}`;
    const registration = await register(new Request('https://example.test/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': registrationIp },
      body: JSON.stringify({
        fullName: 'Synthetic OTP Patient', gender: 'MALE', dateOfBirth: '1980-01-01', heightCm: 170,
        nationalId: String(randomInt(100_000_000_000, 999_999_999_999)), email, phone: '07000000000',
        password: 'Synthetic-OTP-Password-917!', confirmPassword: 'Synthetic-OTP-Password-917!', nationalIdConsent: true,
      }),
    }));
    assert.equal(registration.status, 200);
    const registrationBody = await registration.json() as { data: { user: { id: string }; activationRequired: boolean } };
    assert.equal(registrationBody.data.activationRequired, true);
    const activationUserId = registrationBody.data.user.id;
    ownedUserIds.push(activationUserId);
    addRateKeys(activationUserId, email, registrationIp);
    addRateKeys(activationUserId, email, '198.51.100.101');
    addRateKeys(activationUserId, email, '192.0.2.200');
    addRateKeys(activationUserId, email, '192.0.2.201');
    const activationUser = await db.query.users.findFirst({ where: eq(users.id, activationUserId) });
    assert.equal(activationUser?.emailActivationRequired, true);
    assert.equal(activationUser?.emailVerifiedAt, null);
    assert.equal(delivered.length, 1);
    assert.deepEqual(delivered[0]?.to, [email]);
    await assert.rejects(() => loginMobile(email, 'Synthetic-OTP-Password-917!', { ip: '192.0.2.201' }),
      (error: unknown) => error instanceof ApiError && error.code === 'EMAIL_VERIFICATION_REQUIRED');
    assert.equal((await db.select({ id: mobileSessions.id }).from(mobileSessions)
      .where(eq(mobileSessions.userId, activationUserId))).length, 0, 'Pending activation must not issue mobile sessions');
    const code = delivered[0]!.html.match(/letter-spacing:8px[^>]*>(\d{6})</)?.[1];
    assert.ok(code, 'Mocked provider payload should contain one six-digit OTP');
    const challenge = await db.query.emailOtpChallenges.findFirst({
      where: and(eq(emailOtpChallenges.userId, activationUserId), eq(emailOtpChallenges.purpose, 'ACCOUNT_ACTIVATION')),
      orderBy: [desc(emailOtpChallenges.createdAt)],
    });
    assert.equal(challenge?.deliveryStatus, 'SENT');
    assert.equal(challenge?.providerMessageId, 'mock-message-1');
    await assert.rejects(authenticate(email, 'Synthetic-OTP-Password-917!', { ip: '192.0.2.200' }),
      (error: unknown) => error instanceof ApiError && error.code === 'EMAIL_VERIFICATION_REQUIRED');
    await assert.rejects(() => verify(email, 'ACCOUNT_ACTIVATION', '000000'),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_CODE');
    const afterBadCode = await db.query.emailOtpChallenges.findFirst({ where: eq(emailOtpChallenges.id, challenge!.id) });
    assert.equal(afterBadCode?.attemptCount, 1);
    await assert.rejects(() => requestActivationOtp(email, registrationIp),
      (error: unknown) => error instanceof ApiError && error.code === 'RESEND_COOLDOWN');
    assert.deepEqual(await verify(email, 'ACCOUNT_ACTIVATION', code), {});
    await assert.rejects(() => verify(email, 'ACCOUNT_ACTIVATION', code),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_CODE');
    const activated = await db.query.users.findFirst({ where: eq(users.id, activationUserId) });
    assert.ok(activated?.emailVerifiedAt);
    const afterActivationLoginGate = await db.query.users.findFirst({ where: eq(users.id, activationUserId) });
    assert.ok(afterActivationLoginGate?.emailVerifiedAt, 'Account is eligible to sign in after OTP verification');

    const registerForProviderFailure = async (delivery: 'timeout' | 'rejection') => {
      const failedEmail = `otp-provider-${delivery}-${suffix}@example.invalid`;
      const ip = `192.0.2.${randomInt(1, 255)}`;
      providerMode = delivery;
      const response = await register(new Request('https://example.test/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip },
        body: JSON.stringify({
          fullName: 'Synthetic Provider Test', gender: 'MALE', dateOfBirth: '1980-01-01', heightCm: 170,
          nationalId: String(randomInt(100_000_000_000, 999_999_999_999)), email: failedEmail, phone: '07000000000',
          password: 'Synthetic-OTP-Password-917!', confirmPassword: 'Synthetic-OTP-Password-917!', nationalIdConsent: true,
        }),
      }));
      providerMode = 'success';
      assert.equal(response.status, 503, `${delivery} must fail closed during registration`);
      assert.equal(response.headers.get('set-cookie'), null, 'Failed delivery must not create a browser session');
      const failedUser = await db.query.users.findFirst({ where: eq(users.email, failedEmail) });
      assert.ok(failedUser?.emailActivationRequired);
      assert.equal(failedUser?.emailVerifiedAt, null);
      ownedUserIds.push(failedUser!.id);
      addRateKeys(failedUser!.id, failedEmail, ip);
      const failedChallenge = await db.query.emailOtpChallenges.findFirst({
        where: and(eq(emailOtpChallenges.userId, failedUser!.id), eq(emailOtpChallenges.purpose, 'ACCOUNT_ACTIVATION')),
      });
      assert.equal(failedChallenge?.deliveryStatus, 'FAILED');
      assert.ok(failedChallenge?.consumedAt, 'Failed delivery must invalidate the undelivered challenge');
      assert.equal((await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, failedUser!.id))).length, 0);
    };
    await registerForProviderFailure('timeout');
    await registerForProviderFailure('rejection');

    const expiredUser = await makeUser(`otp-expired-${suffix}@example.invalid`);
    const expiredChallenge = await makeChallenge(expiredUser.id, 'ACCOUNT_ACTIVATION', '123456', { expiresAt: new Date(Date.now() - 1_000) });
    addRateKeys(expiredUser.id, expiredUser.email, '198.51.100.102');
    await assert.rejects(() => verify(expiredUser.email, 'ACCOUNT_ACTIVATION', '123456', '198.51.100.102'),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_CODE');
    assert.ok((await db.query.emailOtpChallenges.findFirst({ where: eq(emailOtpChallenges.id, expiredChallenge.id) }))?.consumedAt);

    const limitedUser = await makeUser(`otp-limited-${suffix}@example.invalid`);
    const limitedChallenge = await makeChallenge(limitedUser.id, 'ACCOUNT_ACTIVATION', '654321');
    addRateKeys(limitedUser.id, limitedUser.email, '198.51.100.103');
    for (let attempt = 0; attempt < 5; attempt++) {
      await assert.rejects(() => verify(limitedUser.email, 'ACCOUNT_ACTIVATION', '000000', '198.51.100.103'),
        (error: unknown) => error instanceof ApiError && error.code === 'INVALID_CODE');
    }
    const limitedState = await db.query.emailOtpChallenges.findFirst({ where: eq(emailOtpChallenges.id, limitedChallenge.id) });
    assert.equal(limitedState?.attemptCount, 5);
    assert.ok(limitedState?.consumedAt);
    await assert.rejects(() => verify(limitedUser.email, 'ACCOUNT_ACTIVATION', '654321', '198.51.100.103'),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_CODE');

    const concurrentUser = await makeUser(`otp-concurrent-${suffix}@example.invalid`);
    const concurrentChallenge = await makeChallenge(concurrentUser.id, 'ACCOUNT_ACTIVATION', '765432');
    addRateKeys(concurrentUser.id, concurrentUser.email, '198.51.100.104');
    const concurrent = await Promise.allSettled([
      verify(concurrentUser.email, 'ACCOUNT_ACTIVATION', '765432', '198.51.100.104'),
      verify(concurrentUser.email, 'ACCOUNT_ACTIVATION', '765432', '198.51.100.104'),
    ]);
    assert.equal(concurrent.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter((entry) => entry.status === 'rejected').length, 1);
    assert.ok((await db.query.emailOtpChallenges.findFirst({ where: eq(emailOtpChallenges.id, concurrentChallenge.id) }))?.consumedAt);

    const resetUser = await makeUser(`otp-reset-${suffix}@example.invalid`, false);
    addRateKeys(resetUser.id, resetUser.email, '198.51.100.105');
    addRateKeys(resetUser.id, resetUser.email, '198.51.100.106');
    addRateKeys(resetUser.id, resetUser.email, '192.0.2.202');
    addRateKeys(resetUser.id, resetUser.email, '192.0.2.203');
    const forgotRequest = (email: string) => forgotPassword(new Request('https://example.test/api/forgot-password', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.105' },
      body: JSON.stringify({ email }),
    }));
    const knownResetResponse = await forgotRequest(resetUser.email);
    const unknownResetResponse = await forgotRequest(`unknown-${suffix}@example.invalid`);
    assert.equal(knownResetResponse.status, 200);
    assert.equal(unknownResetResponse.status, 200);
    assert.deepEqual(await knownResetResponse.json(), await unknownResetResponse.json(), 'Forgot password response must not reveal account existence');
    assert.equal(delivered.length, 2, 'Known account gets one mocked provider delivery; unknown account gets none');
    const resetCode = delivered[1]!.html.match(/letter-spacing:8px[^>]*>(\d{6})</)?.[1];
    assert.ok(resetCode);
    const resetChallenge = await db.query.emailOtpChallenges.findFirst({
      where: and(eq(emailOtpChallenges.userId, resetUser.id), eq(emailOtpChallenges.purpose, 'PASSWORD_RESET')),
      orderBy: [desc(emailOtpChallenges.createdAt)],
    });
    assert.equal(resetChallenge?.deliveryStatus, 'SENT');
    assert.equal(resetChallenge?.providerMessageId, 'mock-message-2');
    const browserSession = await createSession(resetUser.id);
    const mobile = await loginMobile(resetUser.email, 'Synthetic-OTP-Password-917!', { ip: '198.51.100.106', deviceLabel: 'Synthetic OTP test' });
    const verifiedReset = await verify(resetUser.email, 'PASSWORD_RESET', resetCode!, '198.51.100.105');
    assert.ok(verifiedReset.resetAuthorization);
    const authorization = await db.query.passwordResetAuthorizations.findFirst({ where: eq(passwordResetAuthorizations.userId, resetUser.id) });
    assert.ok(authorization);
    assert.notEqual(authorization.tokenHash, verifiedReset.resetAuthorization);
    await completePasswordReset({ authorization: verifiedReset.resetAuthorization!, newPassword: 'Synthetic-OTP-Password-918!', ip: '198.51.100.105' });
    await assert.rejects(() => completePasswordReset({ authorization: verifiedReset.resetAuthorization!, newPassword: 'Synthetic-OTP-Password-919!', ip: '198.51.100.105' }),
      (error: unknown) => error instanceof ApiError && error.code === 'RESET_AUTHORIZATION_INVALID');
    const [browserState] = await db.select({ revokedAt: sessions.revokedAt }).from(sessions)
      .where(eq(sessions.id, sha256Hex(browserSession.token)));
    assert.ok(browserState?.revokedAt, 'Password reset revokes browser sessions');
    const [mobileState] = await db.select({ revokedAt: mobileSessions.revokedAt }).from(mobileSessions)
      .where(eq(mobileSessions.accessTokenHash, sha256Hex(mobile.accessToken)));
    assert.ok(mobileState?.revokedAt, 'Password reset revokes mobile sessions');
    await assert.rejects(authenticate(resetUser.email, 'Synthetic-OTP-Password-917!', { ip: '192.0.2.202' }),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_CREDENTIALS');
    const resetUserAfter = await db.query.users.findFirst({ where: eq(users.id, resetUser.id) });
    assert.ok(await verifyPassword('Synthetic-OTP-Password-918!', resetUserAfter!.passwordHash));
    assert.equal(await verifyPassword('Synthetic-OTP-Password-917!', resetUserAfter!.passwordHash), false);
    assert.ok((await db.query.emailOtpChallenges.findFirst({ where: eq(emailOtpChallenges.id, resetChallenge.id) }))?.consumedAt);

    const adminEmail = `otp-admin-${suffix}@example.invalid`;
    const [admin] = await db.insert(users).values({
      email: adminEmail, passwordHash: await hashPassword('Synthetic-Admin-Password-917!'), role: 'ADMIN', status: 'ACTIVE',
      mustChangePassword: false,
    }).returning({ id: users.id, email: users.email });
    ownedUserIds.push(admin!.id);
    const suspendedUser = await makeUser(`otp-suspend-${suffix}@example.invalid`, false);
    addRateKeys(suspendedUser.id, suspendedUser.email, '198.51.100.107');
    const adminBrowser = await createSession(admin!.id);
    const targetBrowser = await createSession(suspendedUser.id);
    const targetMobile = await loginMobile(suspendedUser.email, 'Synthetic-OTP-Password-917!', { ip: '198.51.100.107', deviceLabel: 'Synthetic suspension test' });
    const sessionRecord = (user: { id: string; email: string }, role: 'ADMIN' | 'PATIENT', token: string, csrfToken: string) => ({
      sessionId: sha256Hex(token), csrfToken,
      user: { id: user.id, email: user.email, role, status: 'ACTIVE' as const, mustChangePassword: false },
    });
    const adminContext = sessionRecord(admin!, 'ADMIN', adminBrowser.token, adminBrowser.csrfToken);
    const patientContext = sessionRecord(suspendedUser, 'PATIENT', targetBrowser.token, targetBrowser.csrfToken);
    const statusRequest = (action: 'SUSPEND' | 'RESTORE') => new Request(`https://example.test/api/admin/users/${suspendedUser.id}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    });
    const patientDenied = await withMobileSession(patientContext, () => changeAccountStatus(statusRequest('SUSPEND'), { params: Promise.resolve({ id: suspendedUser.id }) }));
    assert.equal(patientDenied.status, 403, 'Patient session cannot use administrator account controls');
    const suspended = await withMobileSession(adminContext, () => changeAccountStatus(statusRequest('SUSPEND'), { params: Promise.resolve({ id: suspendedUser.id }) }));
    assert.equal(suspended.status, 200);
    assert.equal((await db.query.users.findFirst({ where: eq(users.id, suspendedUser.id) }))?.status, 'SUSPENDED');
    const [browserAfterSuspend] = await db.select({ revokedAt: sessions.revokedAt }).from(sessions)
      .where(eq(sessions.id, sha256Hex(targetBrowser.token)));
    const [mobileAfterSuspend] = await db.select({ revokedAt: mobileSessions.revokedAt }).from(mobileSessions)
      .where(eq(mobileSessions.accessTokenHash, sha256Hex(targetMobile.accessToken)));
    assert.ok(browserAfterSuspend?.revokedAt);
    assert.ok(mobileAfterSuspend?.revokedAt);
    const restored = await withMobileSession(adminContext, () => changeAccountStatus(statusRequest('RESTORE'), { params: Promise.resolve({ id: suspendedUser.id }) }));
    assert.equal(restored.status, 200);
    assert.equal((await db.query.users.findFirst({ where: eq(users.id, suspendedUser.id) }))?.status, 'ACTIVE');

    const invitedAdmin = await makeUser(`invite-admin-${suffix}@example.invalid`, false);
    await db.update(users).set({ role: 'ADMIN', mustChangePassword: true }).where(eq(users.id, invitedAdmin.id));
    const invitationIp = '198.51.100.108';
    const invitationIpHash = createHmac('sha256', process.env.SESSION_SECRET!).update(invitationIp).digest('hex');
    cleanupKeys.add(`admin-invitation:${invitationIpHash}`);
    const setupSession = await createSession(invitedAdmin.id);
    const invitationToken = crypto.randomToken();
    const [invitation] = await db.insert(adminInvitations).values({
      userId: invitedAdmin.id, tokenHash: sha256Hex(invitationToken), expiresAt: new Date(Date.now() + 30 * 60_000),
    }).returning({ id: adminInvitations.id });
    assert.ok(invitation);
    await acceptAdminInvitation({ token: invitationToken, newPassword: 'Synthetic-Admin-Setup-918!', ip: invitationIp });
    const configuredAdmin = await db.query.users.findFirst({ where: eq(users.id, invitedAdmin.id) });
    assert.equal(configuredAdmin?.role, 'ADMIN');
    assert.equal(configuredAdmin?.mustChangePassword, false);
    assert.ok(await verifyPassword('Synthetic-Admin-Setup-918!', configuredAdmin!.passwordHash));
    const [setupSessionState] = await db.select({ revokedAt: sessions.revokedAt }).from(sessions)
      .where(eq(sessions.id, sha256Hex(setupSession.token)));
    assert.ok(setupSessionState?.revokedAt, 'Admin invitation acceptance revokes pre-existing sessions');
    await assert.rejects(() => acceptAdminInvitation({ token: invitationToken, newPassword: 'Synthetic-Admin-Setup-919!', ip: invitationIp }),
      (error: unknown) => error instanceof ApiError && error.code === 'INVITATION_INVALID');
  } finally {
    globalThis.fetch = originalFetch;
    for (const userId of ownedUserIds) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    if (cleanupKeys.size) await db.delete(rateLimitCounters).where(inArray(rateLimitCounters.key, [...cleanupKeys]));
    await pool.end();
  }
});
