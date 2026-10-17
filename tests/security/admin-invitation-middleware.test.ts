import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../../src/middleware';

test('admin invitation setup is public while admin dashboard remains protected', () => {
  const invitation = middleware(new NextRequest('https://example.test/admin/accept-invitation'));
  assert.equal(invitation.status, 200);
  assert.equal(invitation.headers.get('location'), null);

  const dashboard = middleware(new NextRequest('https://example.test/admin/users'));
  assert.equal(dashboard.status, 307);
  assert.equal(new URL(dashboard.headers.get('location')!).pathname, '/admin/login');
});
