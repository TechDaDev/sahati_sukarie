import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { ApiError, assertCsrf, clientIp } from '../../src/server/auth/session';
import { parseBody } from '../../src/server/http';

const schema = z.object({ value: z.string().max(20) });

test('client IP uses only Railway-provided X-Real-IP, never client forwarding headers', () => {
  const spoofed = new Request('https://example.test', {
    headers: { 'x-forwarded-for': '198.51.100.10', 'x-real-ip': '203.0.113.7, 198.51.100.2' },
  });
  assert.equal(clientIp(spoofed), 'unknown');
  assert.equal(clientIp(new Request('https://example.test', { headers: { 'x-forwarded-for': '198.51.100.10' } })), 'unknown');
});

test('client IP accepts valid Railway X-Real-IP address', () => {
  assert.equal(clientIp(new Request('https://example.test', { headers: { 'x-real-ip': '2001:db8::1' } })), '2001:db8::1');
});

const csrfSession = {
  sessionId: 'synthetic-session', csrfToken: 'synthetic-csrf-token',
  user: { id: 'synthetic-user', email: 'synthetic@example.invalid', role: 'PATIENT' as const,
    status: 'ACTIVE' as const, mustChangePassword: false },
};

test('CSRF rejects missing and invalid tokens on state-changing methods', async () => {
  const headersList: Array<Record<string, string>> = [{}, { 'x-csrf-token': 'wrong-token' }];
  for (const headers of headersList) {
    await assert.rejects(assertCsrf(new Request('https://example.test', { method: 'POST', headers }), csrfSession),
      (error: unknown) => error instanceof ApiError && error.status === 403);
  }
});

test('CSRF accepts the session-bound token', async () => {
  await assert.doesNotReject(assertCsrf(new Request('https://example.test', {
    method: 'POST', headers: { 'x-csrf-token': csrfSession.csrfToken },
  }), csrfSession));
});

test('parseBody parses bounded JSON', async () => {
  const request = new Request('https://example.test', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'ok' }),
  });
  assert.deepEqual(await parseBody(request, schema), { value: 'ok' });
});

test('parseBody rejects oversized declared body with 413', async () => {
  const request = new Request('https://example.test', {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1048577' }, body: '{}',
  });
  await assert.rejects(parseBody(request, schema), (error: unknown) => error instanceof ApiError && error.status === 413);
});

test('parseBody rejects oversized streamed body with 413', async () => {
  const payload = 'x'.repeat(1024 * 1024 + 1);
  const request = new Request('https://example.test', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: payload,
  });
  await assert.rejects(parseBody(request, schema), (error: unknown) => error instanceof ApiError && error.status === 413);
});

test('parseBody rejects non-JSON content type', async () => {
  const request = new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  await assert.rejects(parseBody(request, schema), (error: unknown) => error instanceof ApiError && error.status === 415);
});

test('parseBody rejects malformed JSON with 400', async () => {
  const request = new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  await assert.rejects(parseBody(request, schema), (error: unknown) => error instanceof ApiError && error.status === 400);
});
