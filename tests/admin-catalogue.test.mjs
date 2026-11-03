// The sighting review's catalogue screens (src/lib/admin/catalogue.mjs, drawn by
// src/islands/admin/{Species,SpeciesDetail,Media}.tsx) and the list pieces they share with the housekeeping screens
// (src/lib/admin/lists.mjs): the requests they send (the Java API's AdminSpeciesController, AdminMediaController and
// their services are the authority), the rows, the payloads, which actions show, the confirms and the empty sentences.
// Pure, no build needed; the last tests read the islands' sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { API_BASE, ApiError, SessionExpired, mediaUrl } from '../src/lib/java-api.mjs';
import { ROLE_CAPS } from '../src/lib/admin/permissions.mjs';
import { listBody, listState } from '../src/lib/admin/sightings.mjs';
import {
  checked,
  checkedAll,
  failureNotice,
  failureText,
  idsText,
  pageSlice,
  plural,
  recordsTable,
  selectionOf,
  stillThere,
} from '../src/lib/admin/lists.mjs';
import {
  DELETE_MODES,
  MEDIA_CONFIRM,
  MEDIA_EMPTY,
  MEDIA_FOLDERS,
  SPECIES_CATEGORY_FILTERS,
  SPECIES_CONFIRM,
  SPECIES_EMPTY,
  SPECIES_FIELDS,
  SPECIES_SIGHTINGS_EMPTY,
  filterSpecies,
  folderOptions,
  heroPayload,
  heroRequest,
  mediaActions,
  mediaDeleteRequest,
  mediaEmpty,
  mediaListRequest,
  mediaRow,
  mediaTable,
  mergePayload,
  mergeRequest,
  movePayload,
  moveRequest,
  speciesActions,
  speciesChoices,
  speciesDeleteRequest,
  speciesDetailRequest,
  speciesEditOutcome,
  speciesEditPayload,
  speciesEditRequest,
  speciesEmpty,
  speciesFacts,
  speciesFields,
  speciesHref,
  speciesListRequest,
  speciesLoadFailure,
  speciesRow,
  speciesSightingRow,
  speciesSightingsRequest,
  speciesSightingsTable,
  speciesSummary,
  speciesTable,
  visibilityOutcome,
  visibilityPayload,
  visibilityRequest,
} from '../src/lib/admin/catalogue.mjs';

/** Every node of a VDOM tree, depth first. */
const nodes = (node) => (node === null || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(nodes)]);
const text = (node) => (node === null ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join(''));
const classes = (node) => (node.props.className ?? '').split(/\s+/).filter(Boolean);
const find = (tree, pred) => nodes(tree).filter(pred);
const source = (file) => readFileSync(file, 'utf8');

const UPLOADS = API_BASE.replace(/\/v1$/, '');
const TOKEN = 'tok.en';

const user = (role, extra = {}) => ({ name: role, email: `${role}@example.org`, role, permissions: [...ROLE_CAPS[role]], mustChangePassword: false, ...extra });
const OWNER = user('owner');
const ADMIN = user('admin');
const INTERN = user('intern');
const VOLUNTEER = user('volunteer');

/** A row of GET /admin/species (AdminSpeciesService.list). */
const SPECIES = Object.freeze({
  species_id: 3,
  common_name: 'Sergeant major',
  scientific_name: 'Abudefduf saxatilis',
  family: 'Pomacentridae',
  genus: 'Abudefduf',
  category: 'Fish',
  subcategory: null,
  conservation_status: 'LC',
  name_status: null,
  hero_media_id: 7,
  sightings: 12,
  last_seen: '2026-10-31T14:22',
  media: 5,
  any_sightings: 13,
  thumb_storage_type: 'youtube',
  thumb_storage_key: 'abcDEF12345',
  thumb_url: 'https://www.youtube.com/watch?v=abcDEF12345',
  thumb_archive_uri: 'db://media/7',
  thumb_media_id: 7,
});

/** A species a visitor named, which no reviewer has confirmed (SightingWriteService: "[unverified] <name>"). */
const PROVISIONAL = Object.freeze({
  species_id: 9,
  common_name: 'Blue fish',
  scientific_name: '[unverified] Blue fish',
  family: null,
  genus: null,
  category: null,
  subcategory: null,
  conservation_status: null,
  name_status: 'provisional',
  hero_media_id: null,
  sightings: 1,
  last_seen: null,
  media: 0,
  any_sightings: 1,
  thumb_storage_type: 'upload',
  thumb_storage_key: 'b.jpg',
  thumb_url: '/uploads/b.jpg',
  thumb_archive_uri: null,
  thumb_media_id: 11,
});

const GROUPER = Object.freeze({ ...SPECIES, species_id: 4, common_name: 'Goliath grouper', scientific_name: 'Epinephelus itajara', family: 'Epinephelidae', genus: 'Epinephelus', conservation_status: 'VU', thumb_archive_uri: null, thumb_media_id: null, thumb_storage_type: null, thumb_storage_key: null, thumb_url: null });

