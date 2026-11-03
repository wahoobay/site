// The sighting review's three sighting screens: the review queue (#/queue), all sightings (#/sightings) and the review
// of one (#/review/:id), drawn by src/islands/admin/{Queue,Sightings,Review}.tsx. Everything they decide is here: the
// requests (paths, queries and bodies as the Java API's AdminSightingController and AdminSightingService take them),
// the pager's arithmetic, a row's fields, the thumbnails, the approve payload, which actions show, the conditions at
// the sighting's time and the clip's state; and the markup of the tables, the pager, the media and the conditions as a
// small VDOM (src/lib/vdom.mjs) the islands hand to React. A plain module, so the tests read it without a build
// (tests/admin-sightings.test.mjs).
//
// The server's words: a sighting's `verification_status` is "unverified", "verified" or "rejected"; the design calls
// the first "pending" (.wb-status[data-status]). Rejecting a sighting also moves it to the recycle bin, and the list of
// all sightings leaves recycled ones out, so a rejected sighting is found in the recycle bin, not under "Rejected".
// Times come as the database's UTC wall time with no zone ("2026-10-31T14:22"), and show in the park's time zone.
import { errorText } from './shell.mjs';
import { can } from './permissions.mjs';
import { ROUTES, hashFor } from './routes.mjs';
import { ApiError, mediaUrl, pageQuery } from '../java-api.mjs';
import { h } from '../vdom.mjs';

/** The rows a page asks for, to begin with, and the choices (AdminSightingService clamps a limit to 1–200). */
export const DEFAULT_LIMIT = 20;
export const PAGE_SIZES = Object.freeze([10, 20, 50, 100]);

export const QUEUE_EMPTY = 'No sightings waiting for review';
export const NO_ENVIRONMENT = 'No environment snapshot';
export const NOT_GIVEN = 'Not given';
export const UNIDENTIFIED = 'Unidentified';

/** The status filter of all sightings: the design's words, and the server's `status` for each (none for all). */
export const STATUS_FILTERS = Object.freeze([
  Object.freeze({ value: 'all', label: 'All', query: undefined }),
  Object.freeze({ value: 'pending', label: 'Pending', query: 'unverified' }),
  Object.freeze({ value: 'verified', label: 'Verified', query: 'verified' }),
  Object.freeze({ value: 'rejected', label: 'Rejected', query: 'rejected' }),
]);

const STATUS_LABELS = Object.freeze({ pending: 'Pending', verified: 'Verified', rejected: 'Rejected' });

/** A value as text, trimmed; nothing is "". @param {unknown} value */
const plain = (value) => (value === null || value === undefined ? '' : String(value).trim());

// --- the requests ---------------------------------------------------------------------------------------------------

/** A sighting's address: its id as one path segment, whatever it holds. @param {string | number} id */
const one = (id) => `/admin/sightings/${encodeURIComponent(String(id))}`;

/**
 * The review queue's page: GET /admin/queue?limit&offset (unverified, not recycled, newest first).
 * @param {{ limit: number, offset: number }} page
 */
export const queueRequest = ({ limit, offset }) => ({ path: '/admin/queue', query: pageQuery(limit, offset) });

/**
 * A page of all sightings: GET /admin/sightings?limit&offset&status&q. `status` is a filter's value (STATUS_FILTERS;
 * "pending" is the server's "unverified", "all" or an unknown one is none); `q` is searched across the whole table
 * (species names, the submitter, the notes), trimmed, and left out when blank.
 * @param {{ limit: number, offset: number, status?: string, q?: string }} page
 */
export const listRequest = ({ limit, offset, status, q }) => ({
  path: '/admin/sightings',
  query: pageQuery(limit, offset, { status: STATUS_FILTERS.find((f) => f.value === status)?.query, q: plain(q) }),
});

/** GET /admin/sightings/{id}: one sighting, shaped as a queue row. @param {string | number} id */
export const sightingRequest = (id) => ({ path: one(id) });

/** GET /admin/sightings/{id}/environment: the conditions at the sighting's time. @param {string | number} id */
export const environmentRequest = (id) => ({ path: `${one(id)}/environment` });

/** GET /admin/sightings/{id}/clip-status: whether its clip is saved, or being saved. @param {string | number} id */
export const clipStatusRequest = (id) => ({ path: `${one(id)}/clip-status` });

/**
 * PATCH /admin/sightings/{id}/approve with { keep: { mediaId: bool } } (approvePayload).
 * @param {any} sighting
 * @param {Record<string, boolean>} [keepMap]
 */
export const approveRequest = (sighting, keepMap) => ({ path: `${one(sighting?.sighting_id)}/approve`, method: 'PATCH', body: approvePayload(sighting, keepMap) });

/** PATCH /admin/sightings/{id}/reject: rejected, and moved to the recycle bin. @param {string | number} id */
export const rejectRequest = (id) => ({ path: `${one(id)}/reject`, method: 'PATCH' });

/** DELETE /admin/sightings/{id}: moved to the recycle bin, its status kept. @param {string | number} id */
export const deleteRequest = (id) => ({ path: one(id), method: 'DELETE' });

