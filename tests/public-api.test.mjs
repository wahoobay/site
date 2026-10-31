// The site's client of the fish-ID app's public API (src/lib/public-api.mjs): the islands fetch /api/public/... on the
// site's own origin through fetchJson, and turn what it answers into words with the helpers beside it. Pure: these tests
// fake `fetch` and never touch the network or need a build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { API_BASE, ApiError, emptyText, fahrenheit, fetchJson, relativeTime, streamUrl } from '../src/lib/public-api.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('the API is the site\'s own /api/public/, by relative path', () => {
  assert.equal(API_BASE, '/api/public');
});

test('fetchJson fetches a path under /api/public/ on the same origin and answers its JSON', async (t) => {
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    asked.push(url);
    return json({ cameras: [{ id: 'seahivecam', status: 'live' }] });
  });
  assert.deepEqual(await fetchJson('/cameras'), { cameras: [{ id: 'seahivecam', status: 'live' }] });
  // A link the API hands out (a camera's `live`) is already a full path under /api/public/ and is taken as it is.
  await fetchJson('/api/public/live?camera=seahivecam');
  await fetchJson('/species/counts?days=7&top=5');
  assert.deepEqual(asked, ['/api/public/cameras', '/api/public/live?camera=seahivecam', '/api/public/species/counts?days=7&top=5']);
});

test('fetchJson rejects with ApiError { status, path } on a 503, without reading the body', async (t) => {
  let read = false;
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 503,
    json: async () => ((read = true), { error: 'camera offline' }),
    text: async () => ((read = true), '{"error":"camera offline"}'),
  }));
  await assert.rejects(fetchJson('/live?camera=seahivecam'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ApiError');
    assert.equal(err.status, 503);
    assert.equal(err.path, '/api/public/live?camera=seahivecam');
    return true;
  });
  assert.equal(read, false, 'a non-OK body is never read');
});

// Ruling 25: through the website's distribution an API 404 (or 403) arrives as the site's HTML 404 page.
test('fetchJson rejects a 404 that is the site\'s HTML page as ApiError, never parsing it', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<!doctype html><title>Not found</title>', { status: 404, headers: { 'content-type': 'text/html' } }));
  await assert.rejects(fetchJson('/species/nope'), (err) => err instanceof ApiError && err.status === 404 && err.path === '/api/public/species/nope');
  t.mock.method(globalThis, 'fetch', async () => new Response('<!doctype html>', { status: 403 }));
  await assert.rejects(fetchJson('/cameras'), (err) => err instanceof ApiError && err.status === 403);
});

test('fetchJson rejects with ApiError (status 0) when nothing answers within timeoutMs', async (t) => {
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason));
  }));
  const started = Date.now();
  await assert.rejects(fetchJson('/cameras', { timeoutMs: 20 }), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 0);
    assert.equal(err.path, '/api/public/cameras');
    return true;
  });
  assert.ok(Date.now() - started < 2000, 'the timeout ends the wait');
});

test('fetchJson rejects with ApiError when the network fails, the caller aborts, or an OK body is not JSON', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(fetchJson('/cameras'), (err) => err instanceof ApiError && err.status === 0);

  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason));
  }));
  const caller = new AbortController();
  const pending = fetchJson('/cameras', { signal: caller.signal });
  caller.abort();
  await assert.rejects(pending, (err) => err instanceof ApiError && err.status === 0);
  const already = new AbortController();
  already.abort();
  await assert.rejects(fetchJson('/cameras', { signal: already.signal }), (err) => err instanceof ApiError && err.status === 0);

  t.mock.method(globalThis, 'fetch', async () => new Response('<!doctype html>', { status: 200 }));
  await assert.rejects(fetchJson('/cameras'), (err) => err instanceof ApiError && err.status === 200 && err.path === '/api/public/cameras');
});

test('streamUrl resolves a camera\'s stream or snapshot path against the fish-ID app\'s address', () => {
  assert.equal(streamUrl('https://staging-ai.wahoobay.net/', '/stream/stream_raw.mjpeg'), 'https://staging-ai.wahoobay.net/stream/stream_raw.mjpeg');
  assert.equal(streamUrl('https://ai.wahoobay.net/', '/stream/snapshot_raw.jpg'), 'https://ai.wahoobay.net/stream/snapshot_raw.jpg');
  assert.equal(streamUrl('https://ai.wahoobay.net/some/page/', '/stream/x.mjpeg'), 'https://ai.wahoobay.net/stream/x.mjpeg', 'a path from the root');
  assert.equal(streamUrl('https://ai.wahoobay.net/', null), null, 'a camera with no public stream has none');
});

