// The live islands' state over time, which src/islands/live-shared.ts, LivePlayer.tsx and LiveNow.tsx run in the
// browser:
// - poll: a task now and again an interval after each run settles, waiting while the page is hidden;
// - the camera-status store, asked once for all three islands every 30 s. One failed re-check is absorbed, two in a
//   row are offline, and the next answer restores the camera's status (Ruling 39), so an outage that starts mid-visit
//   turns the badge to Offline, hides the panels and puts the player on the embed within about a minute;
// - frameOf: the stream's frame size, from the answer or from the stream image once it shows the stream;
// - probeStream: an off-screen try of a stream that failed, so the player comes back to it when it plays;
// - mergeAnswers: the panels' answers, with nothing to show until one has arrived.
// No DOM at import: the document and the timers are the browser's unless a caller (the tests,
// tests/live-status.test.mjs) passes its own `env`.
import { pollInterval, statusOf } from './live.mjs';

/**
 * @typedef {object} Env
 * @property {{ hidden: boolean, addEventListener: (type: string, fn: () => void) => void, removeEventListener: (type: string, fn: () => void) => void }} document
 * @property {(fn: () => void, ms: number) => any} setTimeout
 * @property {(timer: any) => void} clearTimeout
 */

/** @returns {Env} */
const browser = () => ({
  document: globalThis.document,
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
});

/**
 * Runs `task` now and again `ms` after each run settles, while the page is visible: a hidden page waits, and the task
 * runs at once when the page shows again. Never two runs at once. A run that throws is the next run's to retry. The
 * task's signal aborts when the poll stops. Returns the stop.
 * @param {(signal: AbortSignal) => Promise<void>} task
 * @param {number} ms
 * @param {Env} [env]
 * @returns {() => void}
 */
export function poll(task, ms, env = browser()) {
  const controller = new AbortController();
  /** @type {any} */
  let timer;
  let running = false;
  const run = async () => {
    timer = undefined;
    if (controller.signal.aborted || env.document.hidden) return;
    running = true;
    try {
      await task(controller.signal);
    } catch {
      // The page keeps what it showed; the next run tries again.
    } finally {
      running = false;
    }
    if (!controller.signal.aborted && !env.document.hidden) timer = env.setTimeout(run, ms);
  };
  const onVisibility = () => {
    if (!env.document.hidden && !running && timer === undefined) void run();
  };
  env.document.addEventListener('visibilitychange', onVisibility);
  void run();
  return () => {
    controller.abort();
    if (timer !== undefined) env.clearTimeout(timer);
    timer = undefined;
    env.document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** How many status re-checks in a row may fail before the camera is offline (Ruling 39): one blip is absorbed. */
export const FAILURES_OFFLINE = 2;

/**
 * A camera's status as the islands share it: null until the first answer (or its failure); the camera's entry of
 * GET /api/public/cameras; and how many answers have come, so an island can act on an answer that changes nothing (the
 * player retries a failed stream on each one that says live).
 * @typedef {{ status: import('./live.mjs').Status | null, camera: any, seq: number }} CameraState
 */

/**
 * The store of one camera's status: it asks GET /api/public/cameras every 30 s while anything listens, waits while the
 * page is hidden, and tells its listeners of each answer and of each change of status.
 * @param {string} id
 * @param {{ fetchJson: (path: string, options: { signal: AbortSignal }) => Promise<any>, env?: Env }} options
 */
export function createCameraStore(id, { fetchJson, env }) {
  /** @type {CameraState} */
  let state = { status: null, camera: null, seq: 0 };
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {(() => void) | undefined} */
  let stop;
  let failures = 0;
  const set = (/** @type {CameraState} */ next) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const check = async (/** @type {AbortSignal} */ signal) => {
    let answer;
    try {
      answer = await fetchJson('/cameras', { signal });
    } catch {
      if (signal.aborted) return;
      failures += 1;
      // No answer the first time is offline at once; later, one blip is absorbed and the second in a row is offline.
      if (state.status === null || (failures >= FAILURES_OFFLINE && state.status !== 'offline')) set({ status: 'offline', camera: null, seq: state.seq });
      return;
    }
    failures = 0;
    const camera = (Array.isArray(answer?.cameras) ? answer.cameras : []).find((/** @type {any} */ c) => c?.id === id) ?? null;
    set({ status: statusOf(answer, id), camera, seq: state.seq + 1 });
  };
  return {
    getState: () => state,
    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      stop ??= poll(check, pollInterval(null), env);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = undefined;
        }
      };
    },
  };
}

/**
 * The stream's frame size: the answer's `frame` when it gives one, else the stream image's own size, but only once
 * the image shows the stream (its currentSrc is the stream's): until the first frame arrives it still shows the still,
 * whose size is not the frame's. null when there is none yet.
 * @param {any} answer GET /api/public/live
 * @param {{ currentSrc: string, naturalWidth: number, naturalHeight: number } | null | undefined} image the stream's <img>
 * @param {string | null | undefined} stream the stream's address
 * @returns {{ width: number, height: number } | null}
 */
export const frameOf = (answer, image, stream) => {
  const frame = answer && typeof answer === 'object' ? answer.frame : null;
  if (frame && frame.width > 0 && frame.height > 0) return { width: frame.width, height: frame.height };
  if (image && stream && image.currentSrc === stream && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  return null;
};

/**
 * Tries a stream off-screen: `result` is true once it shows a frame, false when it fails, takes longer than
 * `timeoutMs`, or is cancelled. Either way the probe lets go of the stream, so it downloads no more than it needs.
 * @param {string} url
 * @param {{ createImage?: () => any, timeoutMs?: number, env?: Env }} [options]
 * @returns {{ result: Promise<boolean>, cancel: () => void }}
 */
export function probeStream(url, { createImage = () => new Image(), timeoutMs = 10000, env = browser() } = {}) {
  const image = createImage();
  /** @type {(ok: boolean) => void} */
  let resolve = () => {};
  const result = new Promise((r) => {
    resolve = r;
  });
  let done = false;
  const finish = (/** @type {boolean} */ ok) => {
    if (done) return;
    done = true;
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    env.clearTimeout(timer);
    resolve(ok);
  };
  image.onload = () => finish(true);
  image.onerror = () => finish(false);
  const timer = env.setTimeout(() => finish(false), timeoutMs);
  image.src = url;
  return { result, cancel: () => finish(false) };
}

const ANSWERS = /** @type {const} */ (['summary', 'latest', 'counts']);

/**
 * The panels' answers after a round of fetches (each a settled promise, or left out when the panels do not ask for
 * it): null until at least one answer has arrived, so a failed first fetch says nothing; then each answer that has
 * arrived, the last one kept when its refresh fails, and `pending` naming those asked for that have not arrived yet
 * (renderState leaves their panels out).
 * @param {any} was the last merge, or null
 * @param {Partial<Record<'summary' | 'latest' | 'counts', PromiseSettledResult<any>>>} round
 * @param {number} now epoch milliseconds
 */
export const mergeAnswers = (was, round, now) => {
  const next = { ...(was ?? {}) };
  delete next.pending;
  delete next.now;
  for (const key of ANSWERS) {
    const settled = round[key];
    if (settled && settled.status === 'fulfilled') next[key] = settled.value;
  }
  if (!ANSWERS.some((key) => key in next)) return null;
  return { ...next, pending: ANSWERS.filter((key) => round[key] && !(key in next)), now };
};