/**
 * PATCH /admin/sightings/{id} with { sighting: {…}, species: {…} } (editPayload).
 * @param {string | number} id
 * @param {any} body
 */
export const editRequest = (id, body) => ({ path: one(id), method: 'PATCH', body });

// --- the pager ------------------------------------------------------------------------------------------------------

/**
 * A page as the server answers it ({ rows, total, limit, offset }), or a bare array, or nothing.
 * @param {any} answer
 * @returns {{ rows: any[], total: number }}
 */
export function pageOf(answer) {
  if (Array.isArray(answer)) return { rows: answer, total: answer.length };
  const rows = Array.isArray(answer?.rows) ? answer.rows : [];
  const total = typeof answer?.total === 'number' && Number.isFinite(answer.total) ? answer.total : rows.length;
  return { rows, total };
}

const count = (/** @type {number} */ n) => n.toLocaleString('en-US');

/**
 * @typedef {{
 *   status: 'loading' | 'error' | 'empty' | 'ready',
 *   busy: boolean,
 *   notice: string | null,
 *   retry: boolean,
 *   emptyText: string,
 *   page: number,
 *   pages: number,
 *   rangeLabel: string,
 *   prevDisabled: boolean,
 *   nextDisabled: boolean,
 *   prevOffset: number,
 *   nextOffset: number,
 *   refetchOffset: number | null,
 * }} ListState
 */

/**
 * What a paged list shows. `status`: "error" (the notice, with a retry; never a table that looks as if the data had
 * gone), "loading" (nothing yet, or a page past the end being replaced), "empty" (`empty`, the list's sentence) or
 * "ready" (the table and the pager; `busy` while the next page loads, when paging is off). `refetchOffset` is the
 * last page's offset when the page asked for is past the end, as when the last row of the last page was approved.
 * @param {{ rows: any[], total: number, limit: number, offset: number, loading?: boolean, error?: unknown, empty?: string, failed?: string }} list
 * @returns {ListState}
 */
export function listState({ rows, total, limit, offset, loading = false, error = null, empty = QUEUE_EMPTY, failed = 'The sightings did not load.' }) {
  const list = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Math.floor(Number(limit)) || DEFAULT_LIMIT);
  const all = Math.max(0, Math.floor(Number(total)) || 0);
  const at = Math.max(0, Math.floor(Number(offset)) || 0);
  const pages = Math.max(1, Math.ceil(all / size));
  const page = Math.min(pages, Math.floor(at / size) + 1);
  const failedNow = Boolean(error) && !loading;
  const past = !loading && !failedNow && list.length === 0 && all > 0 && at > 0 && at >= all;
  /** @type {ListState['status']} */
  let status;
  if (failedNow) status = 'error';
  else if (past) status = 'loading';
  else if (list.length > 0) status = 'ready';
  else if (loading) status = 'loading';
  else status = 'empty';
  const from = all === 0 ? 0 : Math.min(at + 1, all);
  const to = Math.min(at + size, all);
  return {
    status,
    busy: Boolean(loading),
    notice: status === 'error' ? `${failed} ${errorText(error)}` : null,
    retry: status === 'error',
    emptyText: empty,
    page,
    pages,
    rangeLabel: all === 0 ? '0 of 0' : `${count(from)}–${count(to)} of ${count(all)}`,
    prevDisabled: Boolean(loading) || at <= 0,
    nextDisabled: Boolean(loading) || at + size >= all,
    prevOffset: Math.max(0, at - size),
    nextOffset: at + size,
    refetchOffset: past ? (pages - 1) * size : null,
  };
}

/**
 * The sentence for an empty view of all sightings: a search that matched nothing, else the filter's. A rejected
 * sighting is in the recycle bin, which this list leaves out, so "Rejected" says where to look.
 * @param {{ status?: string, q?: string }} view
 */
export function sightingsEmpty({ status, q }) {
  if (plain(q)) return 'No sightings match the search.';
  if (status === 'pending') return 'No pending sightings.';
  if (status === 'verified') return 'No verified sightings.';
  if (status === 'rejected') return 'No rejected sightings here: a rejected sighting goes to the recycle bin.';
  return 'No sightings yet.';
}

/**
 * Why a review did not open: the sighting is not there (404), or it did not load and can be asked for again.
 * @param {string | number} id
 * @param {unknown} error
 * @returns {{ text: string, retry: boolean }}
 */
export function loadFailure(id, error) {
  if (error instanceof ApiError && error.status === 404) return { text: `Sighting ${id} was not found.`, retry: false };
  return { text: `Sighting ${id} did not load. ${errorText(error)}`, retry: true };
}

/**
 * A list's body: the error notice and its retry, the loading line, the empty sentence, or the table and the pager
 * (built only then).
 * @param {ListState} state
 * @param {{ onRetry: () => void, table: () => any, pager: () => any }} parts
 */
export function listBody(state, { onRetry, table, pager }) {
  if (state.status === 'error') {
    return h(
      'div',
      { className: 'wb-notice wb-notice--error site-admin__notice', role: 'alert' },
      h('p', null, state.notice),
      h('button', { className: 'wb-btn wb-btn--action', type: 'button', onClick: onRetry }, 'Try again'),
    );
  }
  if (state.status === 'loading') return h('p', { role: 'status' }, 'Loading sightings…');
  if (state.status === 'empty') return h('p', null, state.emptyText);
  return h('div', { className: 'site-admin__list', 'aria-busy': state.busy }, table(), pager());
}

