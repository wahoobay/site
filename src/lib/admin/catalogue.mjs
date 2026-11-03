// The sighting review's catalogue screens: the species list (#/species), one species (#/species/:id) and the media
// library (#/media), drawn by src/islands/admin/{Species,SpeciesDetail,Media}.tsx. Everything they decide is here: the
// requests (paths, queries and bodies as the Java API's AdminSpeciesController and AdminMediaController take them), the
// rows, which actions show, the payloads, the confirm dialogs' words and the empty sentences; and the markup of their
// tables as a small VDOM (src/lib/vdom.mjs) the islands hand to React. A plain module, so the tests read it without a
// build (tests/admin-catalogue.test.mjs).
//
// What the server checks (CapabilityFilter): every /admin/species route needs editSpecies; GET /admin/media needs
// editMedia, PATCH /admin/media/{id} (show or hide) needs hideMedia, and DELETE needs editMedia and hideMedia.
// What the server does that a payload must not trigger by accident (AdminSpeciesService, AdminMediaService):
// - PATCH /admin/species/{id} writes every editable key it is sent, an empty one as null, so only changed fields go;
//   a scientific name another species has saves nothing at all and answers { needs_merge, target }.
// - POST /admin/species/{id}/move moves the sightings INTO species {id}; their media keep their species.
// - POST …/merge moves every sighting (recycled ones too) and the media, then deletes the species; it has no undo.
// - DELETE /admin/species/{id}?mode=unsorted detaches its sightings and media; mode=delete recycles its sightings,
//   which keep the deleted species' id. Neither has an undo.
// - DELETE /admin/media/{id} is refused with 409 + linked_sightings while a live sighting uses it; ?force=true would
//   detach it from those sightings first, and is never sent.
import { can } from './permissions.mjs';
import { ROUTES, hashFor } from './routes.mjs';
import { errorText } from './shell.mjs';
import { NOT_GIVEN, SPECIES_CATEGORIES, formatWhen, sightingRow, statusChip, thumbOf } from './sightings.mjs';
import { checkNode, idOf, idsOf, plural, recordsTable, thumbNode } from './lists.mjs';
import { ApiError, pageQuery } from '../java-api.mjs';
import { h } from '../vdom.mjs';

/** A value as text, trimmed; nothing is "". @param {unknown} value */
const plain = (value) => (value === null || value === undefined ? '' : String(value).trim());

/** A count from the API (a number, or a number in text). @param {unknown} value */
const countOf = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/** @param {string | number} id */
const speciesPath = (id) => `/admin/species/${encodeURIComponent(String(id))}`;
/** @param {string | number} id */
const mediaPath = (id) => `/admin/media/${encodeURIComponent(String(id))}`;

const SPECIES_ROUTE = /** @type {import('./routes.mjs').Route} */ (ROUTES.find((r) => r.screen === 'speciesDetail'));

/** @param {any} m A moving picture (a frame is a still). */
const isVideo = (m) => m?.storage_type !== 'frame' && m?.media_kind !== 'frame' && (m?.media_kind === 'video' || m?.storage_type === 'youtube');

/** A name a visitor typed, which no reviewer has confirmed (SightingWriteService: "[unverified] <name>"). @param {any} s */
const isProvisional = (s) => s?.name_status === 'provisional' || /^\s*\[unverified\]/i.test(plain(s?.scientific_name));

/** A scientific name, or null for the "[unverified] …" placeholder. @param {any} s */
const scientificOf = (s) => {
  const sci = plain(s?.scientific_name);
  return sci && !/^\[unverified\]/i.test(sci) ? sci : null;
};

/** A species' name: its common name, else its scientific one. @param {any} s */
const nameOf = (s) => plain(s?.common_name) || scientificOf(s) || 'Unnamed species';

/** When last (or first) seen, or that it has not been. @param {unknown} value */
const seenOf = (value) => (plain(value) ? formatWhen(value) : 'Not seen yet');

// --- the species list -----------------------------------------------------------------------------------------------

export const SPECIES_EMPTY = 'No species yet.';

/** The category filter: all, each category a reviewer can give (SPECIES_CATEGORIES), and none. */
export const SPECIES_CATEGORY_FILTERS = Object.freeze([
  Object.freeze({ value: 'all', label: 'All categories' }),
  ...SPECIES_CATEGORIES.map((c) => Object.freeze({ value: c, label: c })),
  Object.freeze({ value: 'uncategorized', label: 'Uncategorized' }),
]);

