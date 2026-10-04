import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH, harness } from './harness.js';

// Browsers apply the page's CSP form-action to the redirect that follows a form
// POST. /logout must therefore land on the auth origin itself: a hop to the
// marketing site was blocked by `form-action 'self' …`, so "Sign out" did nothing.
test('sign out ends the session and redirects same-origin', async () => {
  const h = await harness();
  const b = await h.webSignIn('signout@example.com');
  assert.equal((await b.req(`${AUTH}/account`)).status, 200);

  const res = await b.req(`${AUTH}/logout`, { method: 'POST', headers: { origin: AUTH } });
  assert.equal(res.status, 303);
  const loc = new URL(res.headers.get('location')!, AUTH);
  assert.equal(loc.origin, new URL(AUTH).origin, 'redirect must stay on the auth origin (CSP form-action)');
  assert.equal(loc.pathname, '/login');

  const after = await b.req(`${AUTH}/account`);
  assert.equal(after.status, 302);
  assert.match(after.headers.get('location') ?? '', /\/login/);
});

test('sign out from another origin is refused', async () => {
  const h = await harness();
  const b = await h.webSignIn('csrf@example.com');
  const res = await b.req(`${AUTH}/logout`, { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  assert.equal((await b.req(`${AUTH}/account`)).status, 200);
});
