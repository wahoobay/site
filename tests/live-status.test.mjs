// The live islands' state logic (src/lib/live-status.mjs), which src/islands/live-shared.ts, LivePlayer.tsx and
// LiveNow.tsx run in the browser: the poll that waits while the page is hidden, the camera-status store (Ruling 39: one
// failed re-check is absorbed, two in a row are offline, the next answer restores the status), the stream's frame size,
// the off-screen probe that brings a failed stream back, and the panels' first-answer rule. Run against a stub document,
// stub timers and a stub fetch; no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAILURES_OFFLINE, createCameraStore, frameOf, mergeAnswers, poll, probeStream } from '../src/lib/live-status.mjs';

/** Stub timers and a stub document whose visibility the test sets; `advance(ms)` runs what falls due, then settles. */
const stubEnv = () => {
  let now = 0;
  let timers = [];
  const listeners = new Set();
  const document = {
    hidden: false,
    addEventListener: (type, fn) => type === 'visibilitychange' && listeners.add(fn),
    removeEventListener: (type, fn) => type === 'visibilitychange' && listeners.delete(fn),
  };
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  return {
    document,
    setTimeout: (fn, ms) => {
      const timer = { fn, at: now + ms };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      timers = timers.filter((t) => t !== timer);
    },
    pending: () => timers.length,
    listeners: () => listeners.size,
    settle,
    async advance(ms) {
      now += ms;
      for (const timer of timers.filter((t) => t.at <= now)) {
        timers = timers.filter((t) => t !== timer);
        timer.fn();
        await settle();
      }
      await settle();
    },
    async visibility(hidden) {
      document.hidden = hidden;
      for (const fn of [...listeners]) fn();
      await settle();
    },
  };
};

// --- poll ----------------------------------------------------------------------------------------------------------

test('poll runs at once, then the interval after each run settles; never two runs at once', async () => {
  const env = stubEnv();
  let runs = 0;
  let running = 0;
  let most = 0;
  const stop = poll(async () => {
    runs += 1;
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setImmediate(resolve));
    running -= 1;
  }, 1000, env);
  await env.settle();
  assert.equal(runs, 1, 'at once');
  await env.advance(999);
  assert.equal(runs, 1);
  await env.advance(1);
  assert.equal(runs, 2, 'a second after the first settled');
  await env.advance(1000);
  assert.equal(runs, 3);
  assert.equal(most, 1, 'no overlap');
  stop();
  await env.advance(5000);
  assert.equal(runs, 3, 'stopped');
  assert.equal(env.pending(), 0);
  assert.equal(env.listeners(), 0, 'its visibility listener is gone');
});

test('poll waits while the page is hidden and runs at once when it shows again; stop aborts the run\'s signal', async () => {
  const env = stubEnv();
  let runs = 0;
  let signal;
  const stop = poll(async (s) => {
    runs += 1;
    signal = s;
  }, 30000, env);
  await env.settle();
  assert.equal(runs, 1);
  await env.visibility(true);
  await env.advance(30000);
  assert.equal(runs, 1, 'nothing while hidden');
  assert.equal(env.pending(), 0, 'and nothing scheduled');
  await env.visibility(false);
  assert.equal(runs, 2, 'at once on showing');
  await env.visibility(false);
  assert.equal(runs, 2, 'a second "visible" does not start a second chain');
  await env.advance(30000);
  assert.equal(runs, 3);
  assert.equal(signal.aborted, false);
  stop();
  assert.equal(signal.aborted, true);
});

test('poll keeps going after a run that throws', async () => {
  const env = stubEnv();
  let runs = 0;
  const stop = poll(async () => {
    runs += 1;
    throw new Error('no answer');
  }, 1000, env);
  await env.settle();
  await env.advance(1000);
  assert.equal(runs, 2);
  stop();
});

// --- the camera-status store ---------------------------------------------------------------------------------------