/** GET /admin/species/{id}/detail. */
const DETAIL = Object.freeze({
  species_id: 3,
  common_name: 'Sergeant major',
  scientific_name: 'Abudefduf saxatilis',
  family: 'Pomacentridae',
  genus: 'Abudefduf',
  category: 'Fish',
  subcategory: 'Damselfish',
  conservation_status: 'LC',
  habitat_type: 'Reef',
  name_status: null,
  hero_media_id: 7,
  sightings: 12,
  media: 5,
  first_seen: '2025-03-01T15:00',
  last_seen: '2026-10-31T14:22',
  thumb_storage_type: 'youtube',
  thumb_storage_key: 'abcDEF12345',
  thumb_url: 'https://www.youtube.com/watch?v=abcDEF12345',
});

/** A row of GET /admin/species/{id}/sightings. */
const SIGHTING = Object.freeze({
  sighting_id: 42,
  species_id: 3,
  camera_id: 1,
  media_id: 7,
  sighting_datetime: '2026-10-31T14:22',
  life_stage: 'Adult',
  verification_status: 'verified',
  volunteer_name: 'Ana Reyes',
  notes: null,
  camera_name: 'Reef camera',
  storage_type: 'youtube',
  storage_key: 'abcDEF12345',
  media_url: 'https://www.youtube.com/watch?v=abcDEF12345',
  archive_uri: 'db://media/7',
  is_public: 1,
});

/** A row of GET /admin/media (AdminMediaService.list). */
const MEDIA = Object.freeze({
  media_id: 21,
  species_id: 3,
  media_date: '2026-10-31T14:22',
  storage_type: 'upload',
  storage_key: 'k.jpg',
  url: '/uploads/k.jpg',
  source: 'intake',
  media_kind: 'photo',
  thumb_url: null,
  archive_uri: null,
  species: 'Sergeant major',
  sci: 'Abudefduf saxatilis',
  is_public: 1,
  is_live: 1,
  is_approved: 1,
});

// --- the shared list pieces -----------------------------------------------------------------------------------------

test('pageSlice: a page of a list the API answers whole', () => {
  const rows = Array.from({ length: 45 }, (_, i) => i);
  assert.deepEqual(pageSlice(rows, 20, 0), rows.slice(0, 20));
  assert.deepEqual(pageSlice(rows, 20, 40), [40, 41, 42, 43, 44]);
  assert.deepEqual(pageSlice(rows, 20, 60), []);
  assert.deepEqual(pageSlice(null, 20, 0), []);
});

test('a checked set: one row, a page of rows, how many and whether the page is all checked; ids as numbers', () => {
  let set = checked([], 4, true);
  set = checked(set, '5', true);
  set = checked(set, 4, true);
  assert.deepEqual(set, [4, 5], 'once each, as numbers');
  assert.deepEqual(checked(set, 4, false), [5]);
  assert.deepEqual(checkedAll([5], [4, 5, 6], true), [5, 4, 6]);
  assert.deepEqual(checkedAll([4, 5, 9], [4, 5, 6], false), [9], 'unchecking a page keeps the other pages\' rows');
  assert.deepEqual(selectionOf([4, 9], [4, 5]), { count: 2, all: false, some: true });
  assert.deepEqual(selectionOf([4, 5], [4, 5]), { count: 2, all: true, some: true });
  assert.deepEqual(selectionOf([], []), { count: 0, all: false, some: false });
  assert.deepEqual(stillThere([4, 5, 9], [{ id: 5 }, { id: 9 }].map((r) => r.id)), [5, 9], 'after a reload only rows still there stay checked');
});

test('idsText and plural: lists and counts in words', () => {
  assert.equal(idsText([12]), '12');
  assert.equal(idsText([12, 15]), '12 and 15');
  assert.equal(idsText([12, 15, 18]), '12, 15 and 18');
  assert.equal(plural(1, 'sighting', 'sightings'), '1 sighting');
  assert.equal(plural(1200, 'sighting', 'sightings'), '1,200 sightings');
  assert.equal(plural(0, 'sighting', 'sightings'), '0 sightings');
});

test('failureText: a 409 that names linked_sightings says so as the notice text; anything else is errorText', () => {
  const conflict = new ApiError(409, { error: 'That photo is still attached to a sighting.', linked_sightings: [12, 15] });
  assert.equal(failureText(conflict, 'Sergeant major'), 'Sergeant major is still used by sightings 12 and 15, so nothing was deleted. Move them to the recycle bin first.');
  assert.equal(failureText(new ApiError(409, { linked_sightings: [12] }), 'Media 21'), 'Media 21 is still used by sighting 12, so nothing was deleted. Move it to the recycle bin first.');
  assert.equal(failureText(new ApiError(409, { error: 'Someone with that email already exists.' }), 'x'), 'Someone with that email already exists.');
  assert.equal(failureText(new ApiError(0, null), 'x'), 'The server did not answer. Try again in a minute.');
});