/** GET /admin/species: every species with a sighting or a media item, most seen first (AdminSpeciesService.list). */
export const speciesListRequest = () => ({ path: '/admin/species' });

/**
 * @typedef {{
 *   id: number | null,
 *   href: string | null,
 *   name: string,
 *   scientific: string | null,
 *   provisional: boolean,
 *   category: string,
 *   conservation: string,
 *   family: string,
 *   sightings: number,
 *   media: number,
 *   lastSeen: string,
 *   thumb: { src: string, video: boolean } | null,
 * }} SpeciesRow
 */

/**
 * A species as the list shows it: its names (a provisional one flagged, its "[unverified]" placeholder no scientific
 * name), category, conservation status, family, how many sightings (outside the recycle bin) and media, when last
 * seen, and its picture: the pinned one, else its newest media (the list's thumb_* fields).
 * @param {any} s
 * @param {string | null} [token]
 * @returns {SpeciesRow}
 */
export function speciesRow(s, token) {
  const id = idOf(s?.species_id);
  const media = {
    media_id: s?.thumb_media_id ?? null,
    archive_uri: s?.thumb_archive_uri ?? null,
    storage_type: s?.thumb_storage_type ?? null,
    storage_key: s?.thumb_storage_key ?? null,
    url: s?.thumb_url ?? null,
  };
  const src = thumbOf(media, token);
  return {
    id,
    href: id === null ? null : hashFor(SPECIES_ROUTE, { id }),
    name: nameOf(s),
    scientific: scientificOf(s),
    provisional: isProvisional(s),
    category: plain(s?.category) || 'Uncategorized',
    conservation: plain(s?.conservation_status) || NOT_GIVEN,
    family: plain(s?.family) || NOT_GIVEN,
    sightings: countOf(s?.sightings),
    media: countOf(s?.media),
    lastSeen: seenOf(s?.last_seen),
    thumb: src ? { src, video: isVideo(media) } : null,
  };
}

/**
 * The species a search and a category leave: the search (trimmed, any case) in the common, scientific, family or genus
 * name; the category exactly, "uncategorized" for none, "all" for any.
 * @param {any[]} rows the API's species
 * @param {{ q?: string, category?: string }} view
 */
export function filterSpecies(rows, { q, category }) {
  const term = plain(q).toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter((s) => {
    const cat = plain(s?.category);
    if (category === 'uncategorized' && cat) return false;
    if (category && category !== 'all' && category !== 'uncategorized' && cat !== category) return false;
    if (!term) return true;
    return [s?.common_name, s?.scientific_name, s?.family, s?.genus].some((v) => plain(v).toLowerCase().includes(term));
  });
}

/**
 * The sentence for an empty view of the species: a search that matched nothing, a category with none, or none at all.
 * @param {{ q?: string, category?: string }} view
 */
export function speciesEmpty({ q, category }) {
  if (plain(q)) return 'No species match the search.';
  if (category && category !== 'all') return 'No species in this category.';
  return SPECIES_EMPTY;
}

/**
 * The species table: each one's picture, its name linking to its page (its scientific name and a provisional flag
 * under it), its category, conservation status, counts and when last seen.
 * @param {SpeciesRow[]} rows
 */
export const speciesTable = (rows) =>
  recordsTable(rows, {
    caption: 'Species',
    key: (r) => r.id,
    columns: [
      { key: 'picture', label: 'Picture', cell: (r) => thumbNode(r.thumb, 'No picture') },
      {
        key: 'species',
        label: 'Species',
        header: true,
        cell: (r) => [
          r.href ? h('a', { key: 'name', href: r.href }, r.name) : r.name,
          r.scientific && r.scientific !== r.name && h('span', { key: 'sci', className: 'site-admin__sub' }, h('i', null, r.scientific)),
          r.provisional && h('span', { key: 'prov', className: 'site-admin__sub' }, 'Provisional name'),
        ],
      },
      { key: 'category', label: 'Category', cell: (r) => r.category },
      { key: 'conservation', label: 'Conservation', cell: (r) => r.conservation },
      { key: 'sightings', label: 'Sightings', cell: (r) => r.sightings.toLocaleString('en-US') },
      { key: 'media', label: 'Media', cell: (r) => r.media.toLocaleString('en-US') },
      { key: 'lastSeen', label: 'Last seen', cell: (r) => r.lastSeen },
    ],
  });

