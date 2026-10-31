// A species page's live numbers (/live/species/<slug>/, plan 7 step 2b, Task 8): the SpeciesLive island asks the
// fish-ID app for the species' profile (GET /api/public/species/{id}) and draws the three tiles, "When we see it" (the
// day's hours and the last twelve months as the design's bar charts) and the twelve most recent crops. Its render is
// renderState in src/lib/species-live.mjs, a small VDOM the island hands to React, so its three states (not loaded
// yet, loaded, failed) are tested here without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECENT_MAX, hourCounts, monthCounts, profilePath, renderState, speciesTiles } from '../src/lib/species-live.mjs';

/** Every node of a VDOM tree, depth first. */
const nodes = (node) =>
  node === null || node === undefined || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...node.children.flatMap(nodes)];
const classed = (node, cls) => nodes(node).filter((n) => (n.props.className ?? '').split(/\s+/).includes(cls));
const text = (node) => (node === null || node === undefined ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join(''));
const tileWords = (tree) => classed(tree, 'wb-tile').map((t) => [text(classed(t, 'wb-tile__k')[0]), text(classed(t, 'wb-tile__v')[0])]);

// The page's snapshot (src/data/fish.json) and the profile the island fetches, for the flat needlefish.
const SNAPSHOT = { sightings_total: 33, sightings_7d: 33, last_seen: '2026-10-30T20:22:28.955194+00:00' };
const NOW = Date.parse('2026-10-31T12:00:00Z');
const recent = (id, ts, crop = `/api/public/detections/${id}/crop.jpg`) => ({
  id,
  ts,
  camera: 'seahivecam',
  species_id: 'Ablennes hians',
  latin: 'Ablennes hians',
  common: 'Flat Needlefish',
  confidence: 0.5,
  crop,
  frame: `/api/public/detections/${id}/frame.jpg`,
});
const PROFILE = {
  species_id: 'Ablennes hians',
  latin: 'Ablennes hians',
  common: 'Flat Needlefish',
  sightings_total: 40,
  sightings_7d: 12,
  last_seen: '2026-10-31T10:00:00+00:00',
  by_hour: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 8, 3, 9, 7, 3, 0, 0, 0, 0, 0, 0, 0],
  by_month: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month, i) => ({ month, sightings: i === 11 ? 40 : 0 })),
  recent: Array.from({ length: 14 }, (_, i) => recent(200 - i, new Date(NOW - (i + 1) * 3_600_000).toISOString())),
  latest_crop: '/api/public/detections/200/crop.jpg',
};
const PAGE = { name: 'Flat Needlefish', snapshot: SNAPSHOT };

test('profilePath: the species id as one path segment (108 of the 112 ids have a space)', () => {
  assert.equal(profilePath('Ablennes hians'), '/species/Ablennes%20hians');
  assert.equal(profilePath('carangoides_ruber'), '/species/carangoides_ruber');
  assert.equal(profilePath('a/b?c#d'), '/species/a%2Fb%3Fc%23d');
});

test('speciesTiles: seen in total, last seen (a date until the island knows the time, then how long ago), this week', () => {
  assert.deepEqual(speciesTiles(SNAPSHOT, null), [
    { k: 'Seen in total', v: '33' },
    { k: 'Last seen', v: 'Oct 30' },
    { k: 'This week', v: '33' },
  ]);
  assert.deepEqual(speciesTiles(SNAPSHOT, NOW)[1], { k: 'Last seen', v: '15 h ago' });
  // The date is Wahoo Bay's: 02:00 UTC on the 31st is still the 30th in Florida.
  assert.equal(speciesTiles({ ...SNAPSHOT, last_seen: '2026-10-31T02:00:00Z' }, null)[1].v, 'Oct 30');
  assert.equal(speciesTiles({ sightings_total: 1204, sightings_7d: 0, last_seen: SNAPSHOT.last_seen }, null)[0].v, '1,204');
  assert.deepEqual(speciesTiles({ sightings_total: 0, sightings_7d: 0, last_seen: null }, null).map((t) => t.k), ['Seen in total', 'This week'], 'never seen: no Last seen tile');
});