test('failureNotice: a failed delete\'s notice; a 401 stays the SessionExpired, so the shell ends the session', () => {
  const expired = new SessionExpired(null);
  assert.equal(failureNotice(expired, 'Media 21'), expired);
  assert.deepEqual(failureNotice(new ApiError(409, { linked_sightings: [12] }), 'Media 21'), { tone: 'error', text: 'Media 21 is still used by sighting 12, so nothing was deleted. Move it to the recycle bin first.' });
  assert.deepEqual(failureNotice(new ApiError(500, null), 'Media 21'), { tone: 'error', text: 'The server could not do that (HTTP 500). Try again.' });
});

test('recordsTable: a stacking table in its wrapper; every cell labelled; a header cell per row', () => {
  const table = recordsTable([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], {
    caption: 'Things',
    key: (r) => r.id,
    columns: [
      { key: 'name', label: 'Name', header: true, cell: (r) => r.name },
      { key: 'id', label: 'ID', cell: (r) => String(r.id) },
    ],
  });
  assert.deepEqual(classes(table), ['wb-table-wrap']);
  const [t] = find(table, (n) => n.type === 'table');
  assert.deepEqual(classes(t), ['wb-table']);
  assert.equal(t.props['data-stack'], '');
  assert.equal(text(find(t, (n) => n.type === 'caption')[0]), 'Things');
  assert.deepEqual(find(t, (n) => n.type === 'thead').flatMap((h) => find(h, (n) => n.type === 'th')).map((th) => th.props.scope), ['col', 'col']);
  const body = find(t, (n) => n.type === 'tbody')[0];
  const cells = find(body, (n) => n.type === 'td' || n.type === 'th');
  assert.equal(cells.length, 4);
  for (const c of cells) assert.ok(c.props['data-label'], 'every cell carries its column');
  assert.deepEqual(find(body, (n) => n.type === 'th').map((th) => [th.props.scope, text(th)]), [['row', 'A'], ['row', 'B']]);
});

test('listBody says what is loading', () => {
  const loading = listBody(listState({ rows: [], total: 0, limit: 20, offset: 0, loading: true }), { onRetry() {}, table: () => null, pager: () => null, loadingText: 'Loading species…' });
  assert.equal(text(loading), 'Loading species…');
  const sightings = listBody(listState({ rows: [], total: 0, limit: 20, offset: 0, loading: true }), { onRetry() {}, table: () => null, pager: () => null });
  assert.equal(text(sightings), 'Loading sightings…', 'the sighting screens keep their words');
});

// --- the species list -----------------------------------------------------------------------------------------------

test('the species requests, at AdminSpeciesController\'s paths', () => {
  assert.deepEqual(speciesListRequest(), { path: '/admin/species' });
  assert.deepEqual(speciesDetailRequest(3), { path: '/admin/species/3/detail' });
  assert.deepEqual(speciesSightingsRequest(3, { limit: 20, offset: 40 }), { path: '/admin/species/3/sightings', query: { limit: 20, offset: 40 } });
  assert.deepEqual(speciesEditRequest(3, { family: 'Labridae' }), { path: '/admin/species/3', method: 'PATCH', body: { family: 'Labridae' } });
  assert.deepEqual(heroRequest(3, 7), { path: '/admin/species/3/hero', method: 'POST', body: { media_id: 7 } });
  assert.deepEqual(heroRequest(3, null), { path: '/admin/species/3/hero', method: 'POST', body: { media_id: null } }, 'null clears the pinned picture');
  assert.deepEqual(mergeRequest(3, 4), { path: '/admin/species/3/merge', method: 'POST', body: { into: 4 } });
  assert.deepEqual(moveRequest(4, [42, 43]), { path: '/admin/species/4/move', method: 'POST', body: { sighting_ids: [42, 43] } }, 'the path\'s species is where they go');
  assert.deepEqual(speciesDeleteRequest(3, 'unsorted'), { path: '/admin/species/3', method: 'DELETE', query: { mode: 'unsorted' } });
  assert.deepEqual(speciesDeleteRequest(3, 'delete'), { path: '/admin/species/3', method: 'DELETE', query: { mode: 'delete' } });
  assert.deepEqual(speciesDeleteRequest(3, 'everything'), { path: '/admin/species/3', method: 'DELETE', query: { mode: 'unsorted' } }, 'an unknown mode is the one that keeps the sightings');
  assert.equal(speciesDetailRequest('3/../users').path, '/admin/species/3%2F..%2Fusers/detail', 'an id never carries a path');
});

test('the payloads: mergePayload { into }, movePayload { sighting_ids }, heroPayload { media_id }', () => {
  assert.deepEqual(mergePayload(4), { into: 4 });
  assert.deepEqual(mergePayload('4'), { into: 4 });
  assert.equal(mergePayload(''), null);
  assert.equal(mergePayload('x'), null);
  assert.deepEqual(movePayload([42, '43', 42]), { sighting_ids: [42, 43] });
  assert.equal(movePayload([]), null, 'nothing to move is no request');
  assert.equal(moveRequest(4, []), null);
  assert.deepEqual(heroPayload(7), { media_id: 7 });
  assert.deepEqual(heroPayload(null), { media_id: null });
  assert.deepEqual(DELETE_MODES.map((m) => m.value), ['unsorted', 'delete']);
});