// --- one species ----------------------------------------------------------------------------------------------------

export const SPECIES_SIGHTINGS_EMPTY = 'No sightings of this species outside the recycle bin.';

/** A species' address in the admin (#/species/:id). @param {string | number} id */
export const speciesHref = (id) => hashFor(SPECIES_ROUTE, { id });

/**
 * Why a species did not open: it is not there (404: merged or deleted, perhaps), or it did not load and can be asked
 * for again.
 * @param {string | number} id
 * @param {unknown} error
 * @returns {{ text: string, retry: boolean }}
 */
export function speciesLoadFailure(id, error) {
  if (error instanceof ApiError && error.status === 404) return { text: `Species ${id} was not found. It may have been merged or deleted.`, retry: false };
  return { text: `Species ${id} did not load. ${errorText(error)}`, retry: true };
}

/** GET /admin/species/{id}/detail: the species, its counts, when first and last seen, its pinned picture. @param {string | number} id */
export const speciesDetailRequest = (id) => ({ path: `${speciesPath(id)}/detail` });

/**
 * A page of its sightings, newest first, none from the recycle bin: GET /admin/species/{id}/sightings?limit&offset.
 * @param {string | number} id
 * @param {{ limit: number, offset: number }} page
 */
export const speciesSightingsRequest = (id, { limit, offset }) => ({ path: `${speciesPath(id)}/sightings`, query: pageQuery(limit, offset) });

/**
 * PATCH /admin/species/{id} with the changed fields (speciesEditPayload).
 * @param {string | number} id
 * @param {Record<string, string>} body
 */
export const speciesEditRequest = (id, body) => ({ path: speciesPath(id), method: 'PATCH', body });

/** The hero body: { media_id }, null to clear the pinned picture. @param {unknown} mediaId */
export const heroPayload = (mediaId) => ({ media_id: idOf(mediaId) });

/**
 * POST /admin/species/{id}/hero {media_id}: the species' picture (undoable in the activity log).
 * @param {string | number} id
 * @param {unknown} mediaId
 */
export const heroRequest = (id, mediaId) => ({ path: `${speciesPath(id)}/hero`, method: 'POST', body: heroPayload(mediaId) });

/** The merge body: { into: speciesId }, or null for no species. @param {unknown} into */
export const mergePayload = (into) => {
  const id = idOf(into);
  return id === null ? null : { into: id };
};

/**
 * POST /admin/species/{id}/merge {into}: species {id} into another, then deleted (no undo).
 * @param {string | number} id
 * @param {unknown} into
 */
export const mergeRequest = (id, into) => {
  const body = mergePayload(into);
  return body && { path: `${speciesPath(id)}/merge`, method: 'POST', body };
};

/** The move body: { sighting_ids: [...] }, or null when none is checked. @param {unknown[]} ids */
export const movePayload = (ids) => {
  const list = idsOf(ids);
  return list.length ? { sighting_ids: list } : null;
};

/**
 * POST /admin/species/{targetId}/move {sighting_ids}: the path's species is where the sightings GO (undoable).
 * @param {string | number} targetId
 * @param {unknown[]} ids
 */
export const moveRequest = (targetId, ids) => {
  const body = movePayload(ids);
  return body && { path: `${speciesPath(targetId)}/move`, method: 'POST', body };
};

/** What a species' delete does with its sightings: the server's two modes, the one that keeps them first. */
export const DELETE_MODES = Object.freeze([
  Object.freeze({ value: 'unsorted', label: 'Keep its sightings and media, with no species' }),
  Object.freeze({ value: 'delete', label: 'Move its sightings to the recycle bin' }),
]);

/**
 * DELETE /admin/species/{id}?mode=: a mode that is not the server's is the one that keeps the sightings.
 * @param {string | number} id
 * @param {string} mode
 */
export const speciesDeleteRequest = (id, mode) => ({
  path: speciesPath(id),
  method: 'DELETE',
  query: { mode: DELETE_MODES.some((m) => m.value === mode) ? mode : 'unsorted' },
});

/**
 * @typedef {{
 *   id: number | null, name: string, scientific: string | null, provisional: boolean, family: string, genus: string,
 *   category: string, group: string, conservation: string, habitat: string, sightings: number, media: number,
 *   firstSeen: string, lastSeen: string, heroId: number | null, hero: any,
 * }} SpeciesSummary
 */

/**
 * One species as its page heads it: the detail's fields, and its pinned picture as a media item mediaView reads.
 * @param {any} d GET …/detail
 * @returns {SpeciesSummary}
 */