/**
 * The pager (.wb-pager): the range in words, Previous and Next, and the page size. A button that cannot be used is
 * aria-disabled, which leaves it clickable, so its handler checks first.
 * @param {ListState} state
 * @param {{ label: string, limit: number, sizeId: string, onPage: (offset: number) => void, onLimit: (limit: number) => void }} options
 */
export const pagerNode = (state, { label, limit, sizeId, onPage, onLimit }) =>
  h(
    'nav',
    { className: 'wb-pager', 'aria-label': label },
    h('p', { className: 'wb-pager__info' }, state.rangeLabel),
    h(
      'button',
      {
        className: 'wb-pager__prev',
        type: 'button',
        'aria-disabled': state.prevDisabled ? 'true' : undefined,
        onClick: () => {
          if (!state.prevDisabled) onPage(state.prevOffset);
        },
      },
      'Previous',
    ),
    h(
      'button',
      {
        className: 'wb-pager__next',
        type: 'button',
        'aria-disabled': state.nextDisabled ? 'true' : undefined,
        onClick: () => {
          if (!state.nextDisabled) onPage(state.nextOffset);
        },
      },
      'Next',
    ),
    h('label', { className: 'wb-sr-only', htmlFor: sizeId }, 'Rows per page'),
    h(
      'select',
      { className: 'wb-select', id: sizeId, value: limit, onChange: (/** @type {any} */ event) => onLimit(Number(event.target.value)) },
      PAGE_SIZES.map((n) => h('option', { key: n, value: n }, n)),
    ),
  );

// --- times and names ------------------------------------------------------------------------------------------------

const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/New_York',
});
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/**
 * A time from the API as Wahoo Bay reads it: "Oct 31, 2026, 10:22 AM", in the park's time zone. A time with no zone is
 * the database's UTC (the sighting form's times are stored so: SightingWriteService.normalizeDatetime); a day alone
 * stays that day. Nothing is NOT_GIVEN; what is no time is shown as it is.
 * @param {unknown} value
 */
export function formatWhen(value) {
  const text = plain(value);
  if (!text) return NOT_GIVEN;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  if (!m) return text;
  const [, y, mo, d, hh, mm, ss, zone] = m;
  if (hh === undefined) return DAY.format(new Date(Date.UTC(+y, +mo - 1, +d)));
  const ms = zone ? Date.parse(text.replace(' ', 'T')) : Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss ?? 0));
  if (!Number.isFinite(ms)) return text;
  return WHEN.format(new Date(ms)).replace(/ /g, ' ');
}

/**
 * Where a sighting stands, in the design's words: "verified", "rejected", else "pending" (the server's "unverified").
 * @param {any} sighting
 * @returns {'pending' | 'verified' | 'rejected'}
 */
export function statusOf(sighting) {
  const status = plain(sighting?.verification_status).toLowerCase();
  return status === 'verified' ? 'verified' : status === 'rejected' ? 'rejected' : 'pending';
}

/** A provisional name (the visitor's guess) is no identification. @param {any} s */
const provisional = (s) => s?.name_status === 'provisional' || /^\s*\[unverified\]/i.test(plain(s?.scientific_name));

/** The species a sighting shows: its common name, else its scientific one, else UNIDENTIFIED. @param {any} s */
const speciesName = (s) => (provisional(s) ? UNIDENTIFIED : plain(s?.common_name) || plain(s?.scientific_name) || UNIDENTIFIED);

// --- media ----------------------------------------------------------------------------------------------------------

/** @param {any} m */
const isFrame = (m) => m.frame === true || m.storage_type === 'frame' || m.kind === 'frame';
/** A moving picture (a frame is archived too, but still). @param {any} m */
const isVideo = (m) => !isFrame(m) && (m.kind === 'video' || m.media_kind === 'video' || m.storage_type === 'youtube' || m.role === 'video');
/** Saved in the API's database: GET /clips/{id} serves it. @param {any} m */
const isArchived = (m) => m.archived === true || plain(m.archive_uri) !== '';

