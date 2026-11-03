// The sighting review's queue, all sightings and review screens (src/lib/admin/sightings.mjs, drawn by
// src/islands/admin/{Queue,Sightings,Review}.tsx): the requests they send (the Java API's AdminSightingController is the
// authority), the pager's arithmetic, the rows, the approve payload, which actions show, the conditions and the clip.
// Pure, no build needed; the last tests read the islands' sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { API_BASE, ApiError, mediaUrl } from '../src/lib/java-api.mjs';
import {
  CONFIRM,
  DEFAULT_LIMIT,
  NOT_GIVEN,
  NO_ENVIRONMENT,
  PAGE_SIZES,
  QUEUE_COLUMNS,
  QUEUE_EMPTY,
  SIGHTINGS_COLUMNS,
  STATUS_FILTERS,
  UNIDENTIFIED,
  approvePayload,
  approveRequest,
  clipStatusRequest,
  clipExpected,
  clipLine,
  clipSummary,
  deleteRequest,
  discardCount,
  editOutcome,
  editPayload,
  editRequest,
  environmentNode,
  environmentRequest,
  environmentSummary,
  factsNode,
  formatWhen,
  listBody,
  loadFailure,
  listRequest,
  listState,
  mediaNode,
  mediaOf,
  mediaPicker,
  mediaView,
  nameLines,
  pageOf,
  pagerNode,
  queueRequest,
  rejectRequest,
  reviewActions,
  reviewFields,
  savedSighting,
  sightingRequest,
  sightingRow,
  sightingsEmpty,
  sightingsTable,
  statusOf,
  thumbOf,
  titleLineNode,
  whenNode,
  whenText,
} from '../src/lib/admin/sightings.mjs';
import { confirmButtonClass } from '../src/lib/admin/lists.mjs';

/** Every node of a VDOM tree, depth first. */
const nodes = (node) => (node === null || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(nodes)]);
const text = (node) => (node === null ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join(''));
const classes = (node) => (node.props.className ?? '').split(/\s+/).filter(Boolean);
const find = (tree, pred) => nodes(tree).filter(pred);
const source = (file) => readFileSync(file, 'utf8');

const UPLOADS = API_BASE.replace(/\/v1$/, '');

/** A queue row as AdminSightingService.shape() answers it (SELECT + cat + media_list). */
const ROW = Object.freeze({
  sighting_id: 42,
  species_id: 3,
  camera_id: 1,
  media_id: 7,
  sighting_datetime: '2026-10-31T14:22',
  life_stage: 'Adult',
  verification_status: 'unverified',
  contributor_type: 'volunteer',
  volunteer_name: 'Ana Reyes',
  individual_name: null,
  notes: 'Two by the north module',
  created_at: '2026-10-31T15:00:12',
  common_name: 'Sergeant major',
  scientific_name: 'Abudefduf saxatilis',
  family: 'Pomacentridae',
  genus: 'Abudefduf',
  category: 'Fish',
  conservation_status: 'LC',
  name_status: 'accepted',
  species_total: 12,
  camera_name: 'Reef camera',
  storage_type: 'youtube',
  storage_key: 'abcDEF12345',
  media_url: 'https://www.youtube.com/watch?v=abcDEF12345&t=95&wall=1761920520000',
  media_kind: 'video',
  thumb_url: null,
  archive_uri: 'db://media/7',
  cat: 'existing',
  media_list: [
    {
      media_id: 7, role: 'video', keep: true, storage_type: 'youtube', storage_key: 'abcDEF12345',
      url: 'https://www.youtube.com/watch?v=abcDEF12345&t=95', media_url: 'https://www.youtube.com/watch?v=abcDEF12345&t=95',
      media_kind: 'video', thumb_url: null, archive_uri: 'db://media/7', archived: true, frame: false, kind: 'video',
      video_id: 'abcDEF12345', clip_start: 95,
    },
  ],
});

// --- the requests ---------------------------------------------------------------------------------------------------

test('the queue and the list: GET /admin/queue?limit&offset and GET /admin/sightings?limit&offset&status&q', () => {
  assert.deepEqual(queueRequest({ limit: 20, offset: 40 }), { path: '/admin/queue', query: { limit: 20, offset: 40 } });
  assert.deepEqual(listRequest({ limit: 20, offset: 0, status: 'all', q: '' }), { path: '/admin/sightings', query: { limit: 20, offset: 0 } });
});

test('a status filter maps to the server\'s status (pending is "unverified"); a search string trims to q', () => {
  const query = (status, q = '') => listRequest({ limit: 50, offset: 100, status, q }).query;
  assert.deepEqual(query('pending'), { limit: 50, offset: 100, status: 'unverified' });
  assert.deepEqual(query('verified'), { limit: 50, offset: 100, status: 'verified' });
  assert.deepEqual(query('rejected'), { limit: 50, offset: 100, status: 'rejected' });
  assert.deepEqual(query('all'), { limit: 50, offset: 100 });
  assert.deepEqual(query('bogus'), { limit: 50, offset: 100 }, 'an unknown filter is no filter');
  assert.deepEqual(query('pending', '  grouper  '), { limit: 50, offset: 100, status: 'unverified', q: 'grouper' });
  assert.deepEqual(query('all', '   '), { limit: 50, offset: 100 }, 'blank search is no search');
  assert.deepEqual(STATUS_FILTERS.map((f) => f.value), ['all', 'pending', 'verified', 'rejected']);
  assert.deepEqual(STATUS_FILTERS.map((f) => f.label), ['All', 'Pending', 'Verified', 'Rejected']);
});

test('one sighting, its conditions, its clip, and the four actions, at the controller\'s paths', () => {
  assert.deepEqual(sightingRequest(42), { path: '/admin/sightings/42' });
  assert.deepEqual(environmentRequest(42), { path: '/admin/sightings/42/environment' });
  assert.deepEqual(clipStatusRequest(42), { path: '/admin/sightings/42/clip-status' });
  assert.deepEqual(rejectRequest(42), { path: '/admin/sightings/42/reject', method: 'PATCH' });
  assert.deepEqual(deleteRequest(42), { path: '/admin/sightings/42', method: 'DELETE' });
  const body = { sighting: { notes: 'x' } };
  assert.deepEqual(editRequest(42, body), { path: '/admin/sightings/42', method: 'PATCH', body });
  assert.deepEqual(approveRequest(ROW, {}), { path: '/admin/sightings/42/approve', method: 'PATCH', body: { keep: {} } });
  assert.deepEqual(approveRequest(ROW, { 7: false }), { path: '/admin/sightings/42/approve', method: 'PATCH', body: { keep: { 7: false } } });
  assert.equal(sightingRequest('42/../users').path, '/admin/sightings/42%2F..%2Fusers', 'an id never carries a path');
});

// --- the pager ------------------------------------------------------------------------------------------------------

test('listState: page arithmetic and the range label', () => {
  const at = (offset, total = 143, limit = 20) => listState({ rows: [{}], total, limit, offset, loading: false, error: null });
  const first = at(0);
  assert.equal(first.status, 'ready');
  assert.equal(first.page, 1);
  assert.equal(first.pages, 8);
  assert.equal(first.rangeLabel, '1–20 of 143');
  assert.equal(first.prevDisabled, true);
  assert.equal(first.nextDisabled, false);
  assert.equal(first.nextOffset, 20);
  const second = at(20);
  assert.equal(second.rangeLabel, '21–40 of 143');
  assert.equal(second.page, 2);
  assert.equal(second.prevOffset, 0);
  const last = at(140);
  assert.equal(last.page, 8);
  assert.equal(last.rangeLabel, '141–143 of 143');
  assert.equal(last.prevDisabled, false);
  assert.equal(last.nextDisabled, true);
  assert.equal(last.prevOffset, 120);
  assert.equal(at(0, 1234).rangeLabel, '1–20 of 1,234');
  assert.equal(at(0, 20).nextDisabled, true, 'one full page has no next');
  assert.equal(at(0, 21).pages, 2);
  const loading = listState({ rows: [{}], total: 143, limit: 20, offset: 20, loading: true, error: null });
  assert.equal(loading.status, 'ready', 'a page being replaced stays on show');
  assert.equal(loading.busy, true);
  assert.equal(loading.prevDisabled, true, 'no paging while a page loads');
  assert.equal(loading.nextDisabled, true);
  assert.equal(DEFAULT_LIMIT, 20);
  assert.ok(PAGE_SIZES.includes(DEFAULT_LIMIT));
  assert.ok(PAGE_SIZES.every((n) => n >= 1 && n <= 200), 'within the server\'s clamp');
});

