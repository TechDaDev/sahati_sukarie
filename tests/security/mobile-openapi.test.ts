import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../src/app/api/openapi.json/route';

test('OpenAPI endpoint serves v1 paths and stable response contracts without caching', async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const document = await response.json() as {
    openapi: string;
    paths: Record<string, Record<string, { summary?: string; responses?: Record<string, unknown>; security?: unknown[] }>>;
  };
  assert.match(document.openapi, /^3\./);
  assert.ok(document.paths['/api/v1/auth/login']?.post);
  assert.ok(document.paths['/api/v1/auth/refresh']?.post);
  assert.ok(document.paths['/api/v1/auth/activation/verify']?.post);
  assert.ok(document.paths['/api/v1/auth/activation/resend']?.post);
  assert.ok(document.paths['/api/v1/auth/password-reset/verify']?.post);
  assert.ok(document.paths['/api/v1/auth/password-reset/complete']?.post);
  assert.ok(document.paths['/api/v1/dashboard']?.get);
  assert.ok(document.paths['/api/v1/reports/pdf']?.get);
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      assert.ok(operation.summary, `${method.toUpperCase()} ${path} needs summary`);
      assert.ok(operation.responses && Object.keys(operation.responses).length > 0, `${method.toUpperCase()} ${path} needs responses`);
      const isPublic = ['/api/v1/config', '/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh', '/api/v1/auth/activation/verify', '/api/v1/auth/activation/resend', '/api/v1/auth/forgot-password', '/api/v1/auth/password-reset/verify', '/api/v1/auth/password-reset/complete', '/api/v1/auth/redeem-recovery'].includes(path);
      if (!isPublic) assert.ok(operation.security?.length, `${method.toUpperCase()} ${path} needs bearer auth`);
    }
  }
});