test('speciesRow: the list\'s fields, the picture from its pinned or newest media', () => {
  const row = speciesRow(SPECIES, TOKEN);
  assert.equal(row.id, 3);
  assert.equal(row.href, '#/species/3');
  assert.equal(row.name, 'Sergeant major');
  assert.equal(row.scientific, 'Abudefduf saxatilis');
  assert.equal(row.provisional, false);
  assert.equal(row.category, 'Fish');
  assert.equal(row.conservation, 'LC');
  assert.equal(row.sightings, 12);
  assert.equal(row.media, 5);
  assert.equal(row.lastSeen, 'Oct 31, 2026, 10:22 AM');
  assert.deepEqual(row.thumb, { src: mediaUrl('poster', 7, TOKEN), video: true }, 'a saved clip shows its poster');
  const provisional = speciesRow(PROVISIONAL, TOKEN);
  assert.equal(provisional.name, 'Blue fish', 'the visitor\'s name, flagged');
  assert.equal(provisional.scientific, null, 'the "[unverified]" placeholder is no scientific name');
  assert.equal(provisional.provisional, true);
  assert.equal(provisional.category, 'Uncategorized');
  assert.equal(provisional.conservation, 'Not given');
  assert.equal(provisional.lastSeen, 'Not seen yet');
  assert.deepEqual(provisional.thumb, { src: `${UPLOADS}/uploads/b.jpg`, video: false });
  assert.equal(speciesRow(GROUPER, TOKEN).thumb, null);
});

test('filterSpecies and speciesEmpty: search across the names, a category, or none; every view has its sentence', () => {
  const rows = [SPECIES, PROVISIONAL, GROUPER];
  assert.deepEqual(filterSpecies(rows, { q: '', category: 'all' }).map((s) => s.species_id), [3, 9, 4]);
  assert.deepEqual(filterSpecies(rows, { q: '  GROUPER ', category: 'all' }).map((s) => s.species_id), [4]);
  assert.deepEqual(filterSpecies(rows, { q: 'pomacentridae', category: 'all' }).map((s) => s.species_id), [3], 'the family too');
  assert.deepEqual(filterSpecies(rows, { q: '', category: 'uncategorized' }).map((s) => s.species_id), [9]);
  assert.deepEqual(filterSpecies(rows, { q: '', category: 'Fish' }).map((s) => s.species_id), [3, 4]);
  assert.deepEqual(SPECIES_CATEGORY_FILTERS.map((f) => f.value), ['all', 'Fish', 'Shark & Ray', 'Invertebrate', 'Reptile', 'Bird', 'Mammal', 'Other', 'uncategorized']);
  assert.equal(SPECIES_EMPTY, 'No species yet.');
  assert.equal(speciesEmpty({ q: '', category: 'all' }), SPECIES_EMPTY);
  assert.equal(speciesEmpty({ q: 'x', category: 'all' }), 'No species match the search.');
  assert.equal(speciesEmpty({ q: '', category: 'Bird' }), 'No species in this category.');
});

test('speciesTable: each row\'s name links to its species; the picture carries no referrer', () => {
  const table = speciesTable([speciesRow(SPECIES, TOKEN), speciesRow(PROVISIONAL, TOKEN)]);
  assert.deepEqual(classes(table), ['wb-table-wrap']);
  const [t] = find(table, (n) => n.type === 'table');
  assert.equal(t.props['data-stack'], '');
  assert.deepEqual(find(t, (n) => n.type === 'thead')[0] && find(find(t, (n) => n.type === 'thead')[0], (n) => n.type === 'th').map(text), ['Picture', 'Species', 'Category', 'Conservation', 'Sightings', 'Media', 'Last seen']);
  const links = find(t, (n) => n.type === 'a');
  assert.deepEqual(links.map((a) => [a.props.href, text(a)]), [['#/species/3', 'Sergeant major'], ['#/species/9', 'Blue fish']]);
  assert.match(text(t), /Provisional name/);
  for (const img of find(t, (n) => n.type === 'img')) {
    assert.equal(img.props.referrerPolicy, 'no-referrer');
    assert.equal(typeof img.props.onError, 'function');
  }
  for (const c of find(find(t, (n) => n.type === 'tbody')[0], (n) => n.type === 'td' || n.type === 'th')) assert.ok(c.props['data-label']);
  assert.doesNotMatch(JSON.stringify(table), /accent/);
});

// --- one species ----------------------------------------------------------------------------------------------------