test('renderState before the profile has loaded: the snapshot\'s numbers in the three tiles, nothing else', () => {
  const tree = renderState(null, PAGE);
  // The design's sanctioned waiver on its brand-blue tile numbers (large text, 3:1; the detector cannot resolve clamp()),
  // right after the class, as on the design's docs page: the server renders these tiles, so the detector reads them.
  for (const v of classed(tree, 'wb-tile__v')) assert.deepEqual(Object.keys(v.props), ['className', 'data-impeccable-ignore'], text(v));
  for (const v of classed(tree, 'wb-tile__v')) assert.equal(v.props['data-impeccable-ignore'], 'low-contrast');
  assert.equal(nodes(tree).filter((n) => 'data-impeccable-ignore' in n.props).length, 3, 'on the three numbers and nothing else');
  assert.equal(tree.props.className, 'site-species-live');
  assert.deepEqual(tileWords(tree), [['Seen in total', '33'], ['Last seen', 'Oct 30'], ['This week', '33']]);
  assert.equal(classed(tree, 'wb-notice').length, 0);
  assert.equal(classed(tree, 'wb-chart').length, 0);
  assert.equal(nodes(tree).filter((n) => n.type === 'img').length, 0);
});

// Review Focus 3: a failed fetch (ApiError: a 404, a 5xx, no answer) leaves the page as built and says so once.
test('renderState error: the snapshot\'s numbers stay, and the design\'s notice says so, once', () => {
  for (const data of [PAGE, { ...PAGE, profile: PROFILE, now: NOW }]) {
    const tree = renderState('error', data);
    assert.deepEqual(tileWords(tree), [['Seen in total', '33'], ['Last seen', 'Oct 30'], ['This week', '33']], 'the snapshot, not a stale profile');
    const notices = classed(tree, 'wb-notice');
    assert.equal(notices.length, 1, 'one notice');
    assert.equal(notices[0].props.role, 'status');
    assert.match(text(notices[0]), /^The latest numbers did not load\./);
    assert.ok(!classed(notices[0], 'wb-notice--error').length && !/--error/.test(notices[0].props.className), 'not the error notice: the page still works');
    assert.equal(classed(tree, 'wb-chart').length, 0, 'no charts without the profile');
    assert.equal(nodes(tree).filter((n) => n.type === 'img').length, 0, 'no crops');
  }
});

test('renderState loaded: the profile\'s numbers, "When we see it" with the hours and the months, the twelve most recent crops', () => {
  const tree = renderState('ok', { ...PAGE, profile: PROFILE, now: NOW });
  assert.deepEqual(tileWords(tree), [['Seen in total', '40'], ['Last seen', '2 h ago'], ['This week', '12']]);
  assert.equal(classed(tree, 'wb-notice').length, 0);
  assert.deepEqual(nodes(tree).filter((n) => n.type === 'h2').map(text), ['When we see it', 'Recent sightings']);
  const charts = classed(tree, 'wb-chart');
  assert.deepEqual(charts.map((c) => text(c.children[0])), ['By hour of day', 'By month']);
  assert.match(nodes(charts[0]).find((n) => n.type === 'svg').props['aria-label'], /^By hour of day, 12 am to 11 pm: Flat Needlefish 33$/);
  assert.match(nodes(charts[1]).find((n) => n.type === 'svg').props['aria-label'], /^By month, Nov to Oct: Flat Needlefish 40$/);
  const crops = nodes(tree).filter((n) => n.type === 'img');
  assert.equal(RECENT_MAX, 12);
  assert.equal(crops.length, 12, 'twelve of the fourteen');
  assert.deepEqual(crops.map((i) => i.props.src), PROFILE.recent.slice(0, 12).map((r) => r.crop));
  for (const img of crops) {
    assert.equal(img.props.alt, '');
    assert.equal(img.props.loading, 'lazy');
    assert.equal(typeof img.props.onError, 'function');
  }
  const captions = classed(tree, 'site-species-live__crops').flatMap((list) => nodes(list).filter((n) => n.type === 'figcaption')).map(text);
  assert.deepEqual(captions.slice(0, 3), ['1 h ago', '2 h ago', '3 h ago']);
});

