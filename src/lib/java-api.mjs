// The Java API (wahoobay-net-api), version 1: the one client the sighting form (src/lib/sighting.mjs) and the
// sighting-review admin share. A plain module with no DOM, so the tests read it without a build
// (tests/java-api.test.mjs). The admin's endpoints need the reviewer's token; the form's three endpoints need none.

/**
 * Where the API is: PUBLIC_JAVA_API_URL when the build sets it (no trailing slash), else production's. Outside Astro
 * (the tests) `import.meta.env` is undefined and the default applies.
 */
export const API_BASE = (import.meta.env?.PUBLIC_JAVA_API_URL || 'https://api.wahoobay.net/api/v1').replace(/\/+$/, '');

/**
 * Where the uploaded photos are: beside the version prefix (UploadServeController serves /api/uploads/{key}), so the
 * base must end in /v1. Any other base is refused with a RangeError, at this module's load (UPLOADS_BASE below), so a
 * build with a wrong PUBLIC_JAVA_API_URL stops: the sighting form's page renders this module while it builds.
 * @param {string} base
 */
export function uploadsBase(base) {
  if (!/^https?:\/\/[^/].*\/v1$/.test(base)) {
    throw new RangeError(`PUBLIC_JAVA_API_URL must end in /v1 (the Java API's version 1, as https://api.wahoobay.net/api/v1); it is "${base}"`);
  }
  return base.slice(0, -'/v1'.length);
}

const UPLOADS_BASE = uploadsBase(API_BASE);

/**
 * Why a call to the Java API failed: `status` is the HTTP status it answered with, or 0 when nothing answered (a
 * timeout, the network); `body` is what it answered, parsed when it was JSON (`{error}`, a 409's `linked_sightings`),
 * else the text, else null.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {any} body
   * @param {{ cause?: unknown, path?: string }} [options]
   */
  constructor(status, body, options) {
    const why = body && typeof body === 'object' && typeof body.error === 'string' ? body.error : '';
    super(`${options?.path ?? 'API'}: ${status ? `HTTP ${status}` : 'no answer'}${why ? `: ${why}` : ''}`, options);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** The API answered 401: the token is missing, expired or refused, and the reviewer must sign in again. */
export class SessionExpired extends ApiError {
  /**
   * @param {any} body
   * @param {{ cause?: unknown, path?: string }} [options]
   */
  constructor(body, options) {
    super(401, body, options);
    this.name = 'SessionExpired';
  }
}

/**
 * A query string from an object; undefined, null and empty values are left out.
 * @param {string} path
 * @param {Record<string, unknown> | undefined} query
 */
const withQuery = (path, query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
  }
  const text = params.toString();
  if (!text) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${text}`;
};

/**
 * Call the API at `path` under API_BASE ("/admin/queue") and answer its JSON (null for an empty body). A `body` is sent
 * as JSON; a `token` goes as a Bearer header, and without one no Authorization header is sent. Rejects with
 * SessionExpired on 401, ApiError on any other non-2xx status (its `body` holds what the API said) and ApiError(0) when
 * nothing answers within `timeoutMs` or the network fails; an OK body that is not JSON is an ApiError too.
 * @param {string} path
 * @param {{ method?: string, body?: unknown, token?: string | null, timeoutMs?: number, query?: Record<string, unknown> }} [options]
 * @returns {Promise<any>}
 */
export async function apiFetch(path, { method = 'GET', body, token, timeoutMs = 8000, query } = {}) {
  const url = `${API_BASE}${withQuery(path, query)}`;
  /** @type {Record<string, string>} */
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  /** @type {RequestInit} */
  const init = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  init.signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, init);
    } catch (cause) {
      throw new ApiError(0, null, { cause, path });
    }
    let text;
    try {
      text = await res.text();
    } catch (cause) {
      throw new ApiError(controller.signal.aborted ? 0 : res.status, null, { cause, path });
    }
    /** @type {any} */
    let parsed = text === '' ? null : text;
    let isJson = text === '';
    if (text !== '') {
      try {
        parsed = JSON.parse(text);
        isJson = true;
      } catch {
        // kept as text
      }
    }
    if (res.status === 401) throw new SessionExpired(parsed, { path });
    if (!res.ok) throw new ApiError(res.status, parsed, { path });
    if (!isJson) throw new ApiError(res.status, parsed, { path });
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * An address an <img> or <video> can use, which cannot send a header, so the token goes in the query (ClipController,
 * ThumbController; both serve publicly visible media without one, so `token` may be left out).
 * - `clip`: the archived clip or frame of media `idOrUrl` (GET /clips/{id}).
 * - `poster`: its poster frame (GET /clips/{id}?poster=1).
 * - `thumb`: an image on an allowed host (Drive, YouTube) through the API's proxy, for the page's COEP (GET /thumb?u=).
 * - `upload`: a photo the sighting form uploaded, its media `url` ("/uploads/<key>") or the key alone. Served at
 *   /api/uploads/{key}, outside the version prefix (UploadServeController; uploadsBase), to anyone: its key cannot be
 *   guessed, so no token goes in it. A key that is no flat file name is a RangeError.
 * @param {'clip' | 'poster' | 'thumb' | 'upload'} kind
 * @param {string | number} idOrUrl
 * @param {string | null} [token]
 */
export const mediaUrl = (kind, idOrUrl, token) => {
  if (kind === 'thumb') return `${API_BASE}${withQuery('/thumb', { u: idOrUrl, token })}`;
  if (kind === 'upload') {
    const key = String(idOrUrl).replace(/^\/uploads\//, '');
    if (!key || key === '.' || key === '..' || /[/\\]/.test(key)) throw new RangeError(`mediaUrl: "${idOrUrl}" is no uploaded file`);
    return `${UPLOADS_BASE}/uploads/${encodeURIComponent(key)}`;
  }
  if (kind === 'clip' || kind === 'poster') {
    return `${API_BASE}${withQuery(`/clips/${encodeURIComponent(String(idOrUrl))}`, { token, poster: kind === 'poster' ? 1 : undefined })}`;
  }
  throw new RangeError(`mediaUrl: no such kind "${kind}"`);
};

/**
 * The query of a paged admin list (`limit`, `offset`), with any extra filters that are set.
 * @param {number} limit
 * @param {number} offset
 * @param {Record<string, unknown>} [extra]
 */
export const pageQuery = (limit, offset, extra = {}) => {
  /** @type {Record<string, unknown>} */
  const query = { limit, offset };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== '') query[key] = value;
  }
  return query;
};