/** A YouTube video's id in a youtube.com or youtu.be address. @param {string} url */
const youtubeIdIn = (url) => {
  if (!/^https?:\/\/(?:(?:www|m)\.)?(?:youtube\.com|youtu\.be)\//i.test(url)) return null;
  return /(?:[?&]v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)([\w-]{6,})/.exec(url)?.[1] ?? null;
};

/** The YouTube video of a media item: its stored key, else one in its address. @param {any} m */
const youtubeIdOf = (m) => {
  const key = plain(m.video_id) || (m.storage_type === 'youtube' ? plain(m.storage_key) : '');
  if (/^[\w-]{6,}$/.test(key)) return key;
  return youtubeIdIn(plain(m.url ?? m.media_url));
};

const youtubeStill = (/** @type {string} */ id) => `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

/**
 * A picture at `value`, an address an <img> can load: an upload under the API, a YouTube video's still, a Drive file
 * through the API's proxy (with the token: the proxy asks for one unless the media is public), or any other http(s)
 * address as it is. A path into the uploads that is no flat name, and any other scheme, is none.
 * @param {unknown} value
 * @param {string | null | undefined} token
 * @param {string} size Drive's thumbnail width ("w640")
 */
function pictureAt(value, token, size) {
  const url = plain(value);
  if (!url) return null;
  if (url.startsWith('/uploads/')) {
    const key = url.slice('/uploads/'.length);
    return /^[^/\\?#]+$/.test(key) && key !== '.' && key !== '..' ? mediaUrl('upload', url) : null;
  }
  if (!/^https?:\/\//i.test(url)) return null;
  const video = youtubeIdIn(url);
  if (video) return youtubeStill(video);
  if (/^https?:\/\/(?:drive|docs)\.google\.com\//i.test(url)) {
    const file = /(?:\/d\/|[?&]id=)([\w-]{20,})/.exec(url)?.[1];
    if (file) return mediaUrl('thumb', `https://drive.google.com/thumbnail?id=${file}&sz=${size}`, token);
  }
  return url;
}

/**
 * A media item's thumbnail address, or null: a saved clip's poster (a saved frame is its own picture), a YouTube
 * video's still, else its thumbnail or its own address (pictureAt). The token goes only into the API's addresses.
 * @param {any} media a media_list item, or a sighting row (which carries its primary media's fields)
 * @param {string | null} [token]
 */
export function thumbOf(media, token) {
  if (!media || typeof media !== 'object') return null;
  if (isArchived(media) && media.media_id != null) return mediaUrl(isVideo(media) ? 'poster' : 'clip', media.media_id, token);
  const video = youtubeIdOf(media);
  if (video) return youtubeStill(video);
  return pictureAt(media.thumb_url, token, 'w640') ?? pictureAt(media.url ?? media.media_url, token, 'w640');
}

/**
 * How the review shows a media item large: a saved clip plays from the API (its poster first); a saved frame shows;
 * a YouTube video not saved shows its still and links to it at the marked moment; a photo shows; else none.
 * @param {any} media
 * @param {string | null} [token]
 * @returns {{ type: 'video', src: string, poster: string } | { type: 'youtube', src: string, href: string } | { type: 'image', src: string } | { type: 'none' }}
 */
export function mediaView(media, token) {
  if (!media || typeof media !== 'object') return { type: 'none' };
  const id = media.media_id;
  if (isArchived(media) && id != null) {
    return isVideo(media) ? { type: 'video', src: mediaUrl('clip', id, token), poster: mediaUrl('poster', id, token) } : { type: 'image', src: mediaUrl('clip', id, token) };
  }
  const video = youtubeIdOf(media);
  if (video) {
    const start = Number.isInteger(media.clip_start) && media.clip_start > 0 ? `&t=${media.clip_start}s` : '';
    return { type: 'youtube', src: youtubeStill(video), href: `https://www.youtube.com/watch?v=${encodeURIComponent(video)}${start}` };
  }
  const src = pictureAt(media.url ?? media.media_url, token, 'w1600') ?? pictureAt(media.thumb_url, token, 'w1600');
  return src ? { type: 'image', src } : { type: 'none' };
}

/**
 * A sighting's media (the server's media_list: the clip, the photos, the frames), its primary one first; an item with
 * no id is left out.
 * @param {any} sighting
 * @returns {any[]}
 */
export function mediaOf(sighting) {
  const list = Array.isArray(sighting?.media_list) ? sighting.media_list.filter((m) => m && typeof m === 'object' && m.media_id != null) : [];
  const primary = sighting?.media_id;
  if (primary === null || primary === undefined) return list;
  const i = list.findIndex((m) => String(m.media_id) === String(primary));
  return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
}

/**
 * An image the browser could not load hides, rather than show a broken picture.
 * @param {{ currentTarget?: { hidden: boolean } | null }} event
 */
export const hideBroken = (event) => {
  if (event?.currentTarget) event.currentTarget.hidden = true;
};

/** Media whose address carries the token never sends a Referer (plan 9, Ruling 5). */
const NO_REFERRER = 'no-referrer';

// --- the rows -------------------------------------------------------------------------------------------------------

const REVIEW = /** @type {import('./routes.mjs').Route} */ (ROUTES.find((r) => r.screen === 'review'));

/**
 * @typedef {{
 *   id: number | null,
 *   href: string | null,
 *   when: string,
 *   species: string,
 *   scientific: string | null,
 *   newSpecies: boolean,
 *   status: 'pending' | 'verified' | 'rejected',
 *   statusLabel: string,
 *   submitter: string,
 *   camera: string,
 *   thumb: { src: string, video: boolean } | null,
 * }} SightingRow
 */

/**
 * A row of the queue or of all sightings, from the server's fields as the old queue read them: when it was seen (else
 * logged), the species (UNIDENTIFIED while provisional or missing) and its scientific name, whether it is a new species
 * (no species, a provisional one, or its only sighting: the server's `cat`), the status, who sent it (the name they
 * gave, else what kind of contributor) and from which camera, and the primary media's thumbnail.
 * @param {any} s
 * @param {string | null} [token]
 * @returns {SightingRow}
 */