export function speciesSummary(d) {
  const heroId = idOf(d?.hero_media_id);
  return {
    id: idOf(d?.species_id),
    name: nameOf(d),
    scientific: scientificOf(d),
    provisional: isProvisional(d),
    family: plain(d?.family) || NOT_GIVEN,
    genus: plain(d?.genus) || NOT_GIVEN,
    category: plain(d?.category) || 'Uncategorized',
    group: plain(d?.subcategory) || NOT_GIVEN,
    conservation: plain(d?.conservation_status) || NOT_GIVEN,
    habitat: plain(d?.habitat_type) || NOT_GIVEN,
    sightings: countOf(d?.sightings),
    media: countOf(d?.media),
    firstSeen: seenOf(d?.first_seen),
    lastSeen: seenOf(d?.last_seen),
    heroId,
    hero:
      heroId === null
        ? null
        : { media_id: heroId, storage_type: d?.thumb_storage_type ?? null, storage_key: d?.thumb_storage_key ?? null, url: d?.thumb_url ?? null, archive_uri: d?.thumb_archive_uri ?? null },
  };
}

/**
 * The species' facts, as [term, value] pairs for a <dl>.
 * @param {SpeciesSummary} s
 * @returns {[string, string][]}
 */
export const speciesFacts = (s) => [
  ['Scientific name', s.scientific ?? NOT_GIVEN],
  ['Family', s.family],
  ['Genus', s.genus],
  ['Category', s.category],
  ['Group', s.group],
  ['Conservation status', s.conservation],
  ['Habitat', s.habitat],
  ['Sightings', s.sightings.toLocaleString('en-US')],
  ['Media', s.media.toLocaleString('en-US')],
  ['First seen', s.firstSeen],
  ['Last seen', s.lastSeen],
];

/** The facts as a <dl>, each term in bold (as the review's facts). @param {[string, string][]} facts */
export const factsList = (facts) =>
  h('dl', { className: 'site-admin__facts' }, facts.map(([term, value]) => [h('dt', { key: `${term}-t` }, h('b', null, term)), h('dd', { key: `${term}-d` }, value)]));

/**
 * @typedef {{ key: string, label: string, kind: 'text' | 'select', options?: readonly string[], labels?: Record<string, string> }} SpeciesField
 */

/**
 * The species' editable fields: those AdminSpeciesService lets a reviewer change (EDITABLE) and the detail carries. A
 * provisional name (a visitor's guess) can be confirmed, which clears name_status, so the species stops showing as
 * "Unidentified" once a reviewer has named it.
 * @type {readonly SpeciesField[]}
 */
export const SPECIES_FIELDS = Object.freeze(
  /** @type {SpeciesField[]} */ ([
    { key: 'common_name', label: 'Common name', kind: 'text' },
    { key: 'scientific_name', label: 'Scientific name', kind: 'text' },
    { key: 'family', label: 'Family', kind: 'text' },
    { key: 'genus', label: 'Genus', kind: 'text' },
    { key: 'category', label: 'Category', kind: 'select', options: SPECIES_CATEGORIES, labels: { '': 'Not set' } },
    { key: 'subcategory', label: 'Group', kind: 'text' },
    { key: 'conservation_status', label: 'Conservation status', kind: 'text' },
    { key: 'habitat_type', label: 'Habitat', kind: 'text' },
    { key: 'name_status', label: 'Name', kind: 'select', options: ['provisional'], labels: { '': 'Confirmed', provisional: 'Provisional: a visitor\'s guess' } },
  ]).map((f) => Object.freeze(f)),
);

/**
 * A select's choices: the list, with none first, and the value it holds when that is not in the list (never lost).
 * @param {SpeciesField} field
 * @param {string} value
 * @returns {{ value: string, label: string }[]}
 */
export const speciesOptions = (field, value) => {
  const list = ['', ...(field.options ?? [])];
  if (plain(value) && !list.includes(plain(value))) list.push(plain(value));
  return list.map((v) => ({ value: v, label: field.labels?.[v] ?? v }));
};

/**
 * The form's starting values: each field's value in the detail, as text.
 * @param {any} detail
 * @returns {Record<string, string>}
 */
export const speciesFields = (detail) => Object.fromEntries(SPECIES_FIELDS.map((f) => [f.key, plain(detail?.[f.key])]));

