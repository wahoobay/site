// The admin session: token and user in localStorage, sign-in and change-password against the Java API (faked fetch).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { API_BASE } from '../src/lib/java-api.mjs';
import { load, save, clear, signIn, changePassword, SignInFailed, TOKEN_KEY, USER_KEY } from '../src/lib/admin/session.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fake = (t, reply) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push([url, init]); return reply; });
  return calls;
};
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const user = { name: 'Ana', email: 'a@x.org', role: 'intern', permissions: ['viewData'], mustChangePassword: false };

beforeEach(() => { globalThis.localStorage = memory(); });

test('keys', () => assert.deepEqual([TOKEN_KEY, USER_KEY], ['wb.admin.token', 'wb.admin.user']));

test('save, load, clear round-trip', () => {
  assert.equal(load(), null);
  save({ token: 't1', user });
  assert.equal(localStorage.getItem('wb.admin.token'), 't1');
  assert.deepEqual(load(), { token: 't1', user });
  clear();
  assert.equal(load(), null);
});

test('load tolerates a missing or corrupt or throwing localStorage', () => {
  delete globalThis.localStorage;
  assert.equal(load(), null);
  assert.doesNotThrow(() => { save({ token: 't', user }); clear(); });
  globalThis.localStorage = memory();
  localStorage.setItem('wb.admin.token', 't');
  localStorage.setItem('wb.admin.user', '{not json');
  assert.equal(load(), null);
  localStorage.setItem('wb.admin.user', 'null');
  assert.equal(load(), null);
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(load(), null);
  assert.doesNotThrow(() => { save({ token: 't', user }); clear(); });
});

test('signIn posts username and password, answers {token,user}, and does not save', async (t) => {
  const calls = fake(t, json({ status: 'Success', data: { token: 'jwt', user } }));
  assert.deepEqual(await signIn('ana', 'pw'), { token: 'jwt', user });
  assert.equal(calls[0][0], `${API_BASE}/auth/signin`);
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), { username: 'ana', password: 'pw' });
  assert.equal(calls[0][1].headers.authorization, undefined);
});

test('signIn: a 200 Failure, a 401 and a Success without a token are "Check your username and password"', async (t) => {
  for (const res of [
    () => json({ status: 'Failure', message: 'User name and password are required.' }),
    () => json({ status: 'Failure', message: 'Bad credentials' }, 401),
    () => json({ status: 'Success', data: {} }),
    () => json({ status: 'Success', data: { token: 'jwt' } }),
  ]) {
    t.mock.method(globalThis, 'fetch', async () => res());
    await assert.rejects(signIn('a', 'b'), (e) => e instanceof SignInFailed && e.message === 'Check your username and password');
    t.mock.restoreAll();
  }
});

test('signIn: a 404 is "This account is disabled"; other failures are not SignInFailed', async (t) => {
  fake(t, json({ status: 'Failure', message: 'User has been disable' }, 404));
  await assert.rejects(signIn('a', 'b'), (e) => e instanceof SignInFailed && e.message === 'This account is disabled');
  t.mock.restoreAll();
  fake(t, json({ error: 'boom' }, 500));
  await assert.rejects(signIn('a', 'b'), (e) => !(e instanceof SignInFailed) && e.status === 500);
});

test('changePassword: posts currentPassword and newPassword with the token', async (t) => {
  const calls = fake(t, json({ status: 'Success', message: 'Password updated.' }));
  await changePassword('tok', 'old', 'a-long-new-pw');
  assert.equal(calls[0][0], `${API_BASE}/auth/change-password`);
  assert.equal(calls[0][1].headers.authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0][1].body), { currentPassword: 'old', newPassword: 'a-long-new-pw' });
});

test('changePassword: under 10 characters never reaches the network; a 200 Failure throws its message', async (t) => {
  const calls = fake(t, json({ status: 'Failure', message: 'Current password is incorrect.' }));
  await assert.rejects(changePassword('tok', 'old', 'short'), /at least 10/);
  assert.equal(calls.length, 0);
  await assert.rejects(changePassword('tok', 'old', 'a-long-new-pw'), /Current password is incorrect/);
});

test('changePassword clears the stored mustChangePassword flag', async (t) => {
  fake(t, json({ status: 'Success' }));
  save({ token: 'tok', user: { ...user, mustChangePassword: true } });
  await changePassword('tok', 'old', 'a-long-new-pw');
  assert.equal(load().user.mustChangePassword, false);
});