test('speciesSummary and speciesFacts: the header of one species', () => {
  const summary = speciesSummary(DETAIL);
  assert.equal(summary.name, 'Sergeant major');
  assert.equal(summary.scientific, 'Abudefduf saxatilis');
  assert.equal(summary.heroId, 7);
  assert.equal(summary.sightings, 12);
  assert.equal(summary.hero.media_id, 7, 'the pinned media, as mediaView reads a media item');
  assert.equal(summary.hero.storage_type, 'youtube');
  const facts = speciesFacts(summary);
  assert.deepEqual(facts.map(([term]) => term), ['Scientific name', 'Family', 'Genus', 'Category', 'Group', 'Conservation status', 'Habitat', 'Sightings', 'Media', 'First seen', 'Last seen']);
  assert.deepEqual(Object.fromEntries(facts).Sightings, '12');
  assert.deepEqual(Object.fromEntries(facts)['First seen'], 'Mar 1, 2025, 10:00 AM');
  const bare = speciesSummary({ species_id: 9, common_name: null, scientific_name: '[unverified] Blue fish', name_status: 'provisional', sightings: 0, media: 0 });
  assert.equal(bare.name, 'Unnamed species');
  assert.equal(bare.provisional, true);
  assert.equal(bare.hero, null);
  assert.equal(Object.fromEntries(speciesFacts(bare))['Last seen'], 'Not seen yet');
});

test('speciesHref and speciesLoadFailure: a species\' address; one that is not there, or did not load', () => {
  assert.equal(speciesHref(4), '#/species/4');
  assert.deepEqual(speciesLoadFailure(4, new ApiError(404, { error: 'Species not found.' })), { text: 'Species 4 was not found. It may have been merged or deleted.', retry: false });
  assert.deepEqual(speciesLoadFailure(4, new ApiError(0, null)), { text: 'Species 4 did not load. The server did not answer. Try again in a minute.', retry: true });
});

test('speciesFields and speciesEditPayload: only what changed, trimmed; the provisional flag can be cleared', () => {
  assert.deepEqual(SPECIES_FIELDS.map((f) => f.key), ['common_name', 'scientific_name', 'family', 'genus', 'category', 'subcategory', 'conservation_status', 'habitat_type', 'name_status']);
  const fields = speciesFields(DETAIL);
  assert.equal(fields.subcategory, 'Damselfish');
  assert.equal(fields.name_status, '');
  assert.equal(speciesEditPayload(DETAIL, fields), null, 'nothing changed: no request');
  assert.deepEqual(speciesEditPayload(DETAIL, { ...fields, family: '  Pomacentridae  ', genus: ' Stegastes ' }), { genus: 'Stegastes' });
  assert.deepEqual(speciesEditPayload(DETAIL, { ...fields, habitat_type: '' }), { habitat_type: '' }, 'an emptied field is sent as "" (the server stores null)');
  const prov = speciesFields(PROVISIONAL);
  assert.equal(prov.name_status, 'provisional');
  assert.deepEqual(speciesEditPayload(PROVISIONAL, { ...prov, scientific_name: 'Chromis cyanea', name_status: '' }), { scientific_name: 'Chromis cyanea', name_status: '' });
  assert.deepEqual(SPECIES_FIELDS.find((f) => f.key === 'category').options, ['Fish', 'Shark & Ray', 'Invertebrate', 'Reptile', 'Bird', 'Mammal', 'Other']);
});

test('speciesEditOutcome: a scientific name another species has is no save; it offers that species to merge into', () => {
  const clash = speciesEditOutcome({ needs_merge: true, target: { species_id: 4, common_name: 'Goliath grouper' } });
  assert.equal(clash.saved, false);
  assert.deepEqual(clash.merge, { id: 4, name: 'Goliath grouper' });
  assert.equal(clash.text, 'Goliath grouper already has that scientific name, so nothing was saved. To make them one species, merge this one into Goliath grouper.');
  assert.deepEqual(speciesEditOutcome({ species_id: 3, updated: true }), { saved: true, merge: null, text: 'The species is saved.' });
});

test('speciesActions: every species action needs editSpecies; none while one is in flight', () => {
  for (const u of [OWNER, ADMIN, INTERN]) {
    const a = speciesActions(u, false);
    for (const k of ['edit', 'hero', 'merge', 'move', 'delete']) assert.deepEqual(a[k], { shown: true, enabled: true }, `${u.role} ${k}`);
  }
  const busy = speciesActions(ADMIN, true);
  for (const k of ['edit', 'hero', 'merge', 'move', 'delete']) assert.deepEqual(busy[k], { shown: true, enabled: false });
  const none = speciesActions(VOLUNTEER, false);
  for (const k of ['edit', 'hero', 'merge', 'move', 'delete']) assert.deepEqual(none[k], { shown: false, enabled: false });
  const revoked = speciesActions(user('intern', { permissions: ['viewData', 'reviewSightings', 'editMedia'] }), false);
  assert.equal(revoked.merge.shown, false, 'a revoke the server applies hides it too');
});