const camera = (status) => ({ cameras: [{ id: 'seahivecam', status, stream_mjpeg: status === 'live' ? '/stream/stream_raw.mjpeg' : null, snapshot: null, embed_url: null, live: '/api/public/live?camera=seahivecam' }] });

/** A fetch that answers from `script`, one entry per call: an answer, or an Error to reject with. */
const scripted = (script) => {
  const calls = [];
  const fetchJson = async (path, { signal } = {}) => {
    calls.push(path);
    assert.ok(signal, 'the fetch gets the poll\'s signal');
    const next = script.length > 1 ? script.shift() : script[0];
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchJson, calls };
};

test('the store: one failed re-check is absorbed, two in a row are offline, the next answer restores the status', async () => {
  assert.equal(FAILURES_OFFLINE, 2);
  const env = stubEnv();
  const api = scripted([camera('live'), new Error('503'), new Error('503'), camera('live'), new Error('blip'), camera('live')]);
  const store = createCameraStore('seahivecam', { fetchJson: api.fetchJson, env });
  assert.deepEqual(store.getState(), { status: null, camera: null, seq: 0 }, 'not known before anything listens');
  const seen = [];
  const unsubscribe = store.subscribe(() => seen.push(store.getState().status));
  await env.settle();
  assert.equal(store.getState().status, 'live');
  assert.equal(store.getState().camera.stream_mjpeg, '/stream/stream_raw.mjpeg');
  assert.deepEqual(api.calls, ['/cameras']);
  await env.advance(30000);
  assert.equal(store.getState().status, 'live', 'one blip is absorbed: still live, its camera kept');
  assert.ok(store.getState().camera);
  await env.advance(30000);
  assert.equal(store.getState().status, 'offline', 'two failed re-checks in a row: offline');
  assert.equal(store.getState().camera, null);
  await env.advance(30000);
  assert.equal(store.getState().status, 'live', 'the next answer restores it');
  await env.advance(30000);
  assert.equal(store.getState().status, 'live', 'and the count starts again: one blip is absorbed');
  await env.advance(30000);
  assert.equal(store.getState().status, 'live');
  // Listeners hear each answer and each change of status; an absorbed blip is neither.
  assert.deepEqual(seen, ['live', 'offline', 'live', 'live']);
  unsubscribe();
  await env.advance(60000);
  assert.equal(api.calls.length, 6, 'no listener, no asking');
});

test('the store: no answer at all the first time is offline at once; each answer is a new state with its count', async () => {
  const env = stubEnv();
  const api = scripted([new Error('no answer'), camera('embed'), camera('embed')]);
  const store = createCameraStore('seahivecam', { fetchJson: api.fetchJson, env });
  const unsubscribe = store.subscribe(() => {});
  await env.settle();
  assert.deepEqual(store.getState(), { status: 'offline', camera: null, seq: 0 });
  await env.advance(30000);
  const first = store.getState();
  assert.equal(first.status, 'embed');
  assert.equal(first.seq, 1);
  await env.advance(30000);
  assert.equal(store.getState().status, 'embed');
  assert.equal(store.getState().seq, 2, 'the same status, a new answer: the player retries a failed stream on it');
  assert.notEqual(store.getState(), first);
  unsubscribe();
});

test('the store asks once for every listener, waits while the page is hidden, and asks at once when it shows', async () => {
  const env = stubEnv();
  const api = scripted([camera('live')]);
  const store = createCameraStore('seahivecam', { fetchJson: api.fetchJson, env });
  const a = store.subscribe(() => {});
  const b = store.subscribe(() => {});
  await env.settle();
  assert.equal(api.calls.length, 1, 'one fetch for the badge, the player and the panels');
  await env.visibility(true);
  await env.advance(90000);
  assert.equal(api.calls.length, 1, 'nothing while hidden');
  await env.visibility(false);
  assert.equal(api.calls.length, 2, 'at once on showing');
  a();
  await env.advance(30000);
  assert.equal(api.calls.length, 3, 'one listener left: still asking');
  b();
  await env.advance(30000);
  assert.equal(api.calls.length, 3);
});