export function sightingRow(s, token) {
  const id = typeof s?.sighting_id === 'number' ? s.sighting_id : s?.sighting_id != null ? Number(s.sighting_id) : null;
  const primary = mediaOf(s)[0] ?? (s?.media_id != null ? s : null);
  const thumb = primary ? thumbOf(primary, token) : null;
  const status = statusOf(s);
  return {
    id,
    href: id === null || !Number.isFinite(id) ? null : hashFor(REVIEW, { id }),
    when: formatWhen(s?.sighting_datetime || s?.created_at),
    species: speciesName(s),
    scientific: plain(s?.scientific_name) || null,
    newSpecies: s?.species_id === null || s?.species_id === undefined || s?.cat === 'new' || provisional(s),
    status,
    statusLabel: STATUS_LABELS[status],
    submitter: plain(s?.volunteer_name) || plain(s?.contributor_type) || NOT_GIVEN,
    camera: plain(s?.camera_name) || NOT_GIVEN,
    thumb: thumb ? { src: thumb, video: isVideo(primary) } : null,
  };
}

/** The queue's columns, and those of all sightings (which add an Actions column when rows can be recycled). */
export const QUEUE_COLUMNS = Object.freeze(['media', 'species', 'submitter', 'camera', 'when', 'id']);
export const SIGHTINGS_COLUMNS = Object.freeze(['media', 'species', 'status', 'camera', 'when', 'submitter', 'id']);

const COLUMN_LABELS = Object.freeze({
  media: 'Media',
  species: 'Species',
  status: 'Status',
  camera: 'Camera',
  when: 'Seen',
  submitter: 'Submitted by',
  id: 'ID',
  actions: 'Actions',
});

/**
 * A sighting's status chip (.wb-status: never the accent).
 * @param {'pending' | 'verified' | 'rejected'} status
 */
export const statusChip = (status) => h('span', { className: 'wb-chip wb-status', 'data-status': status }, STATUS_LABELS[status]);

/**
 * One cell of a row. The species is the row's header and links to its review.
 * @param {string} column
 * @param {SightingRow} row
 * @param {((row: SightingRow) => void) | undefined} onRecycle
 */
function cell(column, row, onRecycle) {
  const label = COLUMN_LABELS[/** @type {keyof typeof COLUMN_LABELS} */ (column)];
  switch (column) {
    case 'media':
      return h(
        'td',
        { key: column, 'data-label': label },
        row.thumb
          ? h('img', {
              className: 'wb-media site-admin__thumb',
              src: row.thumb.src,
              alt: row.thumb.video ? 'Video' : '',
              width: 80,
              height: 60,
              loading: 'lazy',
              decoding: 'async',
              referrerPolicy: NO_REFERRER,
              onError: hideBroken,
            })
          : 'No media',
      );
    case 'species':
      return h(
        'th',
        { key: column, scope: 'row', 'data-label': label },
        row.href ? h('a', { href: row.href }, row.species) : row.species,
        row.scientific && row.scientific !== row.species && h('span', { className: 'site-admin__sub' }, h('i', null, row.scientific)),
        row.newSpecies && h('span', { className: 'site-admin__sub' }, 'New species'),
      );
    case 'status':
      return h('td', { key: column, 'data-label': label }, statusChip(row.status));
    case 'actions':
      return h(
        'td',
        { key: column, 'data-label': label },
        onRecycle &&
          h(
            'button',
            { className: 'wb-btn wb-btn--ghost', type: 'button', onClick: () => onRecycle(row) },
            'Recycle',
            h('span', { className: 'wb-sr-only' }, ` sighting ${row.id}`),
          ),
      );
    case 'id':
      return h('td', { key: column, 'data-label': label }, row.id === null ? NOT_GIVEN : String(row.id));
    default:
      return h('td', { key: column, 'data-label': label }, /** @type {any} */ (row)[column] ?? NOT_GIVEN);
  }
}

/**
 * A table of sightings (.wb-table in its .wb-table-wrap, stacking into labelled cards where the wrapper is narrow):
 * the caption for screen readers, a header row, then a row per sighting, each cell carrying its column in
 * data-label. With `onRecycle`, an Actions column holds each row's Recycle button.
 * @param {SightingRow[]} rows
 * @param {{ caption: string, columns: readonly string[], onRecycle?: (row: SightingRow) => void }} options
 */
export function sightingsTable(rows, { caption, columns, onRecycle }) {
  const cols = onRecycle ? [...columns, 'actions'] : [...columns];
  return h(
    'div',
    { className: 'wb-table-wrap' },
    h(
      'table',
      { className: 'wb-table', 'data-stack': '' },
      h('caption', { className: 'wb-sr-only' }, caption),
      h('thead', null, h('tr', null, cols.map((c) => h('th', { key: c, scope: 'col' }, COLUMN_LABELS[/** @type {keyof typeof COLUMN_LABELS} */ (c)])))),
      h('tbody', null, rows.map((row) => h('tr', { key: String(row.id) }, cols.map((c) => cell(c, row, onRecycle))))),
    ),
  );
}