test('speciesChoices: every other species, by name, for a merge or a move', () => {
  const choices = speciesChoices([SPECIES, PROVISIONAL, GROUPER], 3);
  assert.deepEqual(choices, [{ id: 9, label: 'Blue fish (provisional)' }, { id: 4, label: 'Goliath grouper' }]);
  assert.deepEqual(speciesChoices(null, 3), []);
});

test('SPECIES_CONFIRM: merge, move and delete each say what they will do', () => {
  const merge = SPECIES_CONFIRM.merge('Sergeant major', 'Goliath grouper', 12);
  assert.equal(merge.title, 'Merge Sergeant major into Goliath grouper?');
  assert.equal(merge.body, 'Its 12 sightings (and any in the recycle bin) and its media move to Goliath grouper, and Sergeant major is deleted. A merge cannot be undone.');
  assert.equal(merge.confirm, 'Merge');
  const move = SPECIES_CONFIRM.move(2, 'Sergeant major', 'Goliath grouper');
  assert.equal(move.title, 'Move 2 sightings to Goliath grouper?');
  assert.equal(move.body, 'They leave Sergeant major and count as Goliath grouper. Their media stay filed under Sergeant major in the media library. You can undo the move in the activity log.');
  assert.equal(move.confirm, 'Move 2 sightings');
  assert.equal(SPECIES_CONFIRM.move(1, 'A', 'B').title, 'Move 1 sighting to B?');
  const keep = SPECIES_CONFIRM.delete('Sergeant major', 'unsorted', 12);
  assert.equal(keep.title, 'Delete Sergeant major?');
  assert.equal(keep.body, 'Sergeant major is deleted. Its 12 sightings and its media stay, with no species. This cannot be undone.');
  assert.equal(keep.confirm, 'Delete species');
  const bin = SPECIES_CONFIRM.delete('Sergeant major', 'delete', 1);
  assert.equal(bin.body, 'Sergeant major is deleted and its 1 sighting goes to the recycle bin; restored, it has no species. This cannot be undone.');
});

test('a 409 on species delete surfaces linked_sightings as the notice text', () => {
  const error = new ApiError(409, { error: 'In use', linked_sightings: [42, 43, 44] });
  assert.equal(failureText(error, 'Sergeant major'), 'Sergeant major is still used by sightings 42, 43 and 44, so nothing was deleted. Move them to the recycle bin first.');
});

test('speciesSightingRow and speciesSightingsTable: a check box per row, the review link, the picture to pin', () => {
  const row = speciesSightingRow(SIGHTING, TOKEN, 7);
  assert.equal(row.id, 42);
  assert.equal(row.href, '#/review/42');
  assert.equal(row.when, 'Oct 31, 2026, 10:22 AM');
  assert.equal(row.status, 'verified');
  assert.equal(row.submitter, 'Ana Reyes');
  assert.equal(row.camera, 'Reef camera');
  assert.equal(row.mediaId, 7);
  assert.equal(row.hero, true);
  assert.deepEqual(row.thumb, { src: mediaUrl('poster', 7, TOKEN), video: true });
  const plainRow = speciesSightingRow({ ...SIGHTING, sighting_id: 43, media_id: null, storage_type: null, storage_key: null, media_url: null, archive_uri: null }, TOKEN, 7);
  assert.equal(plainRow.mediaId, null);
  assert.equal(plainRow.thumb, null);
  assert.equal(plainRow.hero, false);

  const calls = [];
  const table = speciesSightingsTable([row, plainRow], {
    selected: [42],
    enabled: true,
    onSelect: (id, on) => calls.push(['select', id, on]),
    onHero: (r) => calls.push(['hero', r.id]),
  });
  const [t] = find(table, (n) => n.type === 'table');
  assert.equal(t.props['data-stack'], '');
  const boxes = find(t, (n) => n.type === 'input' && n.props.type === 'checkbox');
  assert.deepEqual(boxes.map((b) => b.props.checked), [true, false]);
  for (const b of boxes) {
    const label = find(t, (n) => n.type === 'label' && n.props.htmlFor === b.props.id)[0];
    assert.match(text(label), /^Select sighting 4[23]$/);
  }
  boxes[1].props.onChange({ target: { checked: true } });
  const links = find(t, (n) => n.type === 'a');
  assert.deepEqual(links.map((a) => a.props.href), ['#/review/42', '#/review/43']);
  const heroes = find(t, (n) => n.type === 'button');
  assert.equal(heroes.length, 1, 'no media, nothing to pin');
  assert.equal(heroes[0].props['aria-pressed'], true);
  assert.match(text(heroes[0]), /^Species picture/);
  heroes[0].props.onClick();
  assert.deepEqual(calls, [['select', 43, true], ['hero', 42]]);
  for (const img of find(t, (n) => n.type === 'img')) assert.equal(img.props.referrerPolicy, 'no-referrer');
  const off = speciesSightingsTable([row], { selected: [], enabled: false, onSelect() {}, onHero() {} });
  assert.ok(find(off, (n) => n.type === 'button' || n.type === 'input').every((n) => n.props.disabled === true), 'nothing to press while busy');
  assert.equal(SPECIES_SIGHTINGS_EMPTY, 'No sightings of this species outside the recycle bin.');
});

