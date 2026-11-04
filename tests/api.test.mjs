import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { app } from '../api/app.mjs';

let server;
let baseUrl;
before(async () => {
  assert.ok(
    process.env.GCLOUD_PROJECT?.startsWith('demo-') &&
      process.env.FIREBASE_AUTH_EMULATOR_HOST &&
      process.env.FIRESTORE_EMULATOR_HOST,
    'Run API tests through Firebase emulators, never production.',
  );
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
});

async function request(path, method = 'GET', body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(baseUrl + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
async function register() {
  const email = crypto.randomUUID() + '@example.com';
  const password = 'MotionAlarm123!';
  const result = await request('/auth/register', 'POST', { email, password });
  assert.equal(result.status, 201);
  return { ...result.data, email, password };
}
function movement(id = crypto.randomUUID()) {
  return { id, createdAt: new Date().toISOString(), source: 'Movement', status: 'New', strength: 2.5 };
}

test('REST registration, login, token refresh, current user, and password reset', async () => {
  const account = await register();
  const loggedIn = await request('/auth/login', 'POST', { email: account.email, password: account.password });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.data.user.uid, account.user.uid);
  const refreshed = await request('/auth/refresh', 'POST', { refreshToken: loggedIn.data.refreshToken });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.data.user.uid, account.user.uid);
  assert.equal((await request('/auth/me', 'GET', undefined, refreshed.data.idToken)).data.user.uid, account.user.uid);
  assert.equal((await request('/auth/password-reset', 'POST', { email: account.email })).status, 200);
  assert.equal((await request('/auth/password-reset', 'POST', { email: 'unknown-' + account.email })).status, 200);
  assert.equal(
    (await request('/auth/login', 'POST', { email: account.email, password: 'wrong-password' })).status,
    400,
  );
});

test('REST alert create, read, review, delete, clear, and duplicate retry', async () => {
  const { idToken } = await register();
  const alert = movement();
  assert.equal((await request('/alerts', 'POST', alert, idToken)).status, 201);
  assert.equal((await request('/alerts', 'POST', alert, idToken)).status, 201);
  assert.equal((await request('/alerts', 'GET', undefined, idToken)).data.alerts.length, 1);
  assert.equal((await request('/alerts/' + alert.id, 'PATCH', { status: 'Reviewed' }, idToken)).status, 200);
  await request('/alerts', 'POST', alert, idToken);
  assert.equal((await request('/alerts', 'GET', undefined, idToken)).data.alerts[0].status, 'Reviewed');
  assert.equal((await request('/alerts/' + alert.id, 'DELETE', undefined, idToken)).status, 204);
  await request('/alerts', 'POST', alert, idToken);
  assert.equal(
    (await request('/alerts', 'GET', undefined, idToken)).data.alerts.length,
    0,
    'A retry must not recreate a deleted record.',
  );
  await request('/alerts', 'POST', movement(), idToken);
  await request('/alerts', 'POST', movement(), idToken);
  assert.equal((await request('/alerts', 'DELETE', undefined, idToken)).status, 204);
  assert.deepEqual((await request('/alerts', 'GET', undefined, idToken)).data.alerts, []);
});

test('REST rejects missing or forged tokens and isolates accounts', async () => {
  const alice = await register();
  const bob = await register();
  const alert = movement();
  await request('/alerts', 'POST', alert, alice.idToken);
  assert.equal((await request('/alerts')).status, 401);
  assert.equal((await request('/alerts', 'GET', undefined, 'forged-token')).status, 401);
  assert.deepEqual((await request('/alerts', 'GET', undefined, bob.idToken)).data.alerts, []);
  assert.equal((await request('/alerts/' + alert.id, 'PATCH', { status: 'Reviewed' }, bob.idToken)).status, 404);
  assert.equal((await request('/alerts', 'POST', { ...movement(), userId: alice.user.uid }, bob.idToken)).status, 400);
  assert.equal((await request('/alerts', 'GET', undefined, alice.idToken)).data.alerts[0].status, 'New');
});

test('REST rejects tests, invalid alert fields, changed event data, and malformed JSON', async () => {
  const { idToken } = await register();
  for (const changes of [
    { source: 'Test' },
    { status: 'Reviewed' },
    { strength: -1 },
    { strength: 'bad' },
    { id: '../other' },
    { createdAt: 'today' },
    { extra: true },
  ]) {
    assert.equal((await request('/alerts', 'POST', { ...movement(), ...changes }, idToken)).status, 400);
  }
  const alert = movement();
  await request('/alerts', 'POST', alert, idToken);
  assert.equal(
    (await request('/alerts/' + alert.id, 'PATCH', { status: 'Reviewed', strength: 4 }, idToken)).status,
    400,
  );
  const malformed = await fetch(baseUrl + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await request('/alerts', 'GET', undefined, idToken)).data.alerts.length, 1);
});