test('listState: the empty case says so, with no table and no pager', () => {
  const empty = listState({ rows: [], total: 0, limit: 20, offset: 0, loading: false, error: null });
  assert.equal(empty.status, 'empty');
  assert.equal(empty.emptyText, 'No sightings waiting for review');
  assert.equal(QUEUE_EMPTY, 'No sightings waiting for review');
  assert.equal(empty.refetchOffset, null);
  const other = listState({ rows: [], total: 0, limit: 20, offset: 0, loading: false, error: null, empty: 'No sightings match.' });
  assert.equal(other.emptyText, 'No sightings match.');
  const first = listState({ rows: [], total: 0, limit: 20, offset: 0, loading: true, error: null });
  assert.equal(first.status, 'loading', 'nothing yet is loading, not empty');
});

test('listState: a page past the end (its last row was approved) asks for the last page instead of showing nothing', () => {
  const past = listState({ rows: [], total: 40, limit: 20, offset: 40, loading: false, error: null });
  assert.equal(past.refetchOffset, 20);
  assert.equal(past.status, 'loading');
  assert.equal(listState({ rows: [{}], total: 40, limit: 20, offset: 20, loading: false, error: null }).refetchOffset, null);
});

test('listState: the error branch is a notice with a retry, never an empty table', () => {
  const failed = listState({
    rows: [{}],
    total: 143,
    limit: 20,
    offset: 0,
    loading: false,
    error: new ApiError(0, null),
    failed: 'The review queue did not load.',
  });
  assert.equal(failed.status, 'error');
  assert.equal(failed.notice, 'The review queue did not load. The server did not answer. Try again in a minute.');
  assert.equal(failed.retry, true);
  const said = listState({ rows: [], total: 0, limit: 20, offset: 0, loading: false, error: new ApiError(403, { error: 'You do not have permission to do that.' }) });
  assert.equal(said.notice, 'The sightings did not load. You do not have permission to do that.');
  assert.equal(listState({ rows: [], total: 0, limit: 20, offset: 0, loading: true, error: null }).notice, null);
});

test('listBody: the notice and its retry, the empty sentence, the loading line, or the table and the pager', () => {
  const retry = () => {};
  const table = () => ({ type: 'table', props: {}, children: [] });
  const pager = () => ({ type: 'nav', props: {}, children: [] });
  const error = listBody(listState({ rows: [], total: 0, limit: 20, offset: 0, loading: false, error: new ApiError(500, null), failed: 'The review queue did not load.' }), { onRetry: retry, table, pager });
  assert.equal(error.props.role, 'alert');
  assert.ok(classes(error).includes('wb-notice') && classes(error).includes('wb-notice--error'));
  assert.match(text(error), /^The review queue did not load\. The server could not do that \(HTTP 500\)\. Try again\./);
  const button = find(error, (n) => n.type === 'button')[0];
  assert.equal(text(button), 'Try again');
  assert.equal(button.props.onClick, retry);
  assert.equal(button.props.type, 'button');
  assert.equal(find(error, (n) => n.type === 'table' || n.type === 'nav').length, 0);

  const empty = listBody(listState({ rows: [], total: 0, limit: 20, offset: 0, loading: false, error: null }), { onRetry: retry, table, pager });
  assert.equal(text(empty), 'No sightings waiting for review');
  assert.equal(find(empty, (n) => n.type === 'table' || n.type === 'nav').length, 0);

  const loading = listBody(listState({ rows: [], total: 0, limit: 20, offset: 0, loading: true, error: null }), { onRetry: retry, table, pager });
  assert.equal(loading.props.role, 'status');
  assert.match(text(loading), /Loading/);

  const ready = listBody(listState({ rows: [{}], total: 1, limit: 20, offset: 0, loading: true, error: null }), { onRetry: retry, table, pager });
  assert.equal(ready.props['aria-busy'], true);
  assert.deepEqual(ready.children.map((c) => c.type), ['table', 'nav']);
});

test('pagerNode: the count in words, Previous and Next guarded while aria-disabled, the page size', () => {
  const calls = [];
  const state = listState({ rows: [{}], total: 143, limit: 20, offset: 0, loading: false, error: null });
  const nav = pagerNode(state, { label: 'Queue pages', limit: 20, sizeId: 'queue-size', onPage: (o) => calls.push(o), onLimit: (n) => calls.push(['limit', n]) });
  assert.equal(nav.type, 'nav');
  assert.deepEqual(classes(nav), ['wb-pager']);
  assert.equal(nav.props['aria-label'], 'Queue pages');
  const info = find(nav, (n) => classes(n).includes('wb-pager__info'))[0];
  assert.equal(text(info), '1–20 of 143');
  const [prev] = find(nav, (n) => classes(n).includes('wb-pager__prev'));
  const [next] = find(nav, (n) => classes(n).includes('wb-pager__next'));
  for (const b of [prev, next]) assert.equal(b.props.type, 'button');
  assert.equal(text(prev), 'Previous');
  assert.equal(text(next), 'Next');
  assert.equal(prev.props['aria-disabled'], 'true');
  assert.equal(next.props['aria-disabled'], undefined);
  prev.props.onClick();
  assert.deepEqual(calls, [], 'an aria-disabled button is still clickable; its handler does nothing');
  next.props.onClick();
  assert.deepEqual(calls, [20]);
  const select = find(nav, (n) => n.type === 'select')[0];
  assert.deepEqual(classes(select), ['wb-select']);
  assert.equal(select.props.id, 'queue-size');
  assert.equal(select.props.value, 20);
  assert.deepEqual(find(select, (n) => n.type === 'option').map((o) => Number(o.props.value)), PAGE_SIZES);
  select.props.onChange({ target: { value: '50' } });
  assert.deepEqual(calls, [20, ['limit', 50]]);
  const label = find(nav, (n) => n.type === 'label')[0];
  assert.equal(label.props.htmlFor, 'queue-size');
  assert.equal(text(label), 'Rows per page');
});

test('pageOf: the server\'s {rows,total}, or a bare array, or nothing', () => {
  assert.deepEqual(pageOf({ rows: [ROW], total: 9, limit: 20, offset: 0 }), { rows: [ROW], total: 9 });
  assert.deepEqual(pageOf([ROW]), { rows: [ROW], total: 1 });
  assert.deepEqual(pageOf(null), { rows: [], total: 0 });
  assert.deepEqual(pageOf({ rows: [ROW] }), { rows: [ROW], total: 1 });
});

// --- the rows -------------------------------------------------------------------------------------------------------

test('formatWhen: the server\'s UTC wall time, shown in the park\'s time zone', () => {
  assert.equal(formatWhen('2026-10-31T14:22'), 'Oct 31, 2026, 10:22 AM', 'EDT');
  assert.equal(formatWhen('2026-10-31 14:22:00'), 'Oct 31, 2026, 10:22 AM', 'the snapshot\'s form');
  assert.equal(formatWhen('2026-10-31T14:22:05.5Z'), 'Oct 31, 2026, 10:22 AM');
  assert.equal(formatWhen('2026-11-02T14:22'), 'Nov 2, 2026, 9:22 AM', 'EST');
  assert.equal(formatWhen(null), NOT_GIVEN);
  assert.equal(formatWhen(''), NOT_GIVEN);
  assert.equal(formatWhen('last Tuesday'), 'last Tuesday', 'what it cannot read, it shows as it is');
});

