// The fish-ID app's public API, as the site's islands read it: on the site's own origin under /api/public/ (the site's
// distribution sends that path to the environment's fish-ID app; `npm run dev` proxies it to staging), and the words
// the islands show for what it answers. A plain module with no DOM, so the tests read it without a build
// (tests/public-api.test.mjs). The only cross-origin addresses are a camera's stream and snapshot (streamUrl).

/** Where the public API is on the site's own origin. */
export const API_BASE = '/api/public';

/**
 * Why a fetch of the public API failed: `status` is the HTTP status it answered with, or 0 when nothing answered (a
 * timeout, the network, the caller's abort); `path` is the path it asked for. The islands catch it and keep the page
 * as built.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} path
   * @param {{ cause?: unknown }} [options]
   */
  constructor(status, path, options) {
    super(`${path}: ${status ? `HTTP ${status}` : 'no answer'}`, options);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

/**
 * The JSON the public API answers at `path`, under API_BASE ("/cameras", "/species/counts?days=7&top=5"); a path the
 * API hands out (a camera's `live`) already starts with API_BASE and is taken as it is. Rejects with ApiError on any
 * status but 2xx without reading the body (through the site's distribution an API 404 can arrive as the site's own HTML
 * 404 page), when nothing answers within `timeoutMs` or the caller aborts through `signal`, and when an OK body is not
 * JSON.
 * @param {string} path
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
 * @returns {Promise<any>}
 */
export async function fetchJson(path, { signal, timeoutMs = 8000 } = {}) {
  const url = path.startsWith(`${API_BASE}/`) ? path : `${API_BASE}${path}`;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    let res;
    try {
      res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    } catch (cause) {
      throw new ApiError(0, url, { cause });
    }
    if (!res.ok) throw new ApiError(res.status, url);
    try {
      return await res.json();
    } catch (cause) {
      throw new ApiError(controller.signal.aborted ? 0 : res.status, url, { cause });
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * A camera's stream or snapshot path (GET /api/public/cameras: `stream_mjpeg`, `snapshot`) as an address on the fish-ID
 * app (PUBLIC_AI_URL, src/lib/nav.mjs); null when the camera has none.
 * @param {string} ai
 * @param {string | null} path
 */
export const streamUrl = (ai, path) => (path === null || path === undefined ? null : new URL(path, ai).href);

/** What an empty panel says, by kind. */
const EMPTY = {
  // katie: review: a new sentence (the detections panel when the camera saw no fish in the last hour)
  hour: 'Nothing seen in the last hour',
  // katie: review: a new sentence (the species panel when the camera saw no fish today)
  day: 'Nothing seen today',
  // katie: review: a new sentence (a chart with nothing to draw for the chosen period)
  chart: 'No data for this period',
  // katie: review: a new sentence (a water tile before the sensors' first reading)
  water: 'No reading yet',
};

/**
 * The sentence an empty panel shows: `hour`, `day`, `chart` or `water`.
 * @param {'hour' | 'day' | 'chart' | 'water'} kind
 */
export const emptyText = (kind) => {
  if (!Object.hasOwn(EMPTY, kind)) throw new RangeError(`emptyText: no sentence for "${kind}"`);
  return EMPTY[kind];
};

/**
 * A reading in °C as whole °F, or null when there is no reading.
 * @param {number | null | undefined} c
 */
export const fahrenheit = (c) => (typeof c === 'number' && Number.isFinite(c) ? Math.round((c * 9) / 5 + 32) : null);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long before `now` a time was, in words: "just now" under a minute (or a time a little ahead of the clock),
 * "3 min ago" under an hour, "5 h ago" under a day, "yesterday" under two, then "4 days ago"; null for no time.
 * @param {string | null} iso an ISO 8601 time
 * @param {number | Date} now epoch milliseconds, or a Date
 */
export const relativeTime = (iso, now) => {
  const then = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  const ms = Number(now) - then;
  if (!Number.isFinite(ms)) return null;
  // katie: review: new words (a detection or reading less than a minute old)
  if (ms < MINUTE) return 'just now';
  // katie: review: new words ("3 min ago")
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`;
  // katie: review: new words ("5 h ago")
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  // katie: review: new words (a day or more, under two)
  if (ms < 2 * DAY) return 'yesterday';
  // katie: review: new words ("4 days ago")
  return `${Math.floor(ms / DAY)} days ago`;
};