test('renderState loaded: a crop that failed to load is left out; a sighting with no crop is not drawn; no crops, no section', () => {
  const failedSrc = PROFILE.recent[0].crop;
  const reported = [];
  const tree = renderState('ok', { ...PAGE, profile: PROFILE, now: NOW, failed: [failedSrc], onCropError: (src) => reported.push(src) });
  const crops = nodes(tree).filter((n) => n.type === 'img');
  assert.ok(!crops.some((i) => i.props.src === failedSrc));
  assert.equal(crops.length, 12, 'the next one takes its place');
  crops[0].props.onError();
  assert.deepEqual(reported, [crops[0].props.src], 'the island hears which one failed');
  const noCrop = { ...PROFILE, recent: [recent(1, PROFILE.last_seen, null), recent(2, PROFILE.last_seen)] };
  assert.deepEqual(nodes(renderState('ok', { ...PAGE, profile: noCrop, now: NOW })).filter((n) => n.type === 'img').map((i) => i.props.src), ['/api/public/detections/2/crop.jpg']);
  const none = renderState('ok', { ...PAGE, profile: { ...PROFILE, recent: [] }, now: NOW });
  assert.deepEqual(nodes(none).filter((n) => n.type === 'h2').map(text), ['When we see it']);
});

test('renderState loaded: a profile with no sightings draws the empty charts; a profile missing a number keeps the snapshot\'s', () => {
  const quiet = { ...PROFILE, by_hour: Array(24).fill(0), by_month: PROFILE.by_month.map((m) => ({ ...m, sightings: 0 })) };
  const tree = renderState('ok', { ...PAGE, profile: quiet, now: NOW });
  assert.equal(classed(tree, 'wb-chart__empty').length, 2);
  const partial = renderState('ok', { ...PAGE, profile: { ...PROFILE, sightings_7d: null }, now: NOW });
  assert.deepEqual(tileWords(partial)[2], ['This week', '33']);
});

test('hourCounts and monthCounts: the profile as the chart module\'s buckets and one series named as the page names it', () => {
  const hours = hourCounts(PROFILE, 'Flat Needlefish');
  assert.equal(hours.buckets.length, 24);
  assert.equal(hours.buckets[0], '00:00');
  assert.equal(hours.buckets[23], '23:00');
  assert.deepEqual(hours.series, [{ species_id: 'Ablennes hians', latin: 'Ablennes hians', common: 'Flat Needlefish', counts: PROFILE.by_hour }]);
  const months = monthCounts(PROFILE, 'Flat Needlefish');
  assert.deepEqual(months.buckets, PROFILE.by_month.map((m) => m.month));
  assert.deepEqual(months.series[0].counts, PROFILE.by_month.map((m) => m.sightings));
  assert.equal(hourCounts({}, 'x'), null, 'no by_hour: nothing to draw');
  assert.equal(monthCounts({ by_month: 'x' }, 'x'), null);
});

test('the module sets no style; its new words are marked for Katie; the island catches the failure and draws renderState', () => {
  const source = readFileSync('src/lib/species-live.mjs', 'utf8');
  assert.doesNotMatch(source, /\bstyle\b\s*:/);
  for (const words of ["'Seen in total'", "'Last seen'", "'This week'", "'When we see it'", "'By hour of day'", "'By month'", "'Recent sightings'", "'The latest numbers did not load."]) {
    const at = source.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(source.slice(source.lastIndexOf('\n', source.lastIndexOf('\n', at) - 1), at), /katie: review/, `${words} is marked`);
  }
  const island = readFileSync('src/islands/SpeciesLive.tsx', 'utf8');
  assert.match(island, /fetchJson\(profilePath\(speciesId\)/, 'it asks for the profile by its encoded id');
  assert.match(island, /\bcatch\b/, 'a failed fetch is caught');
  assert.match(island, /toReact\(renderState\(/, 'its markup is renderState\'s');
  assert.doesNotMatch(island, /\bstyle=\{|\.style\.|setAttribute\(['"]style/, 'no style of its own');
});