// --- the review -----------------------------------------------------------------------------------------------------

/**
 * The approve body (plan 9, Review Focus 5): { keep: { "<mediaId>": true|false } }, one entry for each of the
 * sighting's media, kept unless `keepMap` says false; a sighting with no media sends { keep: {} }. The server drops the
 * media not kept.
 * @param {any} sighting
 * @param {Record<string, boolean>} [keepMap]
 * @returns {{ keep: Record<string, boolean> }}
 */
export function approvePayload(sighting, keepMap = {}) {
  /** @type {Record<string, boolean>} */
  const keep = {};
  for (const m of mediaOf(sighting)) {
    const id = String(m.media_id);
    keep[id] = keepMap?.[id] !== false;
  }
  return { keep };
}

/**
 * @typedef {{ shown: boolean, enabled: boolean }} Action
 * @typedef {{ approve: Action, reject: Action, delete: Action, edit: Action }} ReviewActions
 */

/**
 * Which of the review's actions show and which can be pressed. Each needs reviewSightings (CapabilityFilter: every
 * /admin/sightings route). Approve and reject are for a pending sighting only; a rejected one is already in the recycle
 * bin, so it has no delete either. While a request is in flight (`busy`) none can be pressed, so a double click
 * cannot approve twice.
 * @param {any} user
 * @param {any} sighting
 * @param {boolean} busy
 * @returns {ReviewActions}
 */
export function reviewActions(user, sighting, busy) {
  const may = Boolean(sighting) && can(user, 'reviewSightings');
  const status = statusOf(sighting);
  /** @param {boolean} shown */
  const action = (shown) => ({ shown, enabled: shown && !busy });
  return {
    approve: action(may && status === 'pending'),
    reject: action(may && status === 'pending'),
    delete: action(may && status !== 'rejected'),
    edit: action(may),
  };
}

/** The confirm dialogs (.wb-dialog) before a reject and a delete. */
export const CONFIRM = Object.freeze({
  /** @param {string | number} id */
  reject: (id) => ({
    title: `Reject sighting ${id}?`,
    body: 'It leaves the queue as rejected and goes to the recycle bin. You can restore it from there, or undo it in the activity log.',
    confirm: 'Reject',
  }),
  /** @param {string | number} id */
  delete: (id) => ({
    title: `Move sighting ${id} to the recycle bin?`,
    body: 'Its status stays as it is. You can restore it from the recycle bin.',
    confirm: 'Move to recycle bin',
  }),
});

/** The categories a reviewer can give a species, and the life stages a sighting can have (the old review's lists). */
export const SPECIES_CATEGORIES = Object.freeze(['Fish', 'Shark & Ray', 'Invertebrate', 'Reptile', 'Bird', 'Mammal', 'Other']);
export const LIFE_STAGES = Object.freeze(['Adult', 'Juvenile', 'Larval', 'Unknown']);

/**
 * @typedef {{ key: string, group: 'species' | 'sighting', label: string, kind: 'text' | 'select' | 'textarea', options?: readonly string[] }} Field
 */

/**
 * The review's editable fields: the linked species' (which change it for every sighting of it) and this sighting's,
 * each one the server lets a reviewer change (AdminSightingService SPECIES_EDITABLE, SIGHTING_EDITABLE) and the row
 * carries, so a field is never sent blank over a value the screen did not have.
 * @type {readonly Field[]}
 */
export const FIELDS = Object.freeze(
  /** @type {Field[]} */ ([
    { key: 'common_name', group: 'species', label: 'Common name', kind: 'text' },
    { key: 'scientific_name', group: 'species', label: 'Scientific name', kind: 'text' },
    { key: 'family', group: 'species', label: 'Family', kind: 'text' },
    { key: 'genus', group: 'species', label: 'Genus', kind: 'text' },
    { key: 'category', group: 'species', label: 'Category', kind: 'select', options: SPECIES_CATEGORIES },
    { key: 'conservation_status', group: 'species', label: 'Conservation status', kind: 'text' },
    { key: 'life_stage', group: 'sighting', label: 'Life stage', kind: 'select', options: LIFE_STAGES },
    { key: 'individual_name', group: 'sighting', label: 'Group or individual', kind: 'text' },
    { key: 'volunteer_name', group: 'sighting', label: 'Submitted by', kind: 'text' },
    { key: 'notes', group: 'sighting', label: 'Note', kind: 'textarea' },
  ]).map((f) => Object.freeze(f)),
);

/**
 * A select's choices: none, the list, and the value it holds when that is not in the list (so it is never lost).
 * @param {Field} field
 * @param {string} value
 */
export const optionsFor = (field, value) => {
  const list = [...(field.options ?? [])];
  return ['', ...list, ...(plain(value) && !list.includes(plain(value)) ? [plain(value)] : [])];
};

/**
 * The form's starting values: each field's value in the sighting, as text.
 * @param {any} sighting
 * @returns {Record<string, string>}
 */
export const reviewFields = (sighting) => Object.fromEntries(FIELDS.map((f) => [f.key, sighting?.[f.key] == null ? '' : String(sighting[f.key])]));