/**
 * The edit body: each field that changed, trimmed (an emptied one is "", which the server stores as null), or null
 * when nothing did. Only changed fields, because the server writes every key it is sent.
 * @param {any} detail
 * @param {Record<string, string>} fields
 * @returns {Record<string, string> | null}
 */
export function speciesEditPayload(detail, fields) {
  if (!detail) return null;
  /** @type {Record<string, string>} */
  const out = {};
  for (const f of SPECIES_FIELDS) {
    const after = plain(fields?.[f.key]);
    if (plain(detail[f.key]) !== after) out[f.key] = after;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * What the edit's answer means: { needs_merge, target } is that another species has the scientific name asked for, and
 * nothing was saved; anything else is saved.
 * @param {any} answer
 * @returns {{ saved: boolean, merge: { id: number, name: string } | null, text: string }}
 */
export function speciesEditOutcome(answer) {
  if (answer && typeof answer === 'object' && answer.needs_merge) {
    const target = answer.target ?? {};
    const id = idOf(target.species_id);
    const name = plain(target.common_name) || plain(target.scientific_name) || `species ${target.species_id ?? ''}`.trim();
    return {
      saved: false,
      merge: id === null ? null : { id, name },
      text: `${name} already has that scientific name, so nothing was saved. To make them one species, merge this one into ${name}.`,
    };
  }
  return { saved: true, merge: null, text: 'The species is saved.' };
}

/**
 * @typedef {{ shown: boolean, enabled: boolean }} Action
 */

/**
 * Which of a species' actions show and can be pressed: each needs editSpecies (every /admin/species route); none while
 * a request is in flight.
 * @param {any} user
 * @param {boolean} busy
 * @returns {{ edit: Action, hero: Action, merge: Action, move: Action, delete: Action }}
 */
export function speciesActions(user, busy) {
  const shown = can(user, 'editSpecies');
  const action = () => ({ shown, enabled: shown && !busy });
  return { edit: action(), hero: action(), merge: action(), move: action(), delete: action() };
}

/**
 * The species a merge or a move can go to: every other one, by name (a provisional one says so).
 * @param {any[] | null | undefined} list GET /admin/species
 * @param {number | string | null} exceptId
 * @returns {{ id: number, label: string }[]}
 */
export function speciesChoices(list, exceptId) {
  const except = idOf(exceptId);
  return (Array.isArray(list) ? list : [])
    .map((s) => ({ id: idOf(s?.species_id), label: `${plain(s?.common_name) || plain(s?.scientific_name) || `Species ${s?.species_id}`}${isProvisional(s) ? ' (provisional)' : ''}` }))
    .filter((c) => c.id !== null && c.id !== except)
    .map((c) => /** @type {{ id: number, label: string }} */ (c))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

/** The confirm dialogs (.wb-dialog) before a merge, a move and a delete, each saying what it will do. */
export const SPECIES_CONFIRM = Object.freeze({
  /**
   * @param {string} name
   * @param {string} target
   * @param {number} count its sightings outside the recycle bin
   */
  merge: (name, target, count) => ({
    title: `Merge ${name} into ${target}?`,
    body: `Its ${plural(count, 'sighting', 'sightings')} (and any in the recycle bin) and its media move to ${target}, and ${name} is deleted. A merge cannot be undone.`,
    confirm: 'Merge',
  }),
  /**
   * @param {number} count
   * @param {string} from
   * @param {string} to
   */
  move: (count, from, to) => ({
    title: `Move ${plural(count, 'sighting', 'sightings')} to ${to}?`,
    body:
      count === 1
        ? `It leaves ${from} and counts as ${to}. Its media stay filed under ${from} in the media library. You can undo the move in the activity log.`
        : `They leave ${from} and count as ${to}. Their media stay filed under ${from} in the media library. You can undo the move in the activity log.`,
    confirm: `Move ${plural(count, 'sighting', 'sightings')}`,
  }),
  /**
   * @param {string} name
   * @param {string} mode DELETE_MODES
   * @param {number} count its sightings outside the recycle bin
   */
  delete: (name, mode, count) => {
    let body;
    if (mode === 'delete') {
      body =
        count === 0
          ? `${name} is deleted. It has no sightings outside the recycle bin. This cannot be undone.`
          : `${name} is deleted and its ${plural(count, 'sighting', 'sightings')} ${count === 1 ? 'goes' : 'go'} to the recycle bin; restored, ${count === 1 ? 'it has' : 'they have'} no species. This cannot be undone.`;
    } else {
      body =
        count === 0
          ? `${name} is deleted. Its media stay, with no species. This cannot be undone.`
          : `${name} is deleted. Its ${plural(count, 'sighting', 'sightings')} and its media stay, with no species. This cannot be undone.`;
    }
    return { title: `Delete ${name}?`, body, confirm: 'Delete species' };
  },
});

/**
 * @typedef {{
 *   id: number | null, href: string | null, when: string, status: 'pending' | 'verified' | 'rejected',
 *   submitter: string, camera: string, mediaId: number | null, thumb: { src: string, video: boolean } | null,
 *   hero: boolean,
 * }} SpeciesSightingRow
 */

/**
 * A sighting of the species: as the sighting screens read it (sightingRow), its media's id, and whether that media is
 * the species' picture.
 * @param {any} r a row of GET …/sightings
 * @param {string | null} token
 * @param {number | null} heroId
 * @returns {SpeciesSightingRow}
 */
export function speciesSightingRow(r, token, heroId) {
  const row = sightingRow(r, token);
  const mediaId = idOf(r?.media_id);
  return {
    id: row.id,
    href: row.href,
    when: row.when,
    status: row.status,
    submitter: row.submitter,
    camera: row.camera,
    mediaId,
    thumb: mediaId === null ? null : row.thumb,
    hero: mediaId !== null && mediaId === idOf(heroId),
  };
}

/**
 * The species' sightings: a check box per row (for a move), each opening its review, and, where it has media, a
 * button that makes that media the species' picture (pressed, in action blue, when it is; pressing it then clears it).
 * Nothing can be pressed unless `enabled`.
 * @param {SpeciesSightingRow[]} rows
 * @param {{ selected: number[], enabled: boolean, onSelect: (id: number, on: boolean) => void, onHero: (row: SpeciesSightingRow) => void }} options
 */
export const speciesSightingsTable = (rows, { selected, enabled, onSelect, onHero }) =>
  recordsTable(rows, {
    caption: 'Sightings of this species',
    key: (r) => r.id,
    columns: [
      {
        key: 'select',
        label: 'Select',
        cell: (r) =>
          r.id === null
            ? NOT_GIVEN
            : checkNode({ id: `species-sighting-${r.id}`, checked: selected.includes(r.id), disabled: !enabled, label: `Select sighting ${r.id}`, hideLabel: true, onChange: (on) => onSelect(/** @type {number} */ (r.id), on) }),
      },
      { key: 'sighting', label: 'Sighting', header: true, cell: (r) => (r.href ? h('a', { href: r.href }, `Sighting ${r.id}`) : NOT_GIVEN) },
      { key: 'media', label: 'Media', cell: (r) => thumbNode(r.thumb) },
      { key: 'when', label: 'Seen', cell: (r) => r.when },
      { key: 'status', label: 'Status', cell: (r) => statusChip(r.status) },
      { key: 'submitter', label: 'Submitted by', cell: (r) => r.submitter },
      { key: 'camera', label: 'Camera', cell: (r) => r.camera },
      {
        key: 'picture',
        label: 'Species picture',
        cell: (r) =>
          r.mediaId === null
            ? 'No media'
            : h(
                'button',
                { className: `wb-btn ${r.hero ? 'wb-btn--action' : 'wb-btn--ghost'}`, type: 'button', 'aria-pressed': r.hero, disabled: !enabled, onClick: () => onHero(r) },
                'Species picture',
                h('span', { className: 'wb-sr-only' }, ` from sighting ${r.id}`),
              ),
      },
    ],
  });

// --- the media library ----------------------------------------------------------------------------------------------

export const MEDIA_EMPTY = 'No approved media yet.';

/**
 * The library's folders, as AdminMediaService.list names them: "all" is the approved (on a verified sighting outside
 * the recycle bin), the server's default; they overlap, and do not add up to "everything".
 */
export const MEDIA_FOLDERS = Object.freeze([
  Object.freeze({ value: 'all', label: 'Approved' }),
  Object.freeze({ value: 'pending', label: 'Waiting for review' }),
  Object.freeze({ value: 'hidden', label: 'Hidden from the site' }),
  Object.freeze({ value: 'rejected', label: 'On rejected sightings' }),
  Object.freeze({ value: 'orphans', label: 'On no sighting' }),
  Object.freeze({ value: 'legacy', label: 'Legacy import' }),
  Object.freeze({ value: 'streams', label: 'Camera videos' }),
  Object.freeze({ value: 'uploads', label: 'Photos' }),
  Object.freeze({ value: 'unsorted', label: 'No species' }),
  Object.freeze({ value: 'everything', label: 'Everything' }),
]);

/**
 * The folder choices, each with its count when the server gave one (the list's `counts`).
 * @param {Record<string, unknown> | null | undefined} counts
 */
export const folderOptions = (counts) =>
  MEDIA_FOLDERS.map((f) => {
    const n = counts?.[f.value];
    return { value: f.value, label: typeof n === 'number' && Number.isFinite(n) ? `${f.label} (${n.toLocaleString('en-US')})` : f.label };
  });

/**
 * A page of the library, newest first: GET /admin/media?limit&offset, with a folder (one of MEDIA_FOLDERS; another is
 * left out, so the server's default applies) and a search (trimmed; blank is none) when chosen.
 * @param {{ limit: number, offset: number, folder?: string, q?: string }} page
 */
export const mediaListRequest = ({ limit, offset, folder, q }) => ({
  path: '/admin/media',
  query: pageQuery(limit, offset, { folder: MEDIA_FOLDERS.some((f) => f.value === folder) ? folder : undefined, q: plain(q) }),
});

/** The show/hide body: { is_public: boolean }. @param {unknown} isPublic */
export const visibilityPayload = (isPublic) => ({ is_public: Boolean(isPublic) });

/**
 * PATCH /admin/media/{id} {is_public}: shown on, or hidden from, the public site (needs hideMedia).
 * @param {string | number} id
 * @param {unknown} isPublic
 */
export const visibilityRequest = (id, isPublic) => ({ path: mediaPath(id), method: 'PATCH', body: visibilityPayload(isPublic) });

/** DELETE /admin/media/{id}, never with force (needs editMedia and hideMedia). @param {string | number} id */
export const mediaDeleteRequest = (id) => ({ path: mediaPath(id), method: 'DELETE' });

const KIND_LABELS = Object.freeze({ photo: 'Photo', video: 'Video', frame: 'Still from a video' });
const STATE_LABELS = Object.freeze({ public: 'Shown', hidden: 'Hidden', unapproved: 'Not approved' });
const NO_SPECIES = 'No species';

/** The API's flag as a boolean: MySQL answers a TINYINT as 0 or 1. @param {unknown} v */
const flag = (v) => v === true || v === 1 || v === '1' || v === 'true';

/**
 * @typedef {{
 *   id: number | null, species: string, scientific: string | null, when: string, kind: 'photo' | 'video' | 'frame',
 *   kindLabel: string, state: 'public' | 'hidden' | 'unapproved', stateLabel: string,
 *   thumb: { src: string, video: boolean } | null,
 * }} MediaRow
 */

/**
 * A media item as the library shows it: its species, its date, what kind it is, and where it stands on the public site:
 * shown, hidden (a reviewer took it down), or not approved (on no verified sighting, so not on the site whatever
 * is_public says; publishing it is the review's decision).
 * @param {any} m a row of GET /admin/media
 * @param {string | null} [token]
 * @returns {MediaRow}
 */
export function mediaRow(m, token) {
  const stored = plain(m?.storage_type);
  const kind = /** @type {'photo' | 'video' | 'frame'} */ (
    ['photo', 'video', 'frame'].includes(plain(m?.media_kind)) ? plain(m.media_kind) : stored === 'youtube' ? 'video' : stored === 'frame' ? 'frame' : 'photo'
  );
  const state = !flag(m?.is_approved) ? 'unapproved' : flag(m?.is_public) || m?.is_public === null || m?.is_public === undefined ? 'public' : 'hidden';
  const src = thumbOf(m, token);
  return {
    id: idOf(m?.media_id),
    species: plain(m?.species) || plain(m?.sci) || NO_SPECIES,
    scientific: plain(m?.sci) && plain(m?.sci) !== plain(m?.species) && !/^\[unverified\]/i.test(plain(m?.sci)) ? plain(m.sci) : null,
    when: formatWhen(m?.media_date),
    kind,
    kindLabel: KIND_LABELS[kind],
    state,
    stateLabel: STATE_LABELS[state],
    thumb: src ? { src, video: kind === 'video' } : null,
  };
}

/**
 * Which of a media item's actions show and can be pressed: showing or hiding it needs hideMedia (PATCH's METHOD_RULE)
 * and an approved item; deleting it needs editMedia and hideMedia (DELETE's). None while a request is in flight.
 * @param {any} user
 * @param {MediaRow} row
 * @param {boolean} busy
 * @returns {{ visibility: Action & { label: string, next: boolean }, delete: Action }}
 */
export function mediaActions(user, row, busy) {
  const hide = can(user, 'hideMedia') && row.state !== 'unapproved';
  const del = can(user, 'editMedia') && can(user, 'hideMedia');
  const next = row.state === 'hidden';
  return {
    visibility: { shown: hide, enabled: hide && !busy, label: next ? 'Show on the site' : 'Hide from the site', next },
    delete: { shown: del, enabled: del && !busy },
  };
}

/**
 * The library's table: each item's picture, its species, kind, date, where it stands on the public site and its id;
 * with an Actions column (show or hide, delete) when the user may do either to any row.
 * @param {MediaRow[]} rows
 * @param {{ actionsFor: (row: MediaRow) => ReturnType<typeof mediaActions>, onVisibility: (row: MediaRow, isPublic: boolean) => void, onDelete: (row: MediaRow) => void }} options
 */
export function mediaTable(rows, { actionsFor, onVisibility, onDelete }) {
  const acts = rows.map(actionsFor);
  const any = acts.some((a) => a.visibility.shown || a.delete.shown);
  /** @type {import('./lists.mjs').Column[]} */
  const columns = [
    { key: 'media', label: 'Media', cell: (r) => thumbNode(r.thumb) },
    {
      key: 'species',
      label: 'Species',
      header: true,
      cell: (r) => [r.species, r.scientific && h('span', { key: 'sci', className: 'site-admin__sub' }, h('i', null, r.scientific))],
    },
    { key: 'kind', label: 'Kind', cell: (r) => r.kindLabel },
    { key: 'when', label: 'Date', cell: (r) => r.when },
    { key: 'state', label: 'Public site', cell: (r) => h('span', { className: 'wb-chip' }, r.stateLabel) },
    { key: 'id', label: 'ID', cell: (r) => (r.id === null ? NOT_GIVEN : String(r.id)) },
  ];
  if (any) {
    columns.push({
      key: 'actions',
      label: 'Actions',
      cell: (r) => {
        const a = acts[rows.indexOf(r)];
        return h(
          'span',
          { className: 'site-admin__actions' },
          a.visibility.shown &&
            h(
              'button',
              { key: 'visibility', className: 'wb-btn wb-btn--ghost', type: 'button', disabled: !a.visibility.enabled, onClick: () => onVisibility(r, a.visibility.next) },
              a.visibility.label,
              h('span', { className: 'wb-sr-only' }, ` media ${r.id}`),
            ),
          a.delete.shown &&
            h(
              'button',
              { key: 'delete', className: 'wb-btn wb-btn--ghost', type: 'button', disabled: !a.delete.enabled, onClick: () => onDelete(r) },
              'Delete',
              h('span', { className: 'wb-sr-only' }, ` media ${r.id}`),
            ),
        );
      },
    });
  }
  return recordsTable(rows, { caption: 'Media', key: (r) => r.id, columns });
}

/** The confirm dialog (.wb-dialog) before a media item's delete. */
export const MEDIA_CONFIRM = Object.freeze({
  /** @param {MediaRow} row */
  delete: (row) => ({
    title: `Delete media ${row.id} permanently?`,
    body: `${row.species === NO_SPECIES ? 'This' : `The ${row.species}`} ${row.kindLabel.toLowerCase()} is deleted for good, with any saved clip, and stops being any species' picture. This cannot be undone.`,
    confirm: 'Delete permanently',
  }),
});

/**
 * What a show or hide did, from the server's answer ({ media_id, is_public }), else what was asked.
 * @param {string | number} id
 * @param {any} answer
 * @param {boolean} asked
 */
export function visibilityOutcome(id, answer, asked) {
  const shown = typeof answer?.is_public === 'boolean' ? answer.is_public : asked;
  return shown ? `Media ${id} shows on the site again.` : `Media ${id} is hidden from the site.`;
}

/**
 * The sentence for an empty view of the library: a search that matched nothing, else the folder's.
 * @param {{ folder?: string, q?: string }} view
 */
export function mediaEmpty({ folder, q }) {
  if (plain(q)) return 'No media match the search.';
  if (!folder || folder === 'all') return MEDIA_EMPTY;
  return 'No media in this folder.';
}