// --- the stream's frame size ----------------------------------------------------------------------------------------

const STREAM = 'https://staging-ai.wahoobay.net/stream/stream_raw.mjpeg';

test('frameOf: the answer\'s frame when it has one, else the stream image\'s own size once it shows the stream, never the still\'s', () => {
  const streaming = { currentSrc: STREAM, naturalWidth: 1280, naturalHeight: 720 };
  const still = { currentSrc: 'https://staging.wahoobay.net/images/learn/wb-camera.jpg', naturalWidth: 1600, naturalHeight: 1066 };
  assert.deepEqual(frameOf({ frame: { width: 1920, height: 1080 } }, still, STREAM), { width: 1920, height: 1080 });
  assert.deepEqual(frameOf({ frame: null }, streaming, STREAM), { width: 1280, height: 720 });
  assert.equal(frameOf({ frame: null }, still, STREAM), null, 'the still is still showing: no frame yet');
  assert.equal(frameOf({ frame: null }, { currentSrc: STREAM, naturalWidth: 0, naturalHeight: 0 }, STREAM), null);
  assert.equal(frameOf({ frame: { width: 0, height: 0 } }, null, STREAM), null);
  assert.equal(frameOf(null, null, STREAM), null);
});

// --- the off-screen probe of a failed stream ------------------------------------------------------------------------

const stubImage = () => {
  const image = { src: undefined, onload: null, onerror: null, removed: false };
  image.removeAttribute = (name) => {
    if (name === 'src') image.removed = true;
  };
  return image;
};

test('probeStream: true when the stream plays, false when it fails or takes too long; it lets go of the stream either way', async () => {
  const env = stubEnv();
  let image;
  const make = () => (image = stubImage());

  const plays = probeStream(STREAM, { createImage: make, env });
  assert.equal(image.src, STREAM);
  image.onload();
  assert.equal(await plays.result, true);
  assert.equal(image.removed, true, 'the probe stops downloading once it has its answer');
  assert.equal(env.pending(), 0);

  const fails = probeStream(STREAM, { createImage: make, env });
  image.onerror();
  assert.equal(await fails.result, false);
  assert.equal(image.removed, true);

  const hangs = probeStream(STREAM, { createImage: make, env, timeoutMs: 10000 });
  await env.advance(10000);
  assert.equal(await hangs.result, false);
  assert.equal(image.removed, true);

  const cancelled = probeStream(STREAM, { createImage: make, env });
  const late = image;
  cancelled.cancel();
  assert.equal(await cancelled.result, false);
  assert.equal(late.onload, null, 'a cancelled probe hears nothing more');
});

// --- the panels' answers --------------------------------------------------------------------------------------------

const ok = (value) => ({ status: 'fulfilled', value });
const failed = { status: 'rejected', reason: new Error('503') };

test('mergeAnswers: nothing until one answer has arrived; a panel not answered yet is pending; a failed refresh keeps the last answer', () => {
  assert.equal(mergeAnswers(null, { summary: failed, latest: failed, counts: failed }, 1), null, 'a failed first fetch says nothing');
  const first = mergeAnswers(null, { summary: failed, latest: ok({ water: null }), counts: ok({ buckets: [] }) }, 2);
  assert.deepEqual(first, { latest: { water: null }, counts: { buckets: [] }, pending: ['summary'], now: 2 });
  const second = mergeAnswers(first, { summary: ok({ species: [] }), latest: failed, counts: failed }, 3);
  assert.deepEqual(second, { latest: { water: null }, counts: { buckets: [] }, summary: { species: [] }, pending: [], now: 3 });
  // The home band asks for no counts: they are never pending.
  assert.deepEqual(mergeAnswers(null, { summary: ok({ species: [] }), latest: failed }, 4), { summary: { species: [] }, pending: ['latest'], now: 4 });
});