test('statusOf: the server\'s verification_status as the design\'s status', () => {
  assert.equal(statusOf({ verification_status: 'unverified' }), 'pending');
  assert.equal(statusOf({ verification_status: 'verified' }), 'verified');
  assert.equal(statusOf({ verification_status: 'REJECTED' }), 'rejected');
  assert.equal(statusOf({ verification_status: null }), 'pending');
  assert.equal(statusOf(null), 'pending');
});

test('sightingRow: the fields the old queue showed, with the primary media\'s thumbnail', () => {
  assert.deepEqual(sightingRow(ROW, 'jwt'), {
    id: 42,
    href: '#/review/42',
    when: 'Oct 31, 2026, 10:22 AM',
    species: 'Sergeant major',
    scientific: 'Abudefduf saxatilis',
    visitorsName: null,
    newSpecies: false,
    status: 'pending',
    statusLabel: 'Pending',
    submitter: 'Ana Reyes',
    camera: 'Reef camera',
    thumb: { src: mediaUrl('poster', 7, 'jwt'), video: true },
  });
});

test('sightingRow tolerates a sighting with no media and no species', () => {
  const row = sightingRow({ sighting_id: 5, verification_status: 'unverified', species_id: null, media_id: null, media_list: [] }, 'jwt');
  assert.equal(row.id, 5);
  assert.equal(row.species, UNIDENTIFIED);
  assert.equal(row.scientific, null);
  assert.equal(row.newSpecies, true);
  assert.equal(row.thumb, null);
  assert.equal(row.submitter, NOT_GIVEN);
  assert.equal(row.camera, NOT_GIVEN);
  assert.equal(row.when, NOT_GIVEN);
  assert.equal(sightingRow({ sighting_id: 6 }).thumb, null, 'no media_list at all');
  assert.equal(sightingRow({ sighting_id: 6, created_at: '2026-10-31T14:22' }).when, 'Oct 31, 2026, 10:22 AM', 'logged time when no sighting time');
  assert.equal(sightingRow({ sighting_id: 6, contributor_type: 'student' }).submitter, 'student');
});

test('sightingRow: a provisional name is "Unidentified"; a species seen once is new', () => {
  const guess = sightingRow({ ...ROW, name_status: 'provisional', common_name: 'Blue thing' });
  assert.equal(guess.species, UNIDENTIFIED);
  assert.equal(guess.newSpecies, true);
  assert.equal(sightingRow({ ...ROW, scientific_name: '[unverified] Foo bar' }).species, UNIDENTIFIED);
  assert.equal(sightingRow({ ...ROW, cat: 'new' }).newSpecies, true);
  assert.equal(sightingRow({ ...ROW, common_name: null }).species, 'Abudefduf saxatilis');
});