// --- the media library ----------------------------------------------------------------------------------------------

test('the media requests: GET /admin/media?limit&offset (a folder and a search when chosen), PATCH {is_public}, DELETE', () => {
  assert.deepEqual(mediaListRequest({ limit: 20, offset: 40 }), { path: '/admin/media', query: { limit: 20, offset: 40 } });
  assert.deepEqual(mediaListRequest({ limit: 20, offset: 0, folder: 'hidden', q: '  grouper ' }), { path: '/admin/media', query: { limit: 20, offset: 0, folder: 'hidden', q: 'grouper' } });
  assert.deepEqual(mediaListRequest({ limit: 20, offset: 0, folder: 'bogus', q: ' ' }), { path: '/admin/media', query: { limit: 20, offset: 0 } }, 'an unknown folder is the server\'s default');
  assert.deepEqual(visibilityPayload(false), { is_public: false });
  assert.deepEqual(visibilityPayload(1), { is_public: true });
  assert.deepEqual(visibilityRequest(21, false), { path: '/admin/media/21', method: 'PATCH', body: { is_public: false } });
  assert.deepEqual(mediaDeleteRequest(21), { path: '/admin/media/21', method: 'DELETE' }, 'never force: media still on a sighting is refused');
  assert.deepEqual(MEDIA_FOLDERS.map((f) => f.value), ['all', 'pending', 'hidden', 'rejected', 'orphans', 'legacy', 'streams', 'uploads', 'unsorted', 'everything']);
  assert.deepEqual(folderOptions({ all: 120, hidden: 3 }).slice(0, 3).map((o) => o.label), ['Approved (120)', 'Waiting for review', 'Hidden from the site (3)']);
});

test('mediaRow: shown on the site, hidden, or not approved (is_public alone cannot say)', () => {
  const row = mediaRow(MEDIA, TOKEN);
  assert.equal(row.id, 21);
  assert.equal(row.species, 'Sergeant major');
  assert.equal(row.when, 'Oct 31, 2026, 10:22 AM');
  assert.equal(row.kindLabel, 'Photo');
  assert.equal(row.state, 'public');
  assert.equal(row.stateLabel, 'Shown');
  assert.deepEqual(row.thumb, { src: `${UPLOADS}/uploads/k.jpg`, video: false });
  assert.equal(mediaRow({ ...MEDIA, is_public: 0 }).state, 'hidden');
  assert.equal(mediaRow({ ...MEDIA, is_public: false }).stateLabel, 'Hidden');
  assert.equal(mediaRow({ ...MEDIA, is_approved: 0 }).state, 'unapproved');
  assert.equal(mediaRow({ ...MEDIA, is_approved: 0 }).stateLabel, 'Not approved');
  const clip = mediaRow({ ...MEDIA, media_id: 7, storage_type: 'youtube', storage_key: 'abcDEF12345', url: 'https://youtu.be/abcDEF12345', media_kind: 'video', archive_uri: 'db://media/7', species: null, sci: null }, TOKEN);
  assert.equal(clip.kindLabel, 'Video');
  assert.equal(clip.species, 'No species');
  assert.deepEqual(clip.thumb, { src: mediaUrl('poster', 7, TOKEN), video: true });
  assert.equal(mediaRow({ ...MEDIA, media_kind: null, storage_type: 'frame' }).kindLabel, 'Still from a video');
});

test('mediaActions: show or hide needs hideMedia (and an approved item); delete needs editMedia and hideMedia', () => {
  const pub = mediaRow(MEDIA);
  assert.deepEqual(mediaActions(ADMIN, pub, false).visibility, { shown: true, enabled: true, label: 'Hide from the site', next: false });
  assert.deepEqual(mediaActions(ADMIN, mediaRow({ ...MEDIA, is_public: 0 }), false).visibility, { shown: true, enabled: true, label: 'Show on the site', next: true });
  assert.deepEqual(mediaActions(ADMIN, pub, false).delete, { shown: true, enabled: true });
  assert.equal(mediaActions(INTERN, pub, false).visibility.shown, false, 'an intern has editMedia but not hideMedia');
  assert.equal(mediaActions(INTERN, pub, false).delete.shown, false);
  assert.equal(mediaActions(user('intern', { permissions: [...ROLE_CAPS.intern, 'hideMedia'] }), pub, false).delete.shown, true, 'a granted hideMedia');
  assert.equal(mediaActions(user('admin', { permissions: ROLE_CAPS.admin.filter((c) => c !== 'editMedia') }), pub, false).delete.shown, false, 'hideMedia alone does not delete');
  assert.equal(mediaActions(ADMIN, mediaRow({ ...MEDIA, is_approved: 0 }), false).visibility.shown, false, 'publishing is the review\'s decision');
  const busy = mediaActions(OWNER, pub, true);
  assert.equal(busy.visibility.enabled, false);
  assert.equal(busy.delete.enabled, false);
});

