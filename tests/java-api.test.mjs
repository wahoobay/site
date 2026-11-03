// The site's one client of the Java API (src/lib/java-api.mjs): the sighting form and the admin use it. Pure: these
// tests fake `fetch` and never touch the network or need a build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_BASE, ApiError, SessionExpired, apiFetch, mediaUrl, pageQuery } from '../src/lib/java-api.mjs';
import { API } from '../src/lib/sighting.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fake fetch that records [url, init] and answers `reply`. */
const fake = (t, reply) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push([url, init]);
    return typeof reply === 'function' ? reply(url, init) : reply;
  });
  return calls;
};

test('the base is the Java API, version 1, and the form keeps its API export', () => {
  assert.equal(API_BASE, 'https://api.wahoobay.net/api/v1');
  assert.equal(API, API_BASE);
});

test('apiFetch sends a Bearer header only when given a token', async (t) => {
  const calls = fake(t, () => json({ ok: true }));
  assert.deepEqual(await apiFetch('/admin/summary', { token: 'abc' }), { ok: true });
  await apiFetch('/species');
  assert.equal(calls[0][0], `${API_BASE}/admin/summary`);
  assert.equal(calls[0][1].headers.authorization, 'Bearer abc');
  assert.equal(calls[0][1].method, 'GET');
  assert.equal(calls[1][1].headers.authorization, undefined);
  assert.equal(calls[1][1].headers['content-type'], undefined);
  assert.equal(calls[1][1].body, undefined);
});

test('apiFetch sends a JSON body with its content-type and serialises the query, leaving out empty values', async (t) => {
  const calls = fake(t, () => json({}));
  await apiFetch('/admin/sightings/7', { method: 'PATCH', body: { notes: 'x' } });
  assert.equal(calls[0][1].method, 'PATCH');
  assert.equal(calls[0][1].body, '{"notes":"x"}');
  assert.equal(calls[0][1].headers['content-type'], 'application/json');
  await apiFetch('/admin/sightings', { query: { limit: 50, offset: 0, status: 'pending', q: '', gone: undefined, none: null } });
  assert.equal(calls[1][0], `${API_BASE}/admin/sightings?limit=50&offset=0&status=pending`);
  await apiFetch('/x?a=1', { query: { b: 'c d' } });
  assert.equal(calls[2][0], `${API_BASE}/x?a=1&b=c+d`);
});

test('a 204 or empty body answers null', async (t) => {
  fake(t, () => new Response(null, { status: 204 }));
  assert.equal(await apiFetch('/admin/sightings/1', { method: 'DELETE', token: 't' }), null);
});

test('a 401 throws SessionExpired, an ApiError', async (t) => {
  fake(t, () => json({ error: 'expired' }, 401));
  await assert.rejects(apiFetch('/admin/queue', { token: 't' }), (e) => {
    assert.ok(e instanceof SessionExpired && e instanceof ApiError);
    assert.equal(e.status, 401);
    assert.deepEqual(e.body, { error: 'expired' });
    return true;
  });
});

test('a 409 throws ApiError with the parsed body (linked_sightings)', async (t) => {
  fake(t, () => json({ error: 'in use', linked_sightings: [3, 9] }, 409));
  await assert.rejects(apiFetch('/admin/species/1', { method: 'DELETE', token: 't' }), (e) => {
    assert.ok(e instanceof ApiError && !(e instanceof SessionExpired));
    assert.equal(e.status, 409);
    assert.deepEqual(e.body.linked_sightings, [3, 9]);
    return true;
  });
});

test('an error body that is not JSON is kept as text, or null when empty', async (t) => {
  fake(t, () => new Response('<html>bad gateway</html>', { status: 502 }));
  await assert.rejects(apiFetch('/x'), (e) => e.status === 502 && e.body === '<html>bad gateway</html>');
  t.mock.restoreAll();
  fake(t, () => new Response(null, { status: 404 }));
  await assert.rejects(apiFetch('/x'), (e) => e.status === 404 && e.body === null);
});

test('a network failure or timeout is ApiError(0)', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('failed'); });
  await assert.rejects(apiFetch('/x'), (e) => e instanceof ApiError && e.status === 0);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  await assert.rejects(apiFetch('/x', { timeoutMs: 10 }), (e) => e instanceof ApiError && e.status === 0);
});

test('an OK body that is not JSON is ApiError', async (t) => {
  fake(t, () => new Response('nope', { status: 200 }));
  await assert.rejects(apiFetch('/x'), (e) => e instanceof ApiError && e.status === 200);
});

test('mediaUrl builds a clip, a poster and a thumb address, encoding the thumb URL', () => {
  assert.equal(mediaUrl('clip', 12, 'tk'), `${API_BASE}/clips/12?token=tk`);
  assert.equal(mediaUrl('poster', 12, 'tk'), `${API_BASE}/clips/12?token=tk&poster=1`);
  const u = 'https://drive.google.com/thumbnail?id=abc&sz=w400';
  assert.equal(mediaUrl('thumb', u, 'a b'), `${API_BASE}/thumb?u=${encodeURIComponent(u)}&token=a+b`);
  assert.equal(mediaUrl('clip', 12), `${API_BASE}/clips/12`);
  assert.equal(mediaUrl('thumb', u), `${API_BASE}/thumb?u=${encodeURIComponent(u)}`);
  assert.throws(() => mediaUrl('video', 1), RangeError);
});

test('pageQuery builds limit and offset, with extras that are set', () => {
  assert.deepEqual(pageQuery(50, 100), { limit: 50, offset: 100 });
  assert.deepEqual(pageQuery(25, 0, { status: 'pending', q: '' }), { limit: 25, offset: 0, status: 'pending' });
});