test('thumbOf: archived poster or frame, YouTube, Drive through the proxy, an upload, a plain URL, or none', () => {
  assert.equal(thumbOf({ media_id: 7, archive_uri: 'db://media/7', kind: 'video' }, 'jwt'), mediaUrl('poster', 7, 'jwt'));
  assert.equal(thumbOf({ media_id: 8, archive_uri: 'db://media/8', storage_type: 'frame', frame: true }, 'jwt'), mediaUrl('clip', 8, 'jwt'), 'a frame is its own picture');
  assert.equal(thumbOf({ media_id: 9, storage_type: 'youtube', storage_key: 'abcDEF12345' }, 'jwt'), 'https://img.youtube.com/vi/abcDEF12345/hqdefault.jpg');
  assert.equal(thumbOf({ media_id: 9, url: 'https://youtu.be/abcDEF12345' }), 'https://img.youtube.com/vi/abcDEF12345/hqdefault.jpg');
  const drive = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view';
  assert.equal(thumbOf({ media_id: 10, url: drive }, 'jwt'), mediaUrl('thumb', 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUv&sz=w640', 'jwt'));
  assert.equal(thumbOf({ media_id: 11, storage_type: 'upload', url: '/uploads/1730-abc.jpg' }, 'jwt'), `${UPLOADS}/uploads/1730-abc.jpg`);
  assert.equal(thumbOf({ media_id: 11, storage_type: 'upload', url: '/uploads/1730-abc.jpg', thumb_url: '/uploads/1730-abc-t.jpg' }), `${UPLOADS}/uploads/1730-abc-t.jpg`, 'the smaller one');
  assert.equal(thumbOf({ media_id: 12, url: 'https://example.org/fish.jpg' }), 'https://example.org/fish.jpg');
  assert.equal(thumbOf({ media_id: 13, url: '/uploads/../../etc' }), null, 'a path-y upload is no picture');
  assert.equal(thumbOf({ media_id: 14, url: 'javascript:alert(1)' }), null);
  assert.equal(thumbOf({ media_id: 15 }), null);
  assert.equal(thumbOf(null), null);
});

test('sightingsTable: a stacking table in its wrapper, every cell labelled, the thumbnail without a referrer', () => {
  const rows = [sightingRow(ROW, 'jwt'), sightingRow({ sighting_id: 5, verification_status: 'rejected' }, 'jwt')];
  const wrap = sightingsTable(rows, { caption: 'Sightings waiting for review', columns: QUEUE_COLUMNS });
  assert.equal(wrap.type, 'div');
  assert.deepEqual(classes(wrap), ['wb-table-wrap']);
  const table = wrap.children[0];
  assert.equal(table.type, 'table');
  assert.deepEqual(classes(table), ['wb-table']);
  assert.equal(table.props['data-stack'], '');
  const caption = find(table, (n) => n.type === 'caption')[0];
  assert.equal(text(caption), 'Sightings waiting for review');
  const heads = find(find(table, (n) => n.type === 'thead')[0], (n) => n.type === 'th');
  for (const th of heads) assert.equal(th.props.scope, 'col');
  const labels = heads.map(text);
  assert.deepEqual(labels, ['Media', 'Species', 'Submitted by', 'Camera', 'Seen', 'ID']);
  const bodyRows = find(find(table, (n) => n.type === 'tbody')[0], (n) => n.type === 'tr');
  assert.equal(bodyRows.length, 2);
  for (const tr of bodyRows) {
    const cells = tr.children;
    assert.deepEqual(cells.map((c) => c.props['data-label']), labels, 'every cell carries its column');
    assert.equal(cells.filter((c) => c.type === 'th' && c.props.scope === 'row').length, 1, 'one row header: the species');
  }
  const img = find(table, (n) => n.type === 'img')[0];
  assert.equal(img.props.referrerPolicy, 'no-referrer');
  assert.equal(img.props.src, mediaUrl('poster', 7, 'jwt'));
  assert.equal(img.props.loading, 'lazy');
  assert.equal(typeof img.props.alt, 'string');
  assert.equal(typeof img.props.onError, 'function');
  assert.equal(find(table, (n) => n.type === 'img').length, 1, 'no media, no picture');
  assert.match(text(bodyRows[1]), /No media/);
  const link = find(bodyRows[0], (n) => n.type === 'a')[0];
  assert.equal(link.props.href, '#/review/42');
  assert.equal(text(link), 'Sergeant major');
  assert.match(text(bodyRows[0]), /Abudefduf saxatilis/);
});

test('sightingsTable for all sightings: a status chip (never the accent) and a recycle button per row', () => {
  const recycled = [];
  const rows = [sightingRow(ROW), sightingRow({ ...ROW, sighting_id: 43, verification_status: 'verified' })];
  const wrap = sightingsTable(rows, { caption: 'All sightings', columns: SIGHTINGS_COLUMNS, onRecycle: (row) => recycled.push(row.id) });
  const heads = find(wrap, (n) => n.type === 'th' && n.props.scope === 'col').map(text);
  assert.deepEqual(heads, ['Media', 'Species', 'Status', 'Camera', 'Seen', 'Submitted by', 'ID', 'Actions']);
  const chips = find(wrap, (n) => classes(n).includes('wb-status'));
  assert.deepEqual(chips.map((c) => c.props['data-status']), ['pending', 'verified']);
  assert.deepEqual(chips.map(text), ['Pending', 'Verified']);
  for (const chip of chips) assert.deepEqual(classes(chip), ['wb-chip', 'wb-status']);
  assert.equal(find(wrap, (n) => /accent/.test(n.props.className ?? '')).length, 0);
  const buttons = find(wrap, (n) => n.type === 'button');
  assert.equal(buttons.length, 2);
  for (const b of buttons) assert.deepEqual(classes(b), ['wb-btn', 'wb-btn--ghost']);
  assert.match(text(buttons[1]), /sighting 43/, 'each button names its sighting');
  buttons[1].props.onClick();
  assert.deepEqual(recycled, [43]);
  const without = sightingsTable(rows, { caption: 'All sightings', columns: SIGHTINGS_COLUMNS });
  assert.equal(find(without, (n) => n.type === 'button').length, 0, 'no onRecycle, no button');
  assert.ok(!find(without, (n) => n.type === 'th').map(text).includes('Actions'));
});

// --- the review -----------------------------------------------------------------------------------------------------

const MEDIA_TWO = [
  { media_id: 11, role: 'photo', storage_type: 'upload', url: '/uploads/a.jpg', kind: 'photo', keep: true },
  { media_id: 12, role: 'photo', storage_type: 'upload', url: '/uploads/b.jpg', kind: 'photo', keep: true },
];

test('approvePayload (Ruling P9): with one discarded, an entry for every media item, kept unless discarded', () => {
  const s = { sighting_id: 42, media_list: MEDIA_TWO };
  assert.deepEqual(approvePayload(s, { 12: false }), { keep: { 11: true, 12: false } });
  assert.deepEqual(approvePayload(s, { 11: true, 12: false }), { keep: { 11: true, 12: false } });
  assert.deepEqual(approvePayload(s, { 11: false, 12: false }), { keep: { 11: false, 12: false } }, 'discarding all is the reviewer\'s to choose');
  assert.deepEqual(Object.keys(approvePayload(s, { 12: false }).keep), ['11', '12'], 'the keys are media ids as text');
});

test('approvePayload (Ruling P9): nothing discarded sends { keep: {} }, so the server leaves the media alone', () => {
  // AdminSightingService.approve runs its keep branch for any non-empty map, and discardUnkept then repoints (or nulls)
  // the primary media of a sighting whose media are not all in sighting_media: all-true would drop a legacy photo.
  const s = { sighting_id: 42, media_list: MEDIA_TWO };
  assert.deepEqual(approvePayload(s, {}), { keep: {} });
  assert.deepEqual(approvePayload(s), { keep: {} });
  assert.deepEqual(approvePayload(s, { 11: true, 12: true }), { keep: {} });
  assert.deepEqual(approvePayload(s, { 99: false }), { keep: {} }, 'a discard of media it does not have is no discard');
  const legacy = { sighting_id: 7, media_id: 70, media_list: [{ media_id: 70, role: 'photo', keep: true, url: '/uploads/old.jpg' }] };
  assert.deepEqual(approvePayload(legacy, {}), { keep: {} }, 'the fallback item of a sighting with no junction rows');
});

test('approvePayload: a sighting with no media sends { keep: {} }', () => {
  assert.deepEqual(approvePayload({ sighting_id: 5, media_list: [] }, {}), { keep: {} });
  assert.deepEqual(approvePayload({ sighting_id: 5 }, {}), { keep: {} });
  assert.deepEqual(approvePayload(null, {}), { keep: {} });
});

test('mediaOf: the sighting\'s media list, primary first', () => {
  assert.deepEqual(mediaOf({ media_id: 12, media_list: MEDIA_TWO }).map((m) => m.media_id), [12, 11]);
  assert.deepEqual(mediaOf({ media_id: null, media_list: MEDIA_TWO }).map((m) => m.media_id), [11, 12]);
  assert.deepEqual(mediaOf({ media_list: [null, { role: 'x' }, ...MEDIA_TWO] }).map((m) => m.media_id), [11, 12], 'no id, no item');
  assert.deepEqual(mediaOf({}), []);
});

test('reviewActions: each needs reviewSightings; everything disables while busy', () => {
  const intern = { role: 'intern' };
  const pending = { sighting_id: 42, verification_status: 'unverified' };
  const all = (shown, enabled) => ({ approve: { shown, enabled }, reject: { shown, enabled }, delete: { shown, enabled }, edit: { shown, enabled } });
  assert.deepEqual(reviewActions(intern, pending, false), all(true, true));
  assert.deepEqual(reviewActions(intern, pending, true), all(true, false));
  assert.deepEqual(reviewActions({ role: 'owner' }, pending, false), all(true, true));
  assert.deepEqual(reviewActions({ role: 'volunteer' }, pending, false), all(false, false));
  assert.deepEqual(reviewActions({ role: 'intern', permissions: ['viewData'] }, pending, false), all(false, false));
  assert.deepEqual(reviewActions(intern, null, false), all(false, false));
});

test('reviewActions: approve and reject hide once the sighting is not pending; a rejected one is already in the bin', () => {
  const intern = { role: 'intern' };
  const verified = reviewActions(intern, { verification_status: 'verified' }, false);
  assert.deepEqual(verified.approve, { shown: false, enabled: false });
  assert.deepEqual(verified.reject, { shown: false, enabled: false });
  assert.deepEqual(verified.delete, { shown: true, enabled: true });
  assert.deepEqual(verified.edit, { shown: true, enabled: true });
  const rejected = reviewActions(intern, { verification_status: 'rejected' }, false);
  assert.equal(rejected.approve.shown, false);
  assert.equal(rejected.reject.shown, false);
  assert.equal(rejected.delete.shown, false);
  assert.equal(rejected.edit.shown, true);
});

test('discardCount: how many media an approve would drop (the confirm asks only then)', () => {
  const s = { sighting_id: 42, media_list: MEDIA_TWO };
  assert.equal(discardCount(s, {}), 0);
  assert.equal(discardCount(s, { 11: true }), 0);
  assert.equal(discardCount(s, { 99: false }), 0, 'media it does not have');
  assert.equal(discardCount(s, { 12: false }), 1);
  assert.equal(discardCount(s, { 11: false, 12: false }), 2);
  assert.equal(discardCount(null, { 12: false }), 0);
});

test('CONFIRM.approveDiscard: dropping media cannot be undone, said in the singular and the plural', () => {
  const one = CONFIRM.approveDiscard(42, 1);
  assert.equal(one.title, 'Approve sighting 42 and drop one of its media?');
  assert.equal(one.body, 'The dropped item leaves this sighting and is deleted for good unless another sighting uses it. This cannot be undone: undo in the activity log brings back the status, not the media.');
  assert.equal(one.confirm, 'Approve and drop it');
  const two = CONFIRM.approveDiscard(42, 2);
  assert.equal(two.title, 'Approve sighting 42 and drop 2 of its media?');
  assert.equal(two.body, 'The 2 dropped items leave this sighting and are deleted for good unless another sighting uses them. This cannot be undone: undo in the activity log brings back the status, not the media.');
  assert.equal(two.confirm, 'Approve and drop them');
});

test('CONFIRM: reject and delete each ask first, naming the sighting and where it goes', () => {
  const reject = CONFIRM.reject(42);
  assert.equal(reject.title, 'Reject sighting 42?');
  assert.match(reject.body, /recycle bin/);
  assert.equal(reject.confirm, 'Reject');
  const del = CONFIRM.delete(42);
  assert.equal(del.title, 'Move sighting 42 to the recycle bin?');
  assert.match(del.body, /restore/);
  assert.equal(del.confirm, 'Move to recycle bin');
});

test('environmentSummary: nothing is "No environment snapshot"', () => {
  for (const env of [null, undefined, {}, { data: {} }, { data: {}, groups: [] }, { groups: [{ title: 'Weather', items: [] }] }, 'x']) {
    assert.deepEqual(environmentSummary(env), { empty: true, note: NO_ENVIRONMENT, groups: [] }, JSON.stringify(env));
  }
  assert.equal(NO_ENVIRONMENT, 'No environment snapshot');
});

test('environmentSummary: the labelled groups, each reading rounded to two places with its unit', () => {
  const env = {
    observed_for: '2026-10-31T14:22',
    captured_at: '2026-10-31T14:25:03',
    data: {},
    groups: [
      {
        title: 'Water quality',
        observed_at: '2026-10-31T14:00',
        items: [
          { attribute: 'temp_c', label: 'Water temperature', unit: '°C', description: 'At one metre', value: 27.456 },
          { attribute: 'ph', label: 'pH', unit: null, description: null, value: 8.1 },
          { attribute: 'state', label: 'State', unit: null, description: null, value: 'calm' },
        ],
      },
    ],
  };
  assert.deepEqual(environmentSummary(env), {
    empty: false,
    note: 'Matched to Oct 31, 2026, 10:22 AM, captured Oct 31, 2026, 10:25 AM.',
    groups: [
      {
        title: 'Water quality',
        lines: [
          { label: 'Water temperature', value: '27.46 °C', description: 'At one metre' },
          { label: 'pH', value: '8.1', description: null },
          { label: 'State', value: 'calm', description: null },
        ],
      },
    ],
  });
});

test('environmentSummary: the older raw snapshot, one group per station', () => {
  const env = {
    observed_for: '2026-10-31 14:22:00',
    data: {
      'wahoo-sonde': { observed_at: '2026-10-31 14:20:00', dist_min: 2.5, readings: { temp: 27.4, salinity: 35 } },
      buoy: { observed_at: '2026-10-31 14:10:00', dist_min: 12, readings: [7.25, 'n/a'] },
    },
  };
  const summary = environmentSummary(env);
  assert.equal(summary.empty, false);
  assert.equal(summary.note, 'Matched to Oct 31, 2026, 10:22 AM.');
  assert.deepEqual(summary.groups, [
    {
      title: 'wahoo-sonde',
      lines: [
        { label: 'Reading taken', value: 'Oct 31, 2026, 10:20 AM, 2.5 min from the sighting', description: null },
        { label: 'temp', value: '27.4', description: null },
        { label: 'salinity', value: '35', description: null },
      ],
    },
    {
      title: 'buoy',
      lines: [
        { label: 'Reading taken', value: 'Oct 31, 2026, 10:10 AM, 12 min from the sighting', description: null },
        { label: 'Reading 1', value: '7.25', description: null },
        { label: 'Reading 2', value: 'n/a', description: null },
      ],
    },
  ]);
});

test('environmentNode: the note, then each group as a heading and a list of terms', () => {
  const empty = environmentNode(environmentSummary(null));
  assert.equal(text(empty), NO_ENVIRONMENT);
  const tree = environmentNode(environmentSummary({ observed_for: '2026-10-31T14:22', groups: [{ title: 'Weather', items: [{ label: 'Wind', unit: 'kn', value: 12 }] }] }));
  assert.match(text(tree), /Matched to Oct 31, 2026, 10:22 AM\./);
  assert.equal(text(find(tree, (n) => n.type === 'h4')[0]), 'Weather');
  assert.equal(text(find(tree, (n) => n.type === 'dt')[0]), 'Wind');
  assert.equal(text(find(tree, (n) => n.type === 'dd')[0]), '12 kn');
});

test('clipSummary: what the clip-status says, and whether to ask again', () => {
  assert.equal(clipSummary(null), null);
  assert.deepEqual(clipSummary({ media_id: 7, archived: true, state: 'done' }), { text: 'Clip saved for review', pending: false });
  assert.deepEqual(clipSummary({ media_id: 7, archived: true, state: 'pending' }), { text: 'Clip saved for review', pending: false }, 'archived wins');
  assert.deepEqual(clipSummary({ media_id: 7, archived: false, state: 'pending' }), { text: 'Saving the clip…', pending: true });
  assert.deepEqual(clipSummary({ media_id: 7, archived: false, state: 'failed' }), { text: 'Saving the clip failed', pending: false });
  assert.deepEqual(clipSummary({ media_id: 7, archived: false, state: 'skipped' }), { text: 'The clip was not saved', pending: false });
  assert.deepEqual(clipSummary({ media_id: null, archived: false, state: 'none' }), { text: 'No saved clip', pending: false });
});

test('mediaView: an archived clip plays from the API; YouTube links out; a photo shows; nothing says so', () => {
  assert.deepEqual(mediaView(ROW.media_list[0], 'jwt'), { type: 'video', src: mediaUrl('clip', 7, 'jwt'), poster: mediaUrl('poster', 7, 'jwt') });
  const live = { ...ROW.media_list[0], archive_uri: null, archived: false };
  assert.deepEqual(mediaView(live, 'jwt'), {
    type: 'youtube',
    src: 'https://img.youtube.com/vi/abcDEF12345/hqdefault.jpg',
    href: 'https://www.youtube.com/watch?v=abcDEF12345&t=95s',
  });
  assert.deepEqual(mediaView(MEDIA_TWO[0], 'jwt'), { type: 'image', src: `${UPLOADS}/uploads/a.jpg` });
  const drive = { media_id: 3, url: 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUv' };
  assert.deepEqual(mediaView(drive, 'jwt'), { type: 'image', src: mediaUrl('thumb', 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUv&sz=w1600', 'jwt') });
  assert.deepEqual(mediaView(null), { type: 'none' });
  assert.deepEqual(mediaView({ media_id: 4 }), { type: 'none' });
});

test('mediaNode: every picture carries referrerPolicy no-referrer; the clip has none (no media element has it)', () => {
  for (const view of [mediaView({ ...ROW.media_list[0], archive_uri: null, archived: false }, 'jwt'), mediaView(MEDIA_TWO[0], 'jwt')]) {
    const imgs = find(mediaNode(view), (n) => n.type === 'img');
    assert.equal(imgs.length, 1, view.type);
    assert.equal(imgs[0].props.referrerPolicy, 'no-referrer', view.type);
  }
  const clip = find(mediaNode(mediaView(ROW.media_list[0], 'jwt')), (n) => n.type === 'video');
  assert.equal(clip.length, 1);
  assert.ok(!('referrerPolicy' in clip[0].props), 'not an attribute of <video>');
  const frames = find(mediaNode(mediaView(MEDIA_TWO[0], 'jwt')), (n) => classes(n).includes('wb-video'));
  // hideBroken hides the element itself: a new source must be a new element, or a picture after a broken one stays hidden.
  const keys = [MEDIA_TWO[0], MEDIA_TWO[1], ROW.media_list[0], { ...ROW.media_list[0], archive_uri: null, archived: false }].map((m) => mediaNode(mediaView(m, 'jwt')).props.key);
  assert.deepEqual(keys, [`${UPLOADS}/uploads/a.jpg`, `${UPLOADS}/uploads/b.jpg`, mediaUrl('clip', 7, 'jwt'), 'https://img.youtube.com/vi/abcDEF12345/hqdefault.jpg']);
  assert.equal(new Set(keys).size, keys.length, 'each source its own key');
  assert.equal(mediaNode({ type: 'none' }).props.key, 'none');
  assert.equal(frames.length, 1, 'shown in the design\'s 16:9 frame');
  const css = source('src/styles/site.css');
  assert.match(css, /\.wb-media\.site-admin__thumb\[hidden\],\s*\.site-admin__hero > img\[hidden\]\s*\{\s*display: none;/, 'a broken picture hides despite the design\'s display: block');
  const video = find(mediaNode(mediaView(ROW.media_list[0], 'jwt')), (n) => n.type === 'video')[0];
  assert.equal(video.props.controls, true);
  assert.equal(video.props.poster, mediaUrl('poster', 7, 'jwt'));
  const yt = find(mediaNode(mediaView({ ...ROW.media_list[0], archive_uri: null, archived: false })), (n) => n.type === 'a')[0];
  assert.equal(yt.props.href, 'https://www.youtube.com/watch?v=abcDEF12345&t=95s');
  assert.match(yt.props.rel, /noreferrer/);
  assert.match(text(mediaNode({ type: 'none' })), /No media attached/);
});

test('mediaPicker: with two or more media, each can be shown large and kept or discarded', () => {
  const shown = [];
  const kept = [];
  const tree = mediaPicker(MEDIA_TWO, { active: 11, keep: { 12: false }, token: 'jwt', onShow: (id) => shown.push(id), onKeep: (id, on) => kept.push([id, on]) });
  const imgs = find(tree, (n) => n.type === 'img');
  assert.equal(imgs.length, 2);
  for (const img of imgs) assert.equal(img.props.referrerPolicy, 'no-referrer');
  const buttons = find(tree, (n) => n.type === 'button');
  assert.deepEqual(buttons.map((b) => b.props['aria-pressed']), [true, false]);
  assert.deepEqual(buttons.map((b) => classes(b)[1]), ['wb-btn--action', 'wb-btn--ghost'], 'the one shown is in action blue');
  buttons[1].props.onClick();
  assert.deepEqual(shown, [12]);
  const boxes = find(tree, (n) => n.type === 'input');
  assert.deepEqual(boxes.map((b) => b.props.type), ['checkbox', 'checkbox']);
  assert.deepEqual(boxes.map((b) => b.props.checked), [true, false]);
  boxes[1].props.onChange({ target: { checked: true } });
  assert.deepEqual(kept, [[12, true]]);
  const labels = find(tree, (n) => n.type === 'label');
  assert.deepEqual(labels.map((l) => l.props.htmlFor), boxes.map((b) => b.props.id));
  assert.match(text(tree), /dropped when you approve/);
  assert.equal(mediaPicker([MEDIA_TWO[0]], { active: 11, keep: {}, token: 'jwt', onShow() {}, onKeep() {} }), null, 'one item: nothing to choose');
});

test('reviewFields and editPayload: only what changed is sent, trimmed; species fields only with a species', () => {
  const s = { ...ROW };
  const fields = reviewFields(s);
  assert.equal(fields.common_name, 'Sergeant major');
  assert.equal(fields.individual_name, '', 'null is an empty box');
  assert.equal(editPayload(s, fields), null, 'nothing changed');
  assert.equal(editPayload(s, { ...fields, notes: '  Two by the north module ' }), null, 'spaces are no change');
  assert.deepEqual(editPayload(s, { ...fields, notes: 'Two', common_name: 'Sergeant-major ' }), {
    sighting: { notes: 'Two' },
    species: { common_name: 'Sergeant-major' },
  });
  assert.deepEqual(editPayload(s, { ...fields, notes: '' }), { sighting: { notes: '' } }, 'emptied: the server stores null');
  assert.equal(editPayload({ ...s, species_id: null }, { ...fields, family: 'Other' }), null, 'no species to change');
  assert.ok(!('habitat_type' in fields), 'a field the row does not carry is never sent blank over the species');
});

test('editOutcome: the edit endpoint\'s updated: false is "Nothing was changed", not "saved"', () => {
  assert.deepEqual(editOutcome('42', { sighting_id: 42, updated: true }), { saved: true, text: 'Your changes to sighting 42 are saved.' });
  assert.deepEqual(editOutcome('42', { sighting_id: 42, updated: false }), { saved: false, text: 'Nothing was changed on sighting 42.' });
  assert.deepEqual(editOutcome('42', null), { saved: true, text: 'Your changes to sighting 42 are saved.' }, 'an answer without the field is the server\'s OK');
});

test('savedSighting: the sighting as the server now has it (an emptied field is null)', () => {
  const after = savedSighting(ROW, { sighting: { notes: '' }, species: { common_name: 'Sergeant-major' } });
  assert.equal(after.notes, null);
  assert.equal(after.common_name, 'Sergeant-major');
  assert.equal(after.sighting_id, 42);
  assert.equal(savedSighting(ROW, null), ROW);
});

test('sightingsEmpty: the sentence for an empty view says why', () => {
  assert.equal(sightingsEmpty({ status: 'all', q: '' }), 'No sightings yet.');
  assert.equal(sightingsEmpty({ status: 'pending', q: ' ' }), 'No pending sightings.');
  assert.equal(sightingsEmpty({ status: 'verified', q: '' }), 'No verified sightings.');
  assert.match(sightingsEmpty({ status: 'rejected', q: '' }), /^No rejected sightings here.*recycle bin/, 'reject moves a sighting to the bin');
  assert.equal(sightingsEmpty({ status: 'pending', q: 'grouper' }), 'No sightings match the search.');
});

test('loadFailure: a sighting that is not there, or one that did not load and can be asked for again', () => {
  assert.deepEqual(loadFailure('42', new ApiError(404, { error: 'Sighting 42 not found or already actioned.' })), { text: 'Sighting 42 was not found.', retry: false });
  assert.deepEqual(loadFailure('42', new ApiError(0, null)), { text: 'Sighting 42 did not load. The server did not answer. Try again in a minute.', retry: true });
});

test('factsNode: the sighting\'s facts as a list of terms', () => {
  const tree = factsNode(ROW);
  assert.equal(tree.type, 'dl');
  const terms = find(tree, (n) => n.type === 'dt').map(text);
  const values = find(tree, (n) => n.type === 'dd').map(text);
  assert.deepEqual(terms, ['Seen', 'Logged', 'Camera', 'Submitted by', 'Contributor', 'Species']);
  assert.deepEqual(values, ['Oct\u00a031,\u00a02026, 10:22\u00a0AM', 'Oct\u00a031,\u00a02026, 11:00\u00a0AM', 'Reef camera', 'Ana Reyes', 'volunteer', 'Known species'], 'a time breaks only between its day and its time (whenText)');
});

// --- the finish review (Task 7) -------------------------------------------------------------------------------------

/** The provisional species the sighting form makes from a name no species has (SightingWriteService.resolveSpeciesId). */
const GUESS = Object.freeze({
  ...ROW,
  sighting_id: 1451,
  species_id: 18,
  common_name: 'Big silver fish with a yellow tail',
  scientific_name: '[unverified] Big silver fish with a yellow tail',
  family: null,
  genus: null,
  name_status: 'provisional',
  cat: 'new',
});

test('fix 4: a provisional name has no scientific name; what the visitor typed is a plain sub-line, not a taxon', () => {
  const row = sightingRow(GUESS);
  assert.equal(row.species, UNIDENTIFIED);
  assert.equal(row.scientific, null, 'the "[unverified] …" placeholder is no scientific name');
  assert.equal(row.visitorsName, 'Big silver fish with a yellow tail');
  assert.equal(row.newSpecies, true);
  assert.equal(sightingRow({ ...GUESS, name_status: null }).scientific, null, 'the placeholder alone is enough');
  assert.equal(sightingRow(ROW).visitorsName, null, 'a confirmed species is nobody\'s guess');
  for (const columns of [QUEUE_COLUMNS, SIGHTINGS_COLUMNS]) {
    const wrap = sightingsTable([row], { caption: 'x', columns });
    const head = find(wrap, (n) => n.type === 'th' && n.props.scope === 'row')[0];
    assert.equal(find(head, (n) => n.type === 'i').length, 0, 'nothing in italics');
    const subs = find(head, (n) => classes(n).includes('site-admin__sub')).map(text);
    assert.deepEqual(subs, ['Visitor\'s name: Big silver fish with a yellow tail', 'New species']);
    assert.doesNotMatch(text(head), /\[unverified\]/i);
  }
  const lines = nameLines(sightingRow(ROW)).filter(Boolean);
  assert.equal(lines.length, 1);
  assert.equal(find(lines[0], (n) => n.type === 'i').length, 1, 'a real scientific name stays in italics');
});

test('fix 3b: the Submitted-by cell may break anywhere (an email typed as a name); no other cell opts in', () => {
  const email = 'seagrass.monitoring.volunteers@pompanobeachschools.example.org';
  for (const columns of [QUEUE_COLUMNS, SIGHTINGS_COLUMNS]) {
    const wrap = sightingsTable([sightingRow({ ...ROW, volunteer_name: email })], { caption: 'x', columns, onRecycle() {} });
    const cells = find(find(wrap, (n) => n.type === 'tbody')[0], (n) => n.type === 'td' || n.type === 'th');
    const long = cells.filter((c) => classes(c).includes('wb-table__long'));
    assert.deepEqual(long.map((c) => c.props['data-label']), ['Submitted by']);
    assert.equal(text(long[0]), email);
  }
});

test('fix 6: a time in a table cell is two lines, the day over the time, neither of which breaks', () => {
  const node = whenNode('Nov 2, 2026, 5:40 PM');
  assert.deepEqual(classes(node), ['site-admin__when']);
  assert.deepEqual(node.children.map((c) => c.type), ['span', 'span']);
  assert.deepEqual(node.children.map(text), ['Nov 2, 2026', '5:40 PM'], 'no-break spaces keep each part whole');
  assert.deepEqual(whenNode('Oct 31, 2026').children.map(text), ['Oct 31, 2026'], 'a day alone is one line');
  assert.deepEqual(whenNode(NOT_GIVEN).children.map(text), [NOT_GIVEN]);
  assert.deepEqual(whenNode('last Tuesday by the north module').children.map(text), ['last Tuesday by the north module'], 'what is no time may still wrap');
  const wrap = sightingsTable([sightingRow(ROW)], { caption: 'x', columns: QUEUE_COLUMNS });
  const seen = find(wrap, (n) => n.type === 'td' && n.props['data-label'] === 'Seen')[0];
  assert.deepEqual(find(seen, (n) => classes(n).includes('site-admin__when')).length, 1);
  assert.equal(text(seen), 'Oct 31, 2026' + '10:22 AM');
});

test('fix 12: while the list\'s error notice offers Try again, the screen\'s Refresh is not shown', () => {
  const base = { rows: [{}], total: 1, limit: 20, offset: 0 };
  assert.equal(listState({ ...base, loading: false, error: new ApiError(500, null) }).refresh, false);
  assert.equal(listState({ ...base, loading: false, error: null }).refresh, true);
  assert.equal(listState({ ...base, rows: [], total: 0, loading: true, error: null }).refresh, true, 'loading: Refresh shows (disabled by the screen)');
  assert.equal(listState({ ...base, rows: [], total: 0, loading: false, error: null }).refresh, true, 'empty: Refresh shows');
});

/** A sighting with one photo (an upload) and no camera video, as the queue row has it. */
const PHOTO_ONLY = Object.freeze({
  ...ROW,
  media_id: 11,
  storage_type: 'upload',
  storage_key: 'a.jpg',
  media_url: '/uploads/a.jpg',
  media_kind: 'photo',
  archive_uri: null,
  media_list: [MEDIA_TWO[0]],
});
const NO_MEDIA = Object.freeze({ ...ROW, media_id: null, storage_type: null, storage_key: null, media_url: null, media_kind: null, archive_uri: null, media_list: [] });

test('fix 9: ClipService saves a clip only for a camera video, so only then is a clip expected', () => {
  assert.equal(clipExpected(ROW), true, 'a camera video');
  assert.equal(clipExpected({ ...ROW, media_list: [{ ...ROW.media_list[0], archive_uri: null, archived: false }], archive_uri: null }), true, 'a video not saved yet');
  assert.equal(clipExpected(PHOTO_ONLY), false, 'a photo');
  assert.equal(clipExpected(NO_MEDIA), false, 'no media');
  assert.equal(clipExpected(null), false);
});

test('fix 9: clip-status "none" says "No saved clip" only where a clip was expected; a job the server ran always shows', () => {
  // AdminSightingController.clipStatus: ClipService.jobStatus (pending, done, skipped, failed) for the primary media,
  // else "done" when it is archived, else "none" (no job in this server's memory: no video, or none was ever started).
  const none = { media_id: 11, archived: false, state: 'none' };
  assert.deepEqual(clipSummary(none, true), { text: 'No saved clip', pending: false });
  assert.equal(clipSummary(none, false), null, 'a photo-only or no-media sighting has no clip to miss');
  assert.deepEqual(clipSummary({ media_id: 11, archived: false, state: 'pending' }, false), { text: 'Saving the clip…', pending: true });
  assert.deepEqual(clipSummary({ media_id: 11, archived: false, state: 'failed' }, false), { text: 'Saving the clip failed', pending: false });
  assert.deepEqual(clipSummary({ media_id: 11, archived: true, state: 'done' }, false), { text: 'Clip saved for review', pending: false });
  assert.equal(clipSummary(null, true), null);
});

test('fix 9: clipLine, the review\'s line under the media: nothing at all for a sighting that expects no clip', () => {
  const done = (value) => ({ state: 'done', value });
  assert.deepEqual(clipLine({ state: 'loading' }, ROW), { kind: 'line', text: 'Checking the clip…' });
  assert.deepEqual(clipLine({ state: 'failed', error: new Error('x') }, ROW), { kind: 'failed' });
  assert.deepEqual(clipLine(done({ media_id: 7, archived: true, state: 'done' }), ROW), { kind: 'line', text: 'Clip saved for review' });
  assert.deepEqual(clipLine(done({ media_id: 7, archived: false, state: 'none' }), ROW), { kind: 'line', text: 'No saved clip' });
  for (const s of [PHOTO_ONLY, NO_MEDIA]) {
    assert.equal(clipLine({ state: 'loading' }, s), null);
    assert.equal(clipLine({ state: 'failed', error: new Error('x') }, s), null);
    assert.equal(clipLine(done({ media_id: s.media_id, archived: false, state: 'none' }), s), null);
  }
  assert.deepEqual(clipLine(done({ media_id: 11, archived: false, state: 'pending' }), PHOTO_ONLY), { kind: 'line', text: 'Saving the clip…' }, 'a job the server ran is reported');
});

test('fix 5: the review\'s confirms carry a tone; what takes a sighting away is grave, in the design\'s ink fill', () => {
  assert.equal(CONFIRM.reject(42).tone, 'grave');
  assert.equal(CONFIRM.delete(42).tone, 'grave');
  assert.equal(CONFIRM.approveDiscard(42, 1).tone, 'grave');
  assert.equal(CONFIRM.approveDiscard(42, 2).tone, 'grave');
  assert.equal(CONFIRM.reject(42).confirm, 'Reject', 'the label names the consequence');
  assert.equal(CONFIRM.approveDiscard(42, 2).confirm, 'Approve and drop them');
  assert.equal(confirmButtonClass('grave', false), 'wb-btn wb-btn--grave');
  assert.equal(confirmButtonClass('grave', true), 'wb-btn wb-btn--grave wb-btn--busy');
  assert.equal(confirmButtonClass('action', false), 'wb-btn wb-btn--action');
  assert.equal(confirmButtonClass(undefined, false), 'wb-btn wb-btn--action', 'no tone: the plain confirm');
  for (const tone of ['grave', 'action', undefined]) assert.doesNotMatch(confirmButtonClass(tone, false), /accent/);
});

test('fix 8: the review\'s title line: the chip, the species, its sub-lines, each its own item of a flex row', () => {
  const line = titleLineNode(sightingRow(ROW));
  assert.equal(line.type, 'p');
  assert.deepEqual(classes(line), ['site-admin__title-line']);
  const items = line.children.filter(Boolean);
  assert.deepEqual(classes(items[0]), ['wb-chip', 'wb-status']);
  assert.equal(items[1].type, 'strong');
  assert.equal(text(items[1]), 'Sergeant major');
  assert.equal(text(items[2]), 'Abudefduf saxatilis');
  assert.ok(items.every((n) => typeof n === 'object'), 'no bare text between them: the row\'s gap spaces them');
  const guess = titleLineNode(sightingRow(GUESS)).children.filter(Boolean);
  assert.deepEqual(guess.map(text), ['Pending', UNIDENTIFIED, 'Visitor\'s name: Big silver fish with a yellow tail']);
});

test('fix 3a: a fact\'s value may break anywhere (an email typed as a name), by the design\'s long-text class', () => {
  const tree = factsNode({ ...ROW, volunteer_name: 'seagrass.monitoring.volunteers@pompanobeachschools.example.org' });
  const values = find(tree, (n) => n.type === 'dd');
  assert.ok(values.length > 0);
  for (const dd of values) assert.deepEqual(classes(dd), ['wb-table__long']);
  for (const dd of find(environmentNode(environmentSummary({ groups: [{ title: 'Weather', items: [{ label: 'Wind', unit: 'kn', value: 12 }] }] })), (n) => n.type === 'dd')) {
    assert.deepEqual(classes(dd), ['wb-table__long']);
  }
  // site.css is layout only (tests/styles.test.mjs forbids overflow-wrap there): the design's opt-in class does it, and
  // it is not scoped to a table, so it applies to a <dd> too.
  const design = source('node_modules/@wahoobay/design/dist/components.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(design, /(^|\n)\.wb-table__long\s*\{\s*overflow-wrap:\s*anywhere;?\s*\}/);
});

test('fix 10\'s fixed term track: a time in a list of facts breaks only between its day and its time', () => {
  assert.equal(whenText('Nov 2, 2026, 10:55 AM'), 'Nov\u00a02,\u00a02026, 10:55\u00a0AM', 'never "10:55" over "AM"');
  assert.equal(whenText('May 10, 2025'), 'May\u00a010,\u00a02025');
  assert.equal(whenText('Reef camera'), 'Reef camera', 'anything else as it is');
  assert.equal(whenText('Nov 2, 2026, 7:28 AM, 2.5 min from the sighting'), 'Nov 2, 2026, 7:28 AM, 2.5 min from the sighting');
  assert.equal(whenText(null), '');
});

test('fixes 6, 8 and 10: the layout rules in site.css', () => {
  const css = source('src/styles/site.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.site-admin__when > span\s*\{\s*display:\s*block;\s*\}/, 'the day and the time, one under the other');
  const title = css.match(/\.site-admin__title-line\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(title, /display:\s*flex/);
  assert.match(title, /flex-wrap:\s*wrap/);
  assert.match(title, /gap:\s*var\(--wb-space-3\)/, 'the chip no longer touches the name');
  const facts = css.match(/\.site-admin__facts\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(facts, /grid-template-columns:\s*10rem minmax\(0, 1fr\)/, 'one fixed term track, so Details and every Conditions group line up');
  const narrow = css.match(/@container \(max-width: 36rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(narrow, /\.site-admin__facts\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/, 'one column where the screen is narrow');
  assert.match(narrow, /\.site-admin__facts\s*\{[^}]*row-gap:\s*var\(--wb-space-1\)/, 'stacked, a value sits close under its term');
  assert.match(narrow, /\.site-admin__facts > dt:not\(:first-child\)\s*\{\s*margin-top:\s*var\(--wb-space-3\);\s*\}/, 'and the pairs stand apart');
});

// --- the islands ----------------------------------------------------------------------------------------------------

test('AdminApp registers the three screens by their route\'s screen name', () => {
  const app = source('src/islands/AdminApp.tsx');
  assert.match(app, /import Queue from '\.\/admin\/Queue'/);
  assert.match(app, /import Sightings from '\.\/admin\/Sightings'/);
  assert.match(app, /import Review from '\.\/admin\/Review'/);
  const screens = app.match(/const SCREENS[^=]*=\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(screens, /\bqueue: Queue\b/);
  assert.match(screens, /\bsightings: Sightings\b/);
  assert.match(screens, /\breview: Review\b/);
});

test('the screens: every API failure they do not show themselves goes to notify; media only through the tested VDOM', () => {
  for (const name of ['Queue', 'Sightings', 'Review']) {
    const file = `src/islands/admin/${name}.tsx`;
    const text = source(file);
    assert.match(text, /\bnotify\b/, `${file}: uses notify`);
    assert.doesNotMatch(text, /<(img|video)\b/, `${file}: no media element of its own`);
    assert.doesNotMatch(text, /accent/, `${file}: never the accent`);
    assert.doesNotMatch(text, /\bfetch\(/, `${file}: the API only through apiFetch`);
  }
  const shared = source('src/islands/admin/shared.tsx');
  assert.match(shared, /instanceof SessionExpired\)\s*notify\(/, 'a 401 while loading a list ends the session');
  assert.match(shared, /<dialog\b[^>]*className="wb-dialog"/);
  assert.match(shared, /showModal\(\)/);
  const review = source('src/islands/admin/Review.tsx');
  assert.match(review, /CONFIRM\.reject/);
  assert.match(review, /CONFIRM\.delete/);
  assert.match(source('src/islands/admin/Sightings.tsx'), /CONFIRM\.delete/);
  const sightings = source('src/islands/admin/Sightings.tsx');
  assert.match(sightings, /<h2 id="sightings-title" tabIndex=\{-1\} ref=\{heading\}>/, 'the heading can take the focus');
  assert.match(sightings, /heading\.current\?\.focus\(\)/, 'after a recycle the focus goes to the heading, not to a removed row');
  assert.match(review, /editOutcome\(/, 'the review reads the edit endpoint\'s updated');
  assert.match(review, /CONFIRM\.approveDiscard\(/, 'an approve that drops media asks first');
  assert.match(review, /if \(drops > 0\) \{\s*setConfirm\('approve'\);/, 'only then: an approve that drops nothing stays one click');
  assert.match(review, /useAnswer\(environmentRequest\(id\)\.path, token, notify, envRound\)/, 'the conditions can be asked for again');
  assert.match(review, /useAnswer\(clipStatusRequest\(id\)\.path, token, notify, clipRound, clipPending\)/, 'and the clip\'s state');
  assert.match(review, /setEnvRound\(\(n\) => n \+ 1\)/);
  assert.match(review, /setClipRound\(\(n\) => n \+ 1\)/);
});

test('finish review: the islands draw what the modules decide (title line, clip line, Refresh, the confirm\'s tone)', () => {
  const review = source('src/islands/admin/Review.tsx');
  assert.match(review, /toReact\(titleLineNode\(row\)\)/, 'fix 8: the title line is the tested one');
  assert.match(review, /clipLine\(clip, sighting\)/, 'fix 9: the clip line is the tested one');
  assert.doesNotMatch(review, /No saved clip|Checking the clip/, 'its words are the module\'s');
  const queue = source('src/islands/admin/Queue.tsx');
  assert.match(queue, /\{state\.refresh && \(\s*<div className="wb-toolbar">/, 'fix 12: no Refresh beside the error notice\'s Try again');
  const shared = source('src/islands/admin/shared.tsx');
  assert.match(shared, /className=\{confirmButtonClass\(confirm\.tone, busy\)\}/, 'fix 5: the confirm button takes its tone');
  assert.match(shared, /tone\?: 'grave' \| 'action'/);
  const actions = shared.match(/<div className="wb-dialog__actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.ok(actions.indexOf('>Cancel<') >= 0 && actions.indexOf('>Cancel<') < actions.indexOf('confirm.confirm'), 'Cancel first, so showModal() focuses it');
});