/**
 * The edit body: { sighting: {…}, species: {…} } with each field that changed (trimmed, as the server trims), or null
 * when nothing did. Species fields only when the sighting has a species. An emptied field is sent as "" (the server
 * stores null).
 * @param {any} sighting
 * @param {Record<string, string>} fields
 * @returns {{ sighting?: Record<string, string>, species?: Record<string, string> } | null}
 */
export function editPayload(sighting, fields) {
  if (!sighting) return null;
  /** @type {Record<string, Record<string, string>>} */
  const out = {};
  for (const f of FIELDS) {
    if (f.group === 'species' && (sighting.species_id === null || sighting.species_id === undefined)) continue;
    const after = plain(fields?.[f.key]);
    if (plain(sighting[f.key]) === after) continue;
    (out[f.group] ??= {})[f.key] = after;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The sighting as the server has it after an edit (an emptied field is null).
 * @param {any} sighting
 * @param {{ sighting?: Record<string, string>, species?: Record<string, string> } | null} payload
 */
export function savedSighting(sighting, payload) {
  if (!payload) return sighting;
  const next = { ...sighting };
  for (const group of [payload.sighting, payload.species]) {
    for (const [key, value] of Object.entries(group ?? {})) next[key] = value === '' ? null : value;
  }
  return next;
}

/**
 * The facts of a sighting the review lists, as a <dl>, each term in bold.
 * @param {any} s
 */
export function factsNode(s) {
  const row = sightingRow(s);
  const facts = [
    ['Seen', formatWhen(s?.sighting_datetime)],
    ['Logged', formatWhen(s?.created_at)],
    ['Camera', row.camera],
    ['Submitted by', row.submitter],
    ['Contributor', plain(s?.contributor_type) || NOT_GIVEN],
    ['Species', row.newSpecies ? 'New species' : 'Known species'],
  ];
  return h('dl', { className: 'site-admin__facts' }, facts.map(([term, value]) => [h('dt', { key: `${term}-t` }, h('b', null, term)), h('dd', { key: `${term}-d` }, value)]));
}

// --- conditions and the clip ----------------------------------------------------------------------------------------

/** A reading as text: a number to two places, a list or a record as its parts. @param {unknown} value @returns {string} */
const reading = (value) => {
  if (value === null || value === undefined || value === '') return NOT_GIVEN;
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : NOT_GIVEN;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.map(reading).join(', ');
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k} ${reading(v)}`).join(', ');
  return String(value).trim();
};

/**
 * @typedef {{ label: string, value: string, description: string | null }} Line
 * @typedef {{ empty: boolean, note: string | null, groups: { title: string, lines: Line[] }[] }} Conditions
 */

/**
 * The conditions at the sighting's time (GET …/environment), as the old review showed them: when they were matched
 * to, then the labelled groups (weather, water quality: each reading with its unit), or, for an older snapshot, one
 * group per sensor station (when its reading was taken, how far from the sighting, its readings). No readings at all is
 * NO_ENVIRONMENT.
 * @param {any} env
 * @returns {Conditions}
 */
export function environmentSummary(env) {
  const none = () => ({ empty: true, note: NO_ENVIRONMENT, groups: [] });
  if (!env || typeof env !== 'object' || Array.isArray(env)) return none();
  /** @type {Conditions['groups']} */
  const groups = [];
  for (const g of Array.isArray(env.groups) ? env.groups : []) {
    const items = Array.isArray(g?.items) ? g.items.filter((it) => it && typeof it === 'object' && it.value !== null && it.value !== undefined) : [];
    if (!items.length) continue;
    groups.push({
      title: plain(g.title) || 'Readings',
      lines: items.map((it) => ({
        label: plain(it.label) || plain(it.attribute) || 'Reading',
        value: plain(it.unit) ? `${reading(it.value)} ${plain(it.unit)}` : reading(it.value),
        description: plain(it.description) || null,
      })),
    });
  }
  if (!groups.length && env.data && typeof env.data === 'object' && !Array.isArray(env.data)) {
    for (const [station, d] of Object.entries(env.data)) {
      if (!d || typeof d !== 'object') continue;
      /** @type {Line[]} */
      const lines = [];
      const taken = plain(d.observed_at) ? formatWhen(d.observed_at) : null;
      const off = typeof d.dist_min === 'number' && Number.isFinite(d.dist_min) ? `${reading(d.dist_min)} min from the sighting` : null;
      if (taken || off) lines.push({ label: 'Reading taken', value: [taken, off].filter(Boolean).join(', '), description: null });
      if (Array.isArray(d.readings)) d.readings.forEach((v, i) => lines.push({ label: `Reading ${i + 1}`, value: reading(v), description: null }));
      else if (d.readings && typeof d.readings === 'object') for (const [k, v] of Object.entries(d.readings)) lines.push({ label: k, value: reading(v), description: null });
      if (lines.length) groups.push({ title: station, lines });
    }
  }
  if (!groups.length) return none();
  const matched = plain(env.observed_for) ? formatWhen(env.observed_for) : null;
  const captured = plain(env.captured_at) ? formatWhen(env.captured_at) : null;
  const note = matched ? `Matched to ${matched}${captured ? `, captured ${captured}` : ''}.` : captured ? `Captured ${captured}.` : null;
  return { empty: false, note, groups };
}

/**
 * The conditions as markup: the note, then each group as a heading and a list of terms.
 * @param {Conditions} summary
 */
export function environmentNode(summary) {
  if (summary.empty) return h('p', null, summary.note);
  return h(
    'div',
    { className: 'site-admin__conditions' },
    summary.note && h('p', null, summary.note),
    summary.groups.map((g) =>
      h(
        'div',
        { key: g.title },
        h('h4', null, g.title),
        h('dl', { className: 'site-admin__facts' }, g.lines.map((l) => [h('dt', { key: `${l.label}-t`, title: l.description ?? undefined }, h('b', null, l.label)), h('dd', { key: `${l.label}-d` }, l.value)])),
      ),
    ),
  );
}

/**
 * What GET …/clip-status says ({ media_id, archived, state }: ClipService's pending, done, skipped or failed, else
 * none), and whether to ask again (only while it is being saved). Nothing yet is null.
 * @param {any} status
 * @returns {{ text: string, pending: boolean } | null}
 */
export function clipSummary(status) {
  if (!status || typeof status !== 'object') return null;
  if (status.archived === true || status.state === 'done') return { text: 'Clip saved for review', pending: false };
  if (status.state === 'pending') return { text: 'Saving the clip…', pending: true };
  if (status.state === 'failed') return { text: 'Saving the clip failed', pending: false };
  if (status.state === 'skipped') return { text: 'The clip was not saved', pending: false };
  return { text: 'No saved clip', pending: false };
}

// --- the media's markup ---------------------------------------------------------------------------------------------

/**
 * A media item large (mediaView): the saved clip with its poster and controls, a YouTube still with a link to the
 * video, a photo, or "No media attached". Every picture and the clip carry referrerPolicy no-referrer.
 * @param {ReturnType<typeof mediaView>} view
 */
export function mediaNode(view) {
  switch (view.type) {
    case 'video':
      return h(
        'div',
        { className: 'wb-video site-admin__hero' },
        h('video', { src: view.src, poster: view.poster, controls: true, preload: 'metadata', playsInline: true, referrerPolicy: NO_REFERRER }, 'This browser cannot play the clip.'),
      );
    case 'youtube':
      return h(
        'div',
        { className: 'site-admin__media' },
        h('div', { className: 'wb-video site-admin__hero' }, h('img', { src: view.src, alt: 'A still from the video', referrerPolicy: NO_REFERRER, onError: hideBroken })),
        h('p', null, h('a', { href: view.href, target: '_blank', rel: 'noreferrer noopener' }, 'Watch the video on YouTube')),
      );
    case 'image':
      return h('div', { className: 'wb-video site-admin__hero' }, h('img', { src: view.src, alt: 'The media sent with the sighting', referrerPolicy: NO_REFERRER, onError: hideBroken }));
    default:
      return h('p', null, 'No media attached');
  }
}

/**
 * With two or more media, the list to choose from: each one's thumbnail, a button that shows it large (pressed, and
 * in action blue, for the one shown), and a Keep box (checked unless discarded). One item or none: null.
 * @param {any[]} media mediaOf(sighting)
 * @param {{ active: string | number | null, keep: Record<string, boolean>, token: string | null, onShow: (id: any) => void, onKeep: (id: any, keep: boolean) => void }} options
 */
export function mediaPicker(media, { active, keep, token, onShow, onKeep }) {
  if (media.length < 2) return null;
  return h(
    'div',
    { className: 'site-admin__picker' },
    h('p', null, 'Choose which to keep. What you do not keep is dropped when you approve.'),
    h(
      'ul',
      { className: 'site-admin__media-list', role: 'list' },
      media.map((m, i) => {
        const id = String(m.media_id);
        const thumb = thumbOf(m, token);
        const box = `keep-media-${id}`;
        return h(
          'li',
          { key: id, className: 'site-admin__media-item' },
          h(
            'button',
            { className: `wb-btn ${String(active) === id ? 'wb-btn--action' : 'wb-btn--ghost'} site-admin__media-button`, type: 'button', 'aria-pressed': String(active) === id, onClick: () => onShow(m.media_id) },
            thumb
              ? h('img', { className: 'wb-media site-admin__thumb', src: thumb, alt: '', width: 80, height: 60, loading: 'lazy', referrerPolicy: NO_REFERRER, onError: hideBroken })
              : h('span', null, isVideo(m) ? 'Video' : 'Media'),
            h('span', { className: 'wb-sr-only' }, `Show media ${i + 1} of ${media.length}`),
          ),
          h(
            'span',
            { className: 'site-admin__check' },
            h('input', { type: 'checkbox', id: box, checked: keep?.[id] !== false, onChange: (/** @type {any} */ event) => onKeep(m.media_id, Boolean(event.target.checked)) }),
            h('label', { htmlFor: box }, 'Keep', h('span', { className: 'wb-sr-only' }, ` media ${i + 1}`)),
          ),
        );
      }),
    ),
  );
}
