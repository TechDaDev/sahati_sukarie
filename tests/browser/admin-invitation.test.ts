import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
process.env.DATABASE_URL ??= databaseUrl ?? 'postgresql://test:test@127.0.0.1:1/sahati_security_test';
process.env.SESSION_SECRET ??= 'security-test-session-secret-with-32-bytes';
process.env.FIELD_ENCRYPTION_KEY ??= 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
process.env.NATIONAL_ID_PEPPER ??= 'security-test-national-id-pepper-with-32-bytes';
process.env.APP_URL ??= 'https://example.test';
process.env.EMAIL_OTP_ENABLED = 'false';
process.env.EMAIL_ACTIVATION_REQUIRED = 'false';
process.env.EMAIL_PASSWORD_RECOVERY_ENABLED = 'false';
process.env.RESEND_API_KEY = 'test-placeholder';
process.env.RESEND_FROM_EMAIL = 'noreply@example.invalid';

const password = 'Synthetic-Admin-Password-731!';

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve local test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local Next.js server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
    } catch { /* Server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Local Next.js server did not become ready.');
}

test('authentication pages hydrate under CSP and administrator invitation setup works', async (t) => {
  if (!databaseUrl) return t.skip('Set SECURITY_TEST_DATABASE_URL to an isolated local PostgreSQL database.');
  const parsedDatabaseUrl = new URL(databaseUrl);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname), 'Refusing browser test against non-local database');
  assert.match(parsedDatabaseUrl.pathname, /security[_-]test/i, 'Refusing database without security_test name');

  const [{ eq, inArray }, { db, pool }, schema, auth, crypto, puppeteerModule] = await Promise.all([
    import('drizzle-orm'),
    import('../../src/server/db'),
    import('../../src/server/db/schema'),
    import('../../src/server/auth/session'),
    import('../../src/server/lib/crypto'),
    import('puppeteer'),
  ]);
  const { adminInvitations, auditLogs, mobileSessions, rateLimitCounters, sessions, users } = schema;
  const { hashPassword, verifyPassword } = auth;
  const { randomToken, sha256Hex } = crypto;
  const puppeteer = puppeteerModule.default;
  const suffix = randomUUID();
  const invitationToken = randomToken();
  const invitationIp = `198.51.100.${(Number.parseInt(suffix.slice(0, 2), 16) % 253) + 1}`;
  const invitationIpHash = createHmac('sha256', process.env.SESSION_SECRET!).update(invitationIp).digest('hex');
  const validEmail = `browser-invite-${suffix}@example.invalid`;
  const expiredEmail = `browser-expired-${suffix}@example.invalid`;
  const userIds: string[] = [];
  let server: ChildProcess | undefined;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  let baseUrl: string | undefined;

  try {
    const [validAdmin] = await db.insert(users).values({
      email: validEmail,
      passwordHash: await hashPassword('Synthetic-Initial-Password-642!'),
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: true,
    }).returning({ id: users.id });
    assert.ok(validAdmin);
    userIds.push(validAdmin.id);
    await db.insert(adminInvitations).values({
      userId: validAdmin.id,
      tokenHash: sha256Hex(invitationToken),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });

    const [expiredAdmin] = await db.insert(users).values({
      email: expiredEmail,
      passwordHash: await hashPassword('Synthetic-Initial-Password-642!'),
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: true,
    }).returning({ id: users.id });
    assert.ok(expiredAdmin);
    userIds.push(expiredAdmin.id);
    const expiredToken = randomToken();
    await db.insert(adminInvitations).values({
      userId: expiredAdmin.id,
      tokenHash: sha256Hex(expiredToken),
      expiresAt: new Date(Date.now() - 60_000),
    });

    const port = await availablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    const nextCli = path.resolve('node_modules/next/dist/bin/next');
    server = spawn(process.execPath, [nextCli, 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_URL: 'https://example.test',
        EMAIL_OTP_ENABLED: 'false',
        EMAIL_ACTIVATION_REQUIRED: 'false',
        EMAIL_PASSWORD_RECOVERY_ENABLED: 'false',
        RESEND_API_KEY: 'test-placeholder',
        RESEND_FROM_EMAIL: 'noreply@example.invalid',
      },
      stdio: 'ignore',
    });
    await waitForServer(`${baseUrl}/admin/accept-invitation`, server);

    const chromiumPath = process.env.SECURITY_TEST_CHROMIUM_PATH
      ?? process.env.CHROMIUM_EXECUTABLE_PATH
      ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
    browser = await puppeteer.launch({
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error instanceof Error ? error.name : 'pageerror'));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) browserErrors.push(message.text().slice(0, 160));
    });
    await page.setExtraHTTPHeaders({ 'x-real-ip': invitationIp });
    const clipboardSession = await page.createCDPSession();
    await clipboardSession.send('Browser.grantPermissions', { origin: baseUrl, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });

    const authPages = [
      { path: '/login', selector: '#email' },
      { path: '/register', selector: '#fullName' },
      { path: '/verify-email', selector: '#email' },
      { path: '/forgot-password', selector: '#email' },
      { path: '/reset-password', selector: '#email' },
      { path: '/admin/accept-invitation', selector: '#newPassword' },
      { path: '/admin/login', selector: '#admin-email' },
    ];
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844, isMobile: true, hasTouch: true },
    ]) {
      await page.setViewport(viewport);
      for (const route of authPages) {
        const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle0' });
        assert.equal(response?.status(), 200, `${route.path} loads at ${viewport.width}px.`);
        const csp = response?.headers()['content-security-policy'] ?? '';
        const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
        assert.ok(nonce, `${route.path} CSP carries a nonce.`);
        assert.doesNotMatch(csp.match(/script-src[^;]*/)?.[0] ?? '', /unsafe-inline|unsafe-eval/);
        const nonces = await page.$$eval('script[src]', (scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
        assert.ok(nonces.length > 0 && nonces.every((scriptNonce) => scriptNonce === nonce), `${route.path} scripts match CSP nonce.`);
        const layout = await page.evaluate(() => ({
          direction: document.documentElement.dir,
          width: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
        }));
        assert.equal(layout.direction, 'rtl', `${route.path} keeps Arabic RTL layout.`);
        assert.ok(layout.width <= layout.viewport + 1, `${route.path} has no horizontal overflow at ${viewport.width}px.`);
        await page.waitForSelector(route.selector, { timeout: 5_000 });
        const input = page.locator(route.selector);
        const disabled = await page.$eval(route.selector, (element) => (element as HTMLInputElement).disabled);
        if (!disabled) {
          const probe = route.selector === '#fullName' ? 'Synthetic Audit' : `audit-${suffix}@example.invalid`;
          await input.fill(probe);
          assert.equal(await page.$eval(route.selector, (element) => (element as HTMLInputElement).value), probe, `${route.path} accepts input.`);
        }
      }
    }
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle0' });
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('[role="alert"]', { visible: true, timeout: 5_000 });
    assert.ok((await page.$eval('[role="alert"]', (element) => element.textContent))?.trim(), 'Registration validation shows feedback without submitting incomplete data.');
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
    await page.locator('a[href="/forgot-password"]').click();
    await page.waitForFunction(() => location.pathname === '/forgot-password', { timeout: 5_000 });
    assert.ok(await page.$('#email'), 'Client-side navigation reaches Forgot Password.');
    await page.goBack({ waitUntil: 'networkidle0' });
    assert.equal(new URL(page.url()).pathname, '/login', 'Browser back returns to Login.');
    await page.goForward({ waitUntil: 'networkidle0' });
    assert.equal(new URL(page.url()).pathname, '/forgot-password', 'Browser forward returns to Forgot Password.');

    await page.goto(`${baseUrl}/admin/accept-invitation#token=${invitationToken}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => {
      const input = document.querySelector<HTMLInputElement>('#newPassword');
      return input !== null && !input.disabled;
    }, { timeout: 10_000 });

    const fieldState = await page.evaluate(() => {
      const passwordInput = document.querySelector<HTMLInputElement>('#newPassword');
      const confirmInput = document.querySelector<HTMLInputElement>('#confirmPassword');
      const scriptNonces = [...document.querySelectorAll('script[src]')].map((script) => (script as HTMLScriptElement).nonce);
      return {
        dir: document.documentElement.dir,
        password: passwordInput && { disabled: passwordInput.disabled, readOnly: passwordInput.readOnly, type: passwordInput.type, autoComplete: passwordInput.autocomplete, pointerEvents: getComputedStyle(passwordInput).pointerEvents },
        confirm: confirmInput && { disabled: confirmInput.disabled, readOnly: confirmInput.readOnly, type: confirmInput.type, autoComplete: confirmInput.autocomplete, pointerEvents: getComputedStyle(confirmInput).pointerEvents },
        labels: Boolean(document.querySelector('label[for="newPassword"]') && document.querySelector('label[for="confirmPassword"]')),
        scriptNonces,
        hashCleared: location.hash === '',
      };
    });
    assert.equal(fieldState.dir, 'rtl');
    assert.deepEqual(fieldState.password, { disabled: false, readOnly: false, type: 'password', autoComplete: 'new-password', pointerEvents: 'auto' });
    assert.deepEqual(fieldState.confirm, { disabled: false, readOnly: false, type: 'password', autoComplete: 'new-password', pointerEvents: 'auto' });
    assert.equal(fieldState.labels, true, 'Both fields have accessible labels.');
    assert.ok(fieldState.hashCleared, 'Invitation token is removed from the address bar after capture.');
    assert.ok(fieldState.scriptNonces.length > 0 && fieldState.scriptNonces.every(Boolean), 'Hydrated client scripts carry request CSP nonces.');

    const passwordInput = page.locator('#newPassword');
    const confirmInput = page.locator('#confirmPassword');
    const inputValue = (selector: string) => page.$eval(selector, (element) => (element as HTMLInputElement).value);
    await passwordInput.click();
    await page.keyboard.type('Keyboard-Password-431!');
    assert.equal(await inputValue('#newPassword'), 'Keyboard-Password-431!');

    await passwordInput.click();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.evaluate(async () => navigator.clipboard.writeText('Pasted-Password-532!'));
    await page.keyboard.down('Control');
    await page.keyboard.press('V');
    await page.keyboard.up('Control');
    assert.equal(await inputValue('#newPassword'), 'Pasted-Password-532!');

    await passwordInput.fill('');
    await page.focus('#newPassword');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id), 'confirmPassword', 'Tab moves focus to confirmation field.');
    await page.keyboard.type('Confirm-Password-633!');
    assert.equal(await inputValue('#confirmPassword'), 'Confirm-Password-633!');

    const acceptUrl = `${baseUrl}/api/admin-invitations/accept`;
    const submit = async () => {
      const responsePromise = page.waitForResponse((response) => response.url() === acceptUrl && response.request().method() === 'POST');
      await page.locator('button[type="submit"]').click();
      const response = await responsePromise;
      return { status: response.status(), body: JSON.parse(response.request().postData() ?? '{}') as Record<string, unknown> };
    };
    const waitForError = async () => {
      await page.waitForSelector('[role="alert"]', { visible: true, timeout: 5_000 });
      assert.ok((await page.$eval('[role="alert"]', (element) => element.textContent))?.trim(), 'Validation feedback is visible.');
    };

    for (const selector of ['#newPassword', '#confirmPassword']) {
      await page.focus(selector);
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
    }
    const missing = await submit();
    assert.equal(missing.status, 400, 'Missing password is rejected.');
    assert.equal(await inputValue('#newPassword'), '');
    assert.equal(await inputValue('#confirmPassword'), '');
    await waitForError();

    await passwordInput.fill('short');
    await confirmInput.fill('short');
    const tooShort = await submit();
    assert.equal(tooShort.status, 400, 'Password below minimum requirements is rejected.');
    await waitForError();

    await passwordInput.fill(password);
    await confirmInput.fill('Synthetic-Admin-Password-732!');
    const mismatch = await submit();
    assert.equal(mismatch.status, 400, 'Mismatched confirmation is rejected.');
    await waitForError();

    await passwordInput.fill(password);
    await confirmInput.fill(password);
    const success = await submit();
    assert.equal(success.status, 200, 'Valid password sets up the synthetic administrator.');
    await page.waitForFunction(() => document.body.innerText.includes('اكتمل إعداد الحساب'), { timeout: 5_000 });

    const configuredAdmin = await db.query.users.findFirst({ where: eq(users.id, validAdmin.id) });
    assert.equal(configuredAdmin?.role, 'ADMIN');
    assert.equal(configuredAdmin?.mustChangePassword, false);
    assert.ok(await verifyPassword(password, configuredAdmin!.passwordHash));
    const [consumedInvitation] = await db.select({ consumedAt: adminInvitations.consumedAt })
      .from(adminInvitations).where(eq(adminInvitations.userId, validAdmin.id));
    assert.ok(consumedInvitation?.consumedAt, 'Successful setup consumes invitation.');

    const post = (token: string, newPassword: string, confirmPassword: string) => fetch(acceptUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': invitationIp },
      body: JSON.stringify({ token, newPassword, confirmPassword }),
    });
    const invalid = await post(randomToken(), password, password);
    assert.equal(invalid.status, 400, 'Invalid invitation is rejected.');
    assert.equal((await invalid.json() as { code?: string }).code, 'INVITATION_INVALID');
    const expired = await post(expiredToken, password, password);
    assert.equal(expired.status, 400, 'Expired invitation is rejected.');
    assert.equal((await expired.json() as { code?: string }).code, 'INVITATION_INVALID');
    const replay = await post(invitationToken, 'Synthetic-Admin-Password-734!', 'Synthetic-Admin-Password-734!');
    assert.equal(replay.status, 400, 'Consumed invitation cannot be replayed.');
    assert.equal((await replay.json() as { code?: string }).code, 'INVITATION_INVALID');

    const unauthenticatedAdminApi = await fetch(`${baseUrl}/api/admin/users`);
    assert.equal(unauthenticatedAdminApi.status, 401, 'Unauthenticated visitor cannot access administrator API.');

    await page.goto(`${baseUrl}/forgot-password`, { waitUntil: 'networkidle0' });
    const recoveryNonces = await page.$$eval('script[src]', (scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
    assert.ok(recoveryNonces.length > 0 && recoveryNonces.every(Boolean), 'Forgot Password client scripts carry request CSP nonces.');
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('#email') !== null);
    await page.locator('#email').click();
    await page.keyboard.type(`synthetic-recovery-${suffix}@example.invalid`);
    const recoveryResponsePromise = page.waitForResponse((response) => response.url() === `${baseUrl}/api/forgot-password` && response.request().method() === 'POST');
    await page.locator('button[type="submit"]').click();
    const recoveryResponse = await recoveryResponsePromise;
    assert.equal(recoveryResponse.status(), 200, 'Synthetic Forgot Password request receives the generic response.');
    await page.waitForFunction(() => document.body.innerText.includes('تم استلام الطلب'), { timeout: 5_000 });

    const resetResponse = await page.goto(`${baseUrl}/reset-password`, { waitUntil: 'networkidle0' });
    assert.equal(resetResponse?.status(), 200, 'Reset Password page loads.');
    const resetHeaders = resetResponse?.headers() ?? {};
    assert.match(resetHeaders['cache-control'] ?? '', /private|no-cache|no-store/, 'Reset Password page is not publicly cached.');
    assert.doesNotMatch(resetHeaders['cache-control'] ?? '', /s-maxage=\d+/, 'Reset Password page has no shared cache lifetime.');
    const resetCsp = resetHeaders['content-security-policy'] ?? '';
    const resetNonce = resetCsp.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(resetNonce, 'Reset Password response CSP contains a nonce.');
    assert.doesNotMatch(resetCsp.match(/script-src[^;]*/)?.[0] ?? '', /unsafe-inline|unsafe-eval/, 'Script CSP does not weaken nonce policy.');
    const resetScriptNonces = await page.$$eval('script[src]', (scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
    assert.ok(resetScriptNonces.length > 0 && resetScriptNonces.every((nonce) => nonce === resetNonce), 'Reset Password scripts match response CSP nonce.');
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('#email') !== null);
    await page.locator('#email').click();
    await page.keyboard.type(`synthetic-reset-${suffix}@example.invalid`);
    assert.equal(await page.$eval('button[type="button"]', (button) => !(button as HTMLButtonElement).disabled), true, 'Reset resend enables after email input.');
    const resetResendPromise = page.waitForResponse((response) => response.url() === `${baseUrl}/api/forgot-password` && response.request().method() === 'POST');
    await page.locator('button[type="button"]').click();
    const resetResendResponse = await resetResendPromise;
    assert.equal(resetResendResponse.status(), 200, 'Reset resend handler returns the generic response with email disabled.');
    await page.waitForFunction(() => document.body.innerText.includes('إذا كان البريد مسجلًا'), { timeout: 5_000 });
    const refreshedReset = await page.reload({ waitUntil: 'networkidle0' });
    const refreshedNonce = refreshedReset?.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(refreshedNonce && refreshedNonce !== resetNonce, 'Direct refresh receives a fresh request-specific CSP nonce.');
    await page.waitForSelector('#email', { timeout: 5_000 });

    await page.goto(`${baseUrl}/verify-email`, { waitUntil: 'networkidle0' });
    const activationNonces = await page.$$eval('script[src]', (scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
    assert.ok(activationNonces.length > 0 && activationNonces.every(Boolean), 'Verify Email client scripts carry request CSP nonces.');
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('#email') !== null);
    await page.locator('#email').click();
    await page.keyboard.type(`synthetic-activation-${suffix}@example.invalid`);
    assert.equal(await page.$eval('button[type="button"]', (button) => !(button as HTMLButtonElement).disabled), true, 'Resend is enabled after the email field receives input.');
    const resendResponsePromise = page.waitForResponse((response) => response.url() === `${baseUrl}/api/auth/activation/resend` && response.request().method() === 'POST');
    await page.locator('button[type="button"]').click();
    const resendResponse = await resendResponsePromise;
    assert.equal(resendResponse.status(), 200, 'Synthetic activation resend receives the generic response without sending email when disabled.');
    await page.waitForFunction(() => document.body.innerText.includes('إذا كان الحساب مؤهلًا'), { timeout: 5_000 });
    assert.deepEqual(browserErrors, [], 'Browser reports no hydration or runtime errors.');
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3_000);
        server!.once('exit', () => { clearTimeout(timeout); resolve(); });
      });
    }
    if (userIds.length) {
      await db.delete(adminInvitations).where(inArray(adminInvitations.userId, userIds));
      await db.delete(sessions).where(inArray(sessions.userId, userIds));
      await db.delete(mobileSessions).where(inArray(mobileSessions.userId, userIds));
      await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await db.delete(rateLimitCounters).where(inArray(rateLimitCounters.key, [
      `admin-invitation:${invitationIpHash}`,
      `forgot:${invitationIp}`,
    ]));
    await pool.end();
  }
});