test('mediaTable: the state as words, Hide or Show and Delete per row as the user may; pictures without a referrer', () => {
  const calls = [];
  const rows = [mediaRow(MEDIA, TOKEN), mediaRow({ ...MEDIA, media_id: 22, is_approved: 0 }, TOKEN)];
  const table = mediaTable(rows, {
    actionsFor: (row) => mediaActions(ADMIN, row, false),
    onVisibility: (row, next) => calls.push(['visibility', row.id, next]),
    onDelete: (row) => calls.push(['delete', row.id]),
  });
  const [t] = find(table, (n) => n.type === 'table');
  assert.equal(t.props['data-stack'], '');
  assert.deepEqual(find(find(t, (n) => n.type === 'thead')[0], (n) => n.type === 'th').map(text), ['Media', 'Species', 'Kind', 'Date', 'Public site', 'ID', 'Actions']);
  const buttons = find(t, (n) => n.type === 'button');
  assert.deepEqual(buttons.map((b) => text(b)), ['Hide from the site media 21', 'Delete media 21', 'Delete media 22']);
  buttons[0].props.onClick();
  buttons[2].props.onClick();
  assert.deepEqual(calls, [['visibility', 21, false], ['delete', 22]]);
  for (const img of find(t, (n) => n.type === 'img')) assert.equal(img.props.referrerPolicy, 'no-referrer');
  assert.doesNotMatch(JSON.stringify(table), /accent/);
  const readOnly = mediaTable(rows, { actionsFor: (row) => mediaActions(INTERN, row, false), onVisibility() {}, onDelete() {} });
  assert.ok(!find(readOnly, (n) => n.type === 'th').some((th) => text(th) === 'Actions'), 'no actions, no column');
});

test('MEDIA_CONFIRM, visibilityOutcome and mediaEmpty', () => {
  const confirm = MEDIA_CONFIRM.delete(mediaRow(MEDIA));
  assert.equal(confirm.title, 'Delete media 21 permanently?');
  assert.equal(confirm.body, 'The Sergeant major photo is deleted for good, with any saved clip, and stops being any species\' picture. This cannot be undone.');
  assert.equal(confirm.confirm, 'Delete permanently');
  assert.equal(visibilityOutcome(21, { media_id: 21, is_public: false }, true), 'Media 21 is hidden from the site.');
  assert.equal(visibilityOutcome(21, { media_id: 21, is_public: true }, false), 'Media 21 shows on the site again.');
  assert.equal(visibilityOutcome(21, null, false), 'Media 21 is hidden from the site.', 'no answer: what was asked');
  assert.equal(MEDIA_EMPTY, 'No approved media yet.');
  assert.equal(mediaEmpty({ folder: 'all', q: '' }), MEDIA_EMPTY);
  assert.equal(mediaEmpty({ folder: 'hidden', q: '' }), 'No media in this folder.');
  assert.equal(mediaEmpty({ folder: 'all', q: 'x' }), 'No media match the search.');
});

// --- the islands ----------------------------------------------------------------------------------------------------

test('AdminApp registers the catalogue screens by their route\'s screen name', () => {
  const app = source('src/islands/AdminApp.tsx');
  for (const [name, screen] of [['Species', 'species'], ['SpeciesDetail', 'speciesDetail'], ['Media', 'media']]) {
    assert.match(app, new RegExp(`import ${name} from '\\./admin/${name}'`));
    const screens = app.match(/const SCREENS[^=]*=\s*\{([^}]*)\}/)?.[1] ?? '';
    assert.match(screens, new RegExp(`\\b${screen}: ${name}\\b`));
  }
});

test('the catalogue screens: every API failure goes to notify; media only through the tested VDOM; confirms first', () => {
  for (const name of ['Species', 'SpeciesDetail', 'Media']) {
    const file = `src/islands/admin/${name}.tsx`;
    const body = source(file);
    assert.match(body, /\bnotify\b/, `${file}: uses notify`);
    assert.doesNotMatch(body, /<(img|video)\b/, `${file}: no media element of its own`);
    assert.doesNotMatch(body, /accent/, `${file}: never the accent`);
    assert.doesNotMatch(body, /\bfetch\(/, `${file}: the API only through apiFetch`);
    assert.doesNotMatch(body, /style=/, `${file}: no style attribute`);
  }
  const detail = source('src/islands/admin/SpeciesDetail.tsx');
  for (const kind of ['merge', 'move', 'delete']) assert.match(detail, new RegExp(`SPECIES_CONFIRM\\.${kind}\\(`), `the ${kind} asks first`);
  assert.match(detail, /failureNotice\(/, 'a refused delete says why');
  assert.match(detail, /speciesActions\(/);
  const media = source('src/islands/admin/Media.tsx');
  assert.match(media, /MEDIA_CONFIRM\.delete\(/);
  assert.match(media, /failureNotice\(/, 'a 409 names the sightings');
  assert.match(media, /mediaActions\(/);
});