test('emptyText: the sentence an empty panel shows', () => {
  assert.equal(emptyText('hour'), 'Nothing seen in the last hour');
  assert.equal(emptyText('day'), 'Nothing seen today');
  assert.equal(emptyText('chart'), 'No data for this period');
  assert.equal(emptyText('water'), 'No reading yet');
  assert.throws(() => emptyText('week'), /week/);
});

test('fahrenheit: a reading in °C as whole °F', () => {
  assert.equal(fahrenheit(26.1), 79);
  assert.equal(fahrenheit(0), 32);
  assert.equal(fahrenheit(100), 212);
  assert.equal(fahrenheit(25), 77);
  assert.equal(fahrenheit(null), null, 'no reading');
  assert.equal(fahrenheit(undefined), null);
  assert.equal(fahrenheit(Number.NaN), null);
});

test('relativeTime: how long ago, in words', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  assert.equal(relativeTime(ago(0), now), 'just now');
  assert.equal(relativeTime(ago(59_000), now), 'just now');
  assert.equal(relativeTime(ago(-5_000), now), 'just now', 'a clock a little ahead');
  assert.equal(relativeTime(ago(MIN), now), '1 min ago');
  assert.equal(relativeTime(ago(3 * MIN + 30_000), now), '3 min ago');
  assert.equal(relativeTime(ago(59 * MIN), now), '59 min ago');
  assert.equal(relativeTime(ago(HOUR), now), '1 h ago');
  assert.equal(relativeTime(ago(23 * HOUR + 59 * MIN), now), '23 h ago');
  assert.equal(relativeTime(ago(DAY), now), 'yesterday');
  assert.equal(relativeTime(ago(2 * DAY - 1), now), 'yesterday');
  assert.equal(relativeTime(ago(2 * DAY), now), '2 days ago');
  assert.equal(relativeTime(ago(40 * DAY), now), '40 days ago');
  assert.equal(relativeTime('2026-10-31T07:57:00-04:00', new Date(now)), '3 min ago', 'an offset time, and now as a Date');
  assert.equal(relativeTime(null, now), null);
  assert.equal(relativeTime('not a time', now), null);
});

test('the module is pure: no DOM, no window, no document', () => {
  const source = readFileSync('src/lib/public-api.mjs', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(source, /\b(document|window|localStorage|navigator)\b/);
});

test('every sentence the module shows a visitor is marked for Katie', () => {
  const lines = readFileSync('src/lib/public-api.mjs', 'utf8').split('\n');
  const sentences = ['Nothing seen in the last hour', 'Nothing seen today', 'No data for this period', 'No reading yet', 'just now', 'min ago', 'h ago', 'yesterday', 'days ago'];
  for (const sentence of sentences) {
    const at = lines.findIndex((line) => line.includes(`'${sentence}`) || line.includes(` ${sentence}\``));
    assert.ok(at > 0, sentence);
    assert.match(lines[at - 1], /\/\/ katie: review/, `${sentence} is marked`);
  }
});

test('npm run dev sends /api/public/ to the staging fish-ID app; the build is static', async () => {
  const { default: config } = await import('../astro.config.mjs');
  assert.deepEqual(config.vite?.server?.proxy, { '/api/public': { target: 'https://staging-ai.wahoobay.net', changeOrigin: true } });
  assert.equal(config.output, 'static');
  assert.match(readFileSync('README.md', 'utf8'), /npm run dev[\s\S]*\/api\/public\/[\s\S]*staging-ai\.wahoobay\.net/, 'the README says where the dev server sends it');
});

// Astro's dev server rejects a path with no trailing slash (trailingSlash: 'always') with its own 404, from middleware it
// puts at the front of the stack, before Vite's proxy; /api/public/cameras has none. The config's plugin moves the
// proxy ahead once Astro is done.
test('in npm run dev the proxy answers before Astro\'s trailing-slash 404', async () => {
  const { default: config } = await import('../astro.config.mjs');
  const plugin = config.vite?.plugins?.flat().find((p) => p && typeof p === 'object' && 'name' in p && p.name === 'wahoobay:dev-proxy-first');
  assert.ok(plugin, 'the plugin is in the config');
  assert.equal(plugin.enforce, 'post', 'after Astro\'s own plugin');
  const layer = (name) => ({ route: '', handle: { [name]: () => {} }[name] });
  const stack = [layer('viteTimeMiddleware'), layer('viteProxyMiddleware'), layer('viteBaseMiddleware')];
  const server = { middlewares: { stack } };
  const post = plugin.configureServer(server);
  // Astro's post hook runs first and puts its own middleware at the front.
  stack.unshift(layer('devSecFetch'), layer('devTrailingSlash'));
  post();
  assert.deepEqual(stack.map((l) => l.handle.name), ['viteProxyMiddleware', 'devSecFetch', 'devTrailingSlash', 'viteTimeMiddleware', 'viteBaseMiddleware']);
});
