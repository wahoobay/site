// The live camera page (/live/) and the home page's live band, step 2b (plan 7, Task 7): the pure logic of the three
// live islands (src/lib/live.mjs), the YouTube embed's address (src/lib/video.mjs), and, after `npm run build`, the
// built pages in dist/. The islands' render is renderState in src/lib/live.mjs, a small VDOM the islands hand to React,
// so its branches (live, embed, offline, not known yet) are tested here without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REEF_CAMERA,
  REEF_STILL,
  boxKey,
  boxesFor,
  isStale,
  labelFor,
  darkText,
  pollInterval,
  renderState,
  scaleBox,
  staleAfterMs,
  statusOf,
  tiles,
} from '../src/lib/live.mjs';
import { embedUrl } from '../src/lib/video.mjs';
import { groupItems } from '../src/lib/prose-groups.mjs';
import { emptyText } from '../src/lib/public-api.mjs';

const camera = (status, stream = '/stream/stream_raw.mjpeg') => ({
  cameras: [
    {
      id: 'seahivecam',
      status,
      stream_mjpeg: stream,
      snapshot: stream && '/stream/snapshot_raw.jpg',
      embed_url: 'https://www.youtube.com/embed/oBTGY6Ax870?autoplay=1&mute=1&playsinline=1',
      live: '/api/public/live?camera=seahivecam',
    },
  ],
});

/** Every node of a VDOM tree (renderState's), depth first. */
const nodes = (node) =>
  node === null || node === undefined || typeof node !== 'object'
    ? []
    : Array.isArray(node)
      ? node.flatMap(nodes)
      : [node, ...node.children.flatMap(nodes)];
const classed = (node, cls) => nodes(node).filter((n) => (n.props.className ?? '').split(/\s+/).includes(cls));
/** The text of a VDOM tree, as the browser would show it. */
const text = (node) =>
  node === null || node === undefined || node === false ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node.children.map(text).join('');

// --- statusOf, pollInterval, staleAfterMs ---------------------------------------------------------------------------

test('statusOf: the camera\'s own status; live without a stream is the embed; anything else is offline', () => {
  assert.equal(statusOf(camera('live'), 'seahivecam'), 'live');
  assert.equal(statusOf(camera('embed', null), 'seahivecam'), 'embed');
  assert.equal(statusOf(camera('offline', null), 'seahivecam'), 'offline');
  assert.equal(statusOf(camera('live', null), 'seahivecam'), 'embed', 'live but no stream to show');
  assert.equal(statusOf(camera('live'), 'pier_cam'), 'offline', 'a camera the API does not list');
  assert.equal(statusOf(camera('rebooting'), 'seahivecam'), 'offline', 'a status the site does not know');
  for (const answer of [null, undefined, {}, { cameras: null }, { cameras: 'live' }, []]) assert.equal(statusOf(answer, 'seahivecam'), 'offline');
});

test('pollInterval: detections every second while live, the status every 30 s; a frame is stale after 3 s', () => {
  assert.equal(pollInterval('live'), 1000);
  for (const status of ['embed', 'offline', null]) assert.equal(pollInterval(status), 30000);
  assert.equal(staleAfterMs, 3000);
  assert.equal(isStale(10_000, 12_999), false);
  assert.equal(isStale(10_000, 13_000), false);
  assert.equal(isStale(10_000, 13_001), true);
});

// --- the detection boxes --------------------------------------------------------------------------------------------

test('scaleBox: a frame-pixel box in percent of the rendered image, to two places', () => {
  assert.deepEqual(scaleBox([100, 50, 300, 250], { width: 1920, height: 1080 }, { width: 960, height: 540 }), {
    left: 5.21,
    top: 4.63,
    width: 10.42,
    height: 18.52,
  });
  // The stream's own shape (1280x720) in a 16:9 frame of any size: the same percentages.
  assert.deepEqual(scaleBox([640, 0, 1280, 360], { width: 1280, height: 720 }, { width: 358, height: 201.375 }), { left: 50, top: 0, width: 50, height: 50 });
  // A frame of another shape fills the 16:9 frame (object-fit: cover): the overflow is cropped evenly, so a square frame
  // in a 1600x900 frame loses 350px top and bottom.
  assert.deepEqual(scaleBox([0, 500, 100, 600], { width: 1000, height: 1000 }, { width: 1600, height: 900 }), { left: 0, top: 50, width: 10, height: 17.78 });
});

test('labelFor: the common name, else the Latin, and the confidence as a whole percentage', () => {
  assert.deepEqual(labelFor({ common: 'Sergeant Major', latin: 'Abudefduf saxatilis', confidence: 0.912 }), { name: 'Sergeant Major', small: '91%' });
  assert.deepEqual(labelFor({ common: null, latin: 'Abudefduf saxatilis', confidence: 0.5 }), { name: 'Abudefduf saxatilis', small: '50%' });
  assert.deepEqual(labelFor({ common: '', latin: 'Mugil cephalus', confidence: null }), { name: 'Mugil cephalus', small: null });
  assert.deepEqual(labelFor({ common: null, latin: null, species_id: 'Mugil cephalus', confidence: 1 }), { name: 'Mugil cephalus', small: '100%' });
});

const fish = (bbox, species = 'Abudefduf saxatilis', confidence = 0.91) => ({ bbox, confidence, species_id: species, latin: species, common: species === 'Abudefduf saxatilis' ? 'Sergeant Major' : null });
const FRAME = { width: 1280, height: 720 };
const SHOWN = { width: 960, height: 540 };

test('boxKey: the species and the box\'s centre to 2 % of the frame, so a fish that stays put keeps its box', () => {
  const key = (bbox, species) => boxKey(fish(bbox, species), scaleBox(bbox, FRAME, SHOWN));
  const still = key([100, 100, 300, 300]);
  assert.equal(key([104, 102, 304, 302]), still, 'a few pixels is the same box: no second fade-in');
  assert.notEqual(key([228, 100, 428, 300]), still, 'ten percent to the right is another box');
  assert.notEqual(key([100, 100, 300, 300], 'Mugil cephalus'), still, 'another species in the same place is another box');
});

test('boxesFor: each named fish as a box in percent with its label; the label goes inside near the top edge; keys are unique', () => {
  const boxes = boxesFor([fish([100, 300, 300, 500]), fish([640, 5, 800, 100], 'Mugil cephalus', 0.66), fish([102, 301, 302, 501])], FRAME, SHOWN, 16);
  assert.equal(boxes.length, 3);
  assert.deepEqual(boxes[0], { key: boxes[0].key, left: 7.81, top: 41.67, width: 15.63, height: 27.78, inside: false, right: false, name: 'Sergeant Major', small: '91%' });
  // 5px of 720 is 3.75px of 540: within 1.5em (24px) of the frame's top, so the label is pinned inside the box.
  assert.equal(boxes[1].inside, true);
  assert.equal(boxes[1].right, false);
  assert.equal(boxes[1].name, 'Mugil cephalus');
  assert.equal(new Set(boxes.map((b) => b.key)).size, 3, 'two fish of one species side by side get two keys');
  assert.deepEqual(boxesFor([fish([0, 0, 10, 10])], null, SHOWN, 16), [], 'no boxes before the stream has a frame');
  // Ruling 38: a box whose right edge is within 6em (96px at 16px) of the frame's right edge has its label anchored to
  // its own right edge (the design's .wb-detect--right), so the label is not cut off; at the top too it is also inside.
  const [near, far, corner] = boxesFor([fish([1000, 300, 1160, 500]), fish([900, 300, 1100, 500]), fish([1100, 4, 1280, 200])], FRAME, SHOWN, 16);
  // 1160 of 1280 is 870 of 960 px: 90px from the right edge, within 96px. 1100 is 825px: 135px away.
  assert.equal(near.right, true);
  assert.equal(far.right, false);
  assert.deepEqual([corner.inside, corner.right], [true, true]);
  // The em is the frame's: at 12px, 6em is 72px, and the 90px box is clear of it.
  assert.equal(boxesFor([fish([1000, 300, 1160, 500])], FRAME, SHOWN, 12)[0].right, false);
  assert.deepEqual(boxesFor([fish([0, 0, 10, 10])], { width: 0, height: 0 }, SHOWN, 16), []);
  assert.deepEqual(boxesFor([{ bbox: [1, 2, 3] }], FRAME, SHOWN, 16), [], 'a detection without a four-number box is skipped');
});

// --- the water tiles ------------------------------------------------------------------------------------------------

const LATEST = {
  deployment: 'wahoo_2',
  water: { ts: '2026-10-25T15:34:01+00:00', water_temp_c: 26.1, ph: 8.014, do_pct: 89.142, chlorophyll_rfu: 1.37, phycoerythrin_rfu: 0.173, turbidity_fnu: 2.789, spcond_ms_cm: 50.894 },
  weather: null,
};

test('tiles: water in °F with °C under it, pH, oxygen and turbidity; a missing reading is v: null', () => {
  assert.deepEqual(tiles(LATEST), [
    { k: 'Water', v: '79', unit: '°F', sub: '26 °C' },
    { k: 'pH', v: '8.0', unit: null, sub: null },
    { k: 'Oxygen', v: '89', unit: '%', sub: null },
    { k: 'Turbidity', v: '2.8', unit: 'FNU', sub: null },
  ]);
  const noPh = tiles({ ...LATEST, water: { ...LATEST.water, ph: null } });
  assert.equal(noPh[1].k, 'pH');
  assert.equal(noPh[1].v, null);
  assert.equal(noPh[0].v, '79', 'the other readings stay');
  for (const latest of [null, { deployment: 'wahoo_2', water: null, weather: null }]) {
    assert.deepEqual(tiles(latest).map((t) => t.v), [null, null, null, null]);
  }
});

// --- the species chart (src/lib/chart.mjs; its own tests are tests/chart.test.mjs) -----------------------

const COUNTS = {
  granularity: 'day',
  tz: 'America/New_York',
  buckets: ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'],
  series: [
    { species_id: 'Diplodus argenteus', latin: 'Diplodus argenteus', common: 'Silver Porgy', counts: [0, 115, 138, 43, 307, 148, 0] },
    { species_id: 'Ocyurus chrysurus', latin: 'Ocyurus chrysurus', common: 'Yellowtail Snapper', counts: [0, 173, 95, 55, 197, 110, 0] },
    { species_id: 'Harengula humeralis', latin: 'Harengula humeralis', common: null, counts: [0, 87, 40, 52, 166, 213, 0] },
    { species_id: 'Mugil cephalus', latin: 'Mugil cephalus', common: 'Striped Mullet', counts: [0, 4, 81, 117, 88, 40, 0] },
    { species_id: 'Chelonia mydas', latin: 'Chelonia mydas', common: 'Green Sea Turtle', counts: [0, 119, 86, 30, 4, 0, 0] },
  ],
  other: [22, 329, 182, 258, 534, 351, 0],
};

// --- renderState: the islands' render, branch by branch ------------------------------------------------------------

const PAGE = { embedId: 'oBTGY6Ax870', title: 'SeaHIVE reef camera, live stream', still: REEF_STILL, stream: 'https://staging-ai.wahoobay.net/stream/stream_raw.mjpeg' };

test('renderState offline and embed: the nocookie embed, the panels hidden; offline says Offline without a waiver, embed has no badge', () => {
  for (const status of ['offline', 'embed']) {
    const { badge, player, panels } = renderState(status, PAGE);
    const frames = nodes(player).filter((n) => n.type === 'iframe');
    assert.equal(frames.length, 1, status);
    assert.equal(frames[0].props.src, 'https://www.youtube-nocookie.com/embed/oBTGY6Ax870');
    assert.equal(frames[0].props.title, 'SeaHIVE reef camera, live stream');
    assert.equal(frames[0].props.loading, 'lazy');
    assert.doesNotMatch(frames[0].props.src, /autoplay/);
    assert.equal(classed(player, 'wb-video').length, 1);
    assert.equal(classed(player, 'wb-detect').length, 0);
    assert.equal(nodes(player).filter((n) => n.type === 'img').length, 0, 'no stream');
    assert.equal(panels.props.hidden, true, `${status}: LiveNow renders nothing`);
    assert.deepEqual(panels.children, []);
    // Ruling 56: embed is a camera with no worker whose YouTube embed plays: neither live nor off, so no badge.
    if (status === 'embed') {
      assert.equal(badge, null, 'embed: no badge');
      continue;
    }
    assert.equal(badge.props.className, 'wb-live wb-live--off');
    assert.equal(text(badge), 'Offline');
    assert.equal(badge.props['data-impeccable-ignore'], undefined, 'the offline badge does not breathe: no waiver');
  }
});

test('renderState live with no fish: the stream, no box, and the hour panel says so', () => {
  const { badge, player, panels } = renderState('live', { detections: [] });
  assert.equal(classed(player, 'wb-detect').length, 0);
  assert.ok(text(panels).includes(emptyText('hour')), emptyText('hour'));
  assert.ok(!text(panels).includes('Dark at the reef'), 'not dark: today\'s sentence');
  assert.equal(panels.props.hidden, undefined);
  assert.equal(badge.props.className, 'wb-live');
  assert.equal(badge.props['data-impeccable-ignore'], 'pulsing-dot');
  assert.equal(text(badge), 'Live');
});

test('renderState live: the MJPEG stream with an onerror, an aria-hidden overlay of boxes, each a .wb-detect with its label', () => {
  const onStreamError = () => {};
  const detections = [fish([100, 300, 300, 500]), fish([640, 5, 800, 100], 'Mugil cephalus', 0.66)];
  const { player } = renderState('live', { ...PAGE, detections, frame: FRAME, rendered: SHOWN, em: 16, onStreamError });
  const video = classed(player, 'wb-video')[0];
  const img = video.children[0];
  assert.equal(img.type, 'img');
  assert.equal(img.props.src, PAGE.stream);
  assert.equal(img.props.alt, '');
  assert.equal(img.props.onError, onStreamError, 'a stream that fails swaps to the embed');
  const overlay = video.children[1];
  assert.equal(overlay.props['aria-hidden'], 'true');
  const boxes = classed(overlay, 'wb-detect');
  assert.equal(boxes.length, 2);
  assert.deepEqual(boxes[0].props.style, { left: '7.81%', top: '41.67%', width: '15.63%', height: '27.78%' });
  assert.equal(boxes[0].props.className, 'wb-detect');
  assert.equal(boxes[1].props.className, 'wb-detect wb-detect--inside');
  assert.ok(boxes.every((b) => typeof b.props.key === 'string' && b.props.key));
  const label = boxes[0].children[0];
  assert.equal(label.props.className, 'wb-detect__label');
  assert.equal(label.children[0], 'Sergeant Major');
  assert.equal(label.children[1].type, 'small');
  assert.equal(text(label.children[1]), '91%');
});

test('renderState live while the page is hidden: the still, so the stream stops, and no boxes', () => {
  const { player } = renderState('live', { ...PAGE, detections: [fish([100, 300, 300, 500])], frame: FRAME, rendered: SHOWN, paused: true });
  const img = nodes(player).find((n) => n.type === 'img');
  assert.equal(img.props.src, REEF_STILL.src);
  assert.equal(img.props.onError, undefined);
  assert.equal(classed(player, 'wb-detect').length, 0);
});

test('renderState before the status is known: the still in the frame, no badge, the panels an empty box to observe', () => {
  const { badge, player, panels } = renderState(null, PAGE);
  assert.equal(badge, null);
  const img = nodes(player).find((n) => n.type === 'img');
  assert.equal(img.props.src, '/images/learn/wb-camera.jpg');
  assert.equal(img.props.alt, '');
  assert.equal(nodes(player).filter((n) => n.type === 'iframe').length, 0);
  assert.equal(classed(player, 'wb-detect').length, 0);
  // client:visible hydrates when the island's element is on screen, so it must have a box: empty, not hidden.
  assert.equal(panels.props.hidden, undefined);
  assert.deepEqual(panels.children, []);
});

test('renderState live: the three panels, their headings, chips with counts, four tiles with the reading\'s age, the chart', () => {
  const summary = { hours: 1, total: 9, species: [{ species_id: 'Diplodus argenteus', latin: 'Diplodus argenteus', common: 'Silver Porgy', count: 7, last_seen: '2026-10-30T15:00:00+00:00' }, { species_id: 'Mugil cephalus', latin: 'Mugil cephalus', common: null, count: 2, last_seen: '2026-10-30T15:00:00+00:00' }] };
  const now = Date.parse('2026-10-30T15:34:01+00:00');
  const { panels } = renderState('live', { summary, latest: LATEST, counts: COUNTS, chartSize: { width: 600, height: 120 }, now });
  const headings = nodes(panels).filter((n) => n.type === 'h2').map(text);
  assert.deepEqual(headings, ['Seen in the last hour', 'Water right now', 'Species this week']);
  const chips = classed(panels, 'wb-chip');
  assert.deepEqual(chips.map((c) => c.children[0]), ['Silver Porgy', 'Mugil cephalus']);
  assert.deepEqual(chips.map((c) => text(classed(c, 'wb-chip__meta')[0])), ['7', '2']);
  const tileNodes = classed(panels, 'wb-tile');
  assert.equal(tileNodes.length, 4);
  assert.deepEqual(tileNodes.map((t) => text(classed(t, 'wb-tile__k')[0])), ['Water', 'pH', 'Oxygen', 'Turbidity']);
  const water = classed(tileNodes[0], 'wb-tile__v')[0];
  assert.deepEqual(water.children.map((c) => (typeof c === 'string' ? c : [c.type, c.props.className ?? null, text(c)])), ['79', ['small', null, '°F'], ['small', 'site-live-now__sub', '26 °C']]);
  assert.deepEqual(classed(tileNodes[1], 'wb-tile__v')[0].children, ['8.0'], 'pH has no unit');
  // Each panel is the design's panel under its small title (its docs' "Seen in the last hour" specimen).
  assert.deepEqual(nodes(panels).filter((n) => n.type === 'h2').map((n) => n.props.className), ['wb-panel__title', 'wb-panel__title', 'wb-panel__title']);
  assert.equal(classed(panels, 'wb-panel').length, 3);
  assert.ok(text(panels).includes('5 days ago'), 'the reading\'s age under the tiles');
  // Ruling 50: "pH" keeps its case on the tile; the chart's caption is the panel title's duplicate, so it is for a
  // screen reader only (the figure's name).
  assert.deepEqual(tileNodes.map((t) => classed(t, 'wb-tile__k')[0].props.className), ['wb-tile__k', 'wb-tile__k wb-as-is', 'wb-tile__k', 'wb-tile__k']);
  const chart = classed(panels, 'wb-chart')[0];
  assert.equal(chart.type, 'figure');
  const caption = nodes(chart).find((n) => n.type === 'figcaption');
  assert.equal(text(caption), 'Sightings per day');
  assert.equal(caption.props.className, 'wb-sr-only');
  const svg = nodes(chart).find((n) => n.type === 'svg');
  assert.equal(svg.props.viewBox, '0 0 600 120');
  assert.equal(svg.props.role, 'img');
  assert.match(svg.props['aria-label'], /^Sightings per day, Oct 25 to Oct 31: Silver Porgy 751, Yellowtail Snapper 630, /);
  assert.ok(classed(svg, 'wb-chart__bar').length > 20);
  assert.ok(classed(svg, 'wb-chart__bar').every((b) => b.type === 'rect' && /^([1-5]|other)$/.test(b.props['data-series'])));
  assert.equal(classed(svg, 'wb-chart__axis').length, 1);
  assert.equal(classed(svg, 'wb-chart__grid').length, 1);
  const legend = classed(chart, 'wb-chart__legend')[0];
  assert.deepEqual(legend.children.map((li) => [li.props['data-series'], li.props['data-kind'], text(li)]).at(-1), ['other', 'bar', 'Other species']);
  // The page's ranking (the week's order, taken once): a later answer with the order changed keeps each species' colour.
  const ranking = ['Diplodus argenteus', 'Ocyurus chrysurus', 'Harengula humeralis', 'Mugil cephalus', 'Chelonia mydas'];
  const later = { ...COUNTS, series: [COUNTS.series[3], COUNTS.series[0], COUNTS.series[1], COUNTS.series[2], COUNTS.series[4]] };
  const again = classed(renderState('live', { counts: later, ranking, chartSize: { width: 600, height: 120 } }).panels, 'wb-chart__legend')[0];
  assert.deepEqual(again.children.map((li) => li.props['data-series']), ['4', '1', '2', '3', '5', 'other']);
  // Ruling 63: a lobby screen open for days has ranked eight; a ninth species in the week's top five keeps its name.
  const eight = [...ranking, 'Pterois volitans', 'Sparisoma viride', 'Scarus guacamaia'];
  const ninth = { ...COUNTS, series: [...COUNTS.series.slice(0, 4), { species_id: 'Caranx ruber', latin: 'Caranx ruber', common: 'Bar Jack', counts: [0, 9, 9, 9, 9, 9, 0] }] };
  const lobby = classed(renderState('live', { counts: ninth, ranking: eight, chartSize: { width: 600, height: 120 } }).panels, 'wb-chart__legend')[0];
  assert.deepEqual(lobby.children.map((li) => [li.props['data-series'], text(li)]).slice(4), [['8', 'Bar Jack'], ['other', 'Other species']]);
});

test('renderState live: empty panels say so; the chart before it is measured has its SVG to measure and nothing in it', () => {
  const { panels } = renderState('live', { summary: { hours: 1, total: 0, species: [] }, latest: { deployment: 'wahoo_2', water: null, weather: null }, counts: { ...COUNTS, series: [], other: COUNTS.other.map(() => 0) }, chartSize: { width: 600, height: 120 } });
  const words = text(panels);
  for (const kind of ['hour', 'water', 'chart']) assert.ok(words.includes(emptyText(kind)), kind);
  assert.equal(classed(panels, 'wb-chart__empty').length, 1);
  assert.equal(classed(panels, 'wb-tile').length, 0);
  const unmeasured = renderState('live', { counts: COUNTS }).panels;
  const svg = nodes(unmeasured).find((n) => n.type === 'svg');
  assert.ok(svg, 'the SVG is there to be measured');
  assert.deepEqual(svg.children, []);
});

// Ruling 54: at night the camera sees nothing, and the hour panel says why instead of "nothing seen". The camera's
// entry of GET /api/public/cameras carries `dark` (true, false, or null when its worker does not say; a missing field is
// null): only true changes the sentence, and only when the hour has no sightings.
test('renderState live: dark at the reef with nothing seen in the hour, the night sentence instead of the empty one', () => {
  const now = Date.parse('2026-10-31T02:00:00+00:00');
  const hourOf = (panels) => classed(panels, 'site-live-now__panel--hour')[0];
  const empty = { hours: 1, total: 0, species: [] };
  const dark = hourOf(renderState('live', { dark: true, summary: empty, now }).panels);
  assert.equal(text(dark), 'Seen in the last hourDark at the reef; detections resume around sunrise.');
  assert.deepEqual(dark.children.at(-1).props, { className: 'wb-caption' });
  for (const value of [false, null, undefined]) {
    assert.equal(text(hourOf(renderState('live', { dark: value, summary: empty, now }).panels)), `Seen in the last hour${emptyText('hour')}`, `dark ${value}: today's sentence`);
  }
  // Fish seen in the hour are chips, dark or not.
  const seen = { hours: 1, total: 2, species: [{ species_id: 'Mugil cephalus', latin: 'Mugil cephalus', common: null, count: 2, last_seen: '2026-10-31T01:30:00+00:00' }] };
  const chips = hourOf(renderState('live', { dark: true, summary: seen, now }).panels);
  assert.equal(classed(chips, 'wb-chip').length, 1);
  assert.ok(!text(chips).includes('Dark at the reef'));
  // The home band's compact panels say the same.
  assert.ok(text(hourOf(renderState('live', { compact: true, dark: true, summary: empty, now }).panels)).endsWith('Dark at the reef; detections resume around sunrise.'));
});

test('darkText: the night sentence, then the newest last_seen\'s age when the summary has one', () => {
  const now = Date.parse('2026-10-31T02:00:00+00:00');
  assert.equal(darkText(null, now), 'Dark at the reef; detections resume around sunrise.');
  assert.equal(darkText({ species: [] }, now), 'Dark at the reef; detections resume around sunrise.');
  const summary = { species: [{ last_seen: '2026-10-30T22:00:00+00:00' }, { last_seen: '2026-10-31T01:00:00+00:00' }, { last_seen: 'not a time' }, { last_seen: null }] };
  assert.equal(darkText(summary, now), 'Dark at the reef; detections resume around sunrise. Last seen 1 h ago.');
});

// Minor 11: the summary groups by species id and name, so one id can come twice under two names: their chips keep
// apart.
test('renderState live: two chips of one species id under two names have two keys', () => {
  const summary = { hours: 1, total: 5, species: [{ species_id: 'Caranx ruber', latin: 'Caranx ruber', common: 'Bar Jack', count: 3, last_seen: null }, { species_id: 'Caranx ruber', latin: 'Carangoides ruber', common: null, count: 2, last_seen: null }] };
  const items = nodes(renderState('live', { summary }).panels).filter((n) => n.type === 'li' && classed(n, 'wb-chip').length === 1);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].props.key, items[1].props.key);
  assert.ok(items.every((li) => li.props.key.includes('Caranx ruber')));
});

// Fix round 1 (Ruling 40): a panel whose answer has not arrived yet is left out, so a failed fetch never says
// "Nothing seen" (src/lib/live-status.mjs, mergeAnswers, says which are pending).
test('renderState live: a panel whose answer has not arrived yet is left out, not shown as empty', () => {
  const { panels } = renderState('live', { latest: LATEST, counts: COUNTS, pending: ['summary'], chartSize: { width: 600, height: 120 } });
  assert.deepEqual(nodes(panels).filter((n) => n.type === 'h2').map(text), ['Water right now', 'Species this week']);
  assert.ok(!text(panels).includes(emptyText('hour')), 'no "Nothing seen" before the hour\'s answer');
  const later = renderState('live', { summary: { species: [] }, pending: ['latest', 'counts'] }).panels;
  assert.deepEqual(nodes(later).filter((n) => n.type === 'h2').map(text), ['Seen in the last hour']);
  assert.ok(!text(later).includes(emptyText('water')) && !text(later).includes(emptyText('chart')));
});

test('renderState compact (the home band): the chips and the four tiles, h3 headings, no chart', () => {
  const summary = { hours: 1, total: 7, species: [{ species_id: 'Diplodus argenteus', latin: 'Diplodus argenteus', common: 'Silver Porgy', count: 7, last_seen: null }] };
  const { panels } = renderState('live', { compact: true, summary, latest: LATEST, counts: COUNTS });
  assert.match(panels.props.className, /\bsite-live-now--compact\b/);
  assert.equal(classed(panels, 'wb-chip').length, 1);
  // The finish review's polish: turbidity too, so the band's row of tiles has no empty slot.
  assert.deepEqual(classed(panels, 'wb-tile').map((t) => text(classed(t, 'wb-tile__k')[0])), ['Water', 'pH', 'Oxygen', 'Turbidity']);
  assert.equal(classed(panels, 'wb-chart').length, 0);
  assert.deepEqual(nodes(panels).filter((n) => /^h[1-6]$/.test(n.type)).map((n) => n.type), ['h3', 'h3']);
});

test('only the detection boxes carry a style, and only their geometry (the design\'s .wb-detect contract)', () => {
  const states = [
    renderState(null, PAGE),
    renderState('offline', PAGE),
    renderState('live', { ...PAGE, detections: [fish([100, 300, 300, 500])], frame: FRAME, rendered: SHOWN, summary: null, latest: LATEST, counts: COUNTS, chartSize: { width: 600, height: 120 } }),
    renderState('live', { ...PAGE, compact: true, latest: LATEST }),
  ];
  const styled = states.flatMap((s) => [s.badge, s.player, s.panels]).flatMap(nodes).filter((n) => 'style' in n.props);
  assert.equal(styled.length, 1);
  assert.equal(styled[0].props.className, 'wb-detect');
  assert.deepEqual(Object.keys(styled[0].props.style), ['left', 'top', 'width', 'height']);
  for (const v of Object.values(styled[0].props.style)) assert.match(v, /^\d+(\.\d+)?%$/);
  const source = readFileSync('src/lib/live.mjs', 'utf8');
  assert.equal(source.match(/\bstyle\b\s*:/g)?.length, 1, 'one style in the module');
  for (const island of ['LivePlayer', 'LiveNow', 'LiveBadge']) {
    assert.doesNotMatch(readFileSync(`src/islands/${island}.tsx`, 'utf8'), /\bstyle=\{|\.style\.|setAttribute\(['"]style/, `${island}: no style of its own`);
  }
});

test('the new words are marked for Katie', () => {
  const lib = readFileSync('src/lib/live.mjs', 'utf8');
  for (const words of ["'Seen in the last hour'", "'Water right now'", "'Species this week'", "'Offline'", "'Water'", "'Oxygen'", "'Turbidity'", "'pH'", 'Measured ', "'Dark at the reef; detections resume around sunrise.'", "'Last seen '"]) {
    const at = lib.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(lib.slice(lib.lastIndexOf('\n', lib.lastIndexOf('\n', at) - 1), at), /katie: review/, `${words} is marked`);
  }
  const page = readFileSync('src/pages/live/index.astro', 'utf8');
  for (const words of ['Plan a visit', 'SPECIES_TEXT']) {
    const at = page.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(page.slice(page.lastIndexOf('\n', page.lastIndexOf('\n', at) - 1), at), /katie: review/, `${words} is marked`);
  }
});

// The finish review's polish: the camera page's Markdown body, H2 groups of short H3 items, laid out side by side from
// 48rem and as a tight list below; site.css needs each item wrapped, and only the wrappers are new.
test('groupItems: each H2 group of two or more H3 items is wrapped, an item an H3 and what follows it, comments kept with their H3', () => {
  const html = [
    '<h2 id="a">A</h2>',
    '<h3 id="a1">A1</h3>',
    '<p>One</p>',
    '<!-- katie: review: two -->',
    '<h3 id="a2">A2</h3>',
    '<p>Two <a href="/x/">x</a>.</p>',
    '<h2 id="b">B</h2>',
    '<p>Alone</p>',
    '<p><a class="wb-btn wb-btn--action" href="/c/">C</a></p>',
    '',
  ].join('\n');
  assert.equal(
    groupItems(html),
    [
      '<div class="site-live__group"><h2 id="a">A</h2>',
      '<div class="site-live__items"><div class="site-live__item"><h3 id="a1">A1</h3>\n<p>One</p></div>',
      '<div class="site-live__item"><!-- katie: review: two -->\n<h3 id="a2">A2</h3>\n<p>Two <a href="/x/">x</a>.</p></div></div></div>',
      '<h2 id="b">B</h2>',
      '<p>Alone</p>',
      '<p><a class="wb-btn wb-btn--action" href="/c/">C</a></p>',
      '',
    ].join('\n'),
  );
  // Nothing else changes: the text is the same, with the wrappers taken out.
  const unwrap = (x) => x.replace(/<\/?div\b[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(unwrap(groupItems(html)), unwrap(html));
  assert.equal(groupItems('<p>No heading</p>'), '<p>No heading</p>');
  assert.equal(groupItems('<h2>One</h2>\n<h3>Only</h3>\n<p>item</p>'), '<h2>One</h2>\n<h3>Only</h3>\n<p>item</p>', 'one item is not a group');
});

test('/live/: the body\'s three H2 groups are grids of their H3 items, the copy unchanged, the last section as it was', () => {
  const main = live().match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  const body = main.slice(main.indexOf('<div class="wb-prose site-article__body site-live__body">'));
  assert.ok(body.length > 0, 'the live body has its class');
  const groups = [...body.matchAll(/<div class="site-live__group"><h2 id="[^"]+">([^<]+)<\/h2>\s*<div class="site-live__items">([\s\S]*?)<\/div><\/div>(?=\s*<(?:div class="site-live__group"|h2))/g)];
  assert.deepEqual(groups.map((g) => [g[1], (g[2].match(/<div class="site-live__item"><(?:!--[\s\S]*?-->\s*<)?h3\b/g) ?? []).length]), [
    ['What You’ll See', 3],
    ['Camera Features', 4],
    ['Educational Applications', 3],
  ]);
  assert.match(body, /<\/div><\/div>\s*<h2 id="ai-fish-identification">AI Fish Identification<\/h2>\s*<p>Contact us/);
  const css = read('src/styles/site.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /@media \(min-width: 48rem\)\s*\{[^}]*\.site-live__items\s*\{[^}]*grid-template-columns:/);
});

// site.css's live rules (fix round 1 of the wave): the hour panel keeps its own height beside the water's (Ruling 54);
// the home band's four tiles are two a row unless the panel is wide enough for four tiles that hold their words, a
// container query on the panel, not the viewport: from 48rem the band's column is narrower than a phone's.
const LIVE_CSS = () => read('src/styles/site.css').replace(/\/\*[\s\S]*?\*\//g, '');
test('site.css: the hour panel aligns to the start of its row', () => {
  assert.match(LIVE_CSS(), /\.site-live-now__panel--hour\s*\{\s*align-self:\s*start;\s*\}/);
});

test('site.css: the band\'s tiles are two a row, four only in a panel at least 36rem wide (4 x 8.25rem and the gaps)', () => {
  const css = LIVE_CSS();
  assert.match(css, /\.site-live-now--compact \.site-live-now__panel\s*\{\s*container-type:\s*inline-size;\s*\}/);
  assert.match(css, /@container \(min-width: 36rem\)\s*\{\s*\.site-live-now--compact \.site-live-now__tiles\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);\s*\}\s*\}/);
  // The tiles' base rule is two a row; no viewport query puts the band's tiles four across.
  assert.match(css, /\.site-live-now__tiles\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  for (const [, body] of css.matchAll(/@media[^{]*\{([\s\S]*?\})\s*\}/g)) assert.doesNotMatch(body, /--compact \.site-live-now__tiles/);
});

test('video.mjs builds the nocookie address the YouTube component and the player share', () => {
  assert.equal(embedUrl('oBTGY6Ax870'), 'https://www.youtube-nocookie.com/embed/oBTGY6Ax870');
  assert.equal(embedUrl('PLDuZ7tdc3LUCZh0F45bTNuC-LkgCVjyTG', { playlist: true }), 'https://www.youtube-nocookie.com/embed/videoseries?list=PLDuZ7tdc3LUCZh0F45bTNuC-LkgCVjyTG&rel=0');
  assert.equal(embedUrl('a b&c'), 'https://www.youtube-nocookie.com/embed/a%20b%26c');
  assert.match(readFileSync('src/components/YouTube.astro', 'utf8'), /import \{[^}]*\bembedUrl\b[^}]*\} from '\.\.\/lib\/video\.mjs'/);
});

// --- the built pages -----------------------------------------------------------------------------------------------

const AI_URL = process.env.PUBLIC_AI_URL ?? 'https://staging-ai.wahoobay.net/';
const read = (file) => readFileSync(file, 'utf8');
const decode = (s) => s.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
/** The page's islands: each one's component name, client directive, props (Astro's serialised [type, value] pairs) and place. */
const islandsOf = (html) =>
  [...html.matchAll(/<astro-island\b([^>]*)>/g)].map((m) => {
    const attr = (name) => m[1].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
    const props = Object.fromEntries(Object.entries(JSON.parse(decode(attr('props') ?? '{}'))).map(([k, [, v]]) => [k, v]));
    return { name: JSON.parse(decode(attr('opts') ?? '{}')).name, client: attr('client'), props, at: m.index };
  });
const live = () => read('dist/live/index.html');
const home = () => read('dist/index.html');

test('/live/: the Live reef nav, the h1 with the badge, the player, the lead and its button, the panels, the two cards, the body', () => {
  const html = live();
  const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  const at = (needle) => main.indexOf(needle);
  const islands = islandsOf(main);
  const by = (name) => islands.filter((i) => i.name === name);
  assert.equal(by('LiveBadge').length, 1);
  assert.equal(by('LivePlayer').length, 1);
  assert.equal(by('LiveNow').length, 1);
  const [badge] = by('LiveBadge');
  const [player] = by('LivePlayer');
  const [now] = by('LiveNow');
  assert.equal(badge.client, 'load');
  assert.deepEqual(badge.props, { camera: REEF_CAMERA });
  assert.equal(player.client, 'load');
  assert.equal(player.props.camera, 'seahivecam');
  assert.equal(player.props.ai, AI_URL, 'the build\'s PUBLIC_AI_URL');
  assert.equal(player.props.embedId, 'oBTGY6Ax870');
  assert.equal(now.client, 'visible');
  assert.equal(now.props.camera, 'seahivecam');
  assert.equal(now.props.compact, undefined);
  // Ruling 47: the player straight under the h1, so a phone's first screen has the video; the lead and its button
  // under the player, then the panels, the cards and the body. Markup order, at every width: no CSS reordering.
  const order = {
    nav: at('aria-label="Live reef"'),
    h1: at('<h1'),
    badge: badge.at,
    player: player.at,
    lead: at('<p class="wb-lead">'),
    button: at('<div class="site-actions">'),
    panels: now.at,
    species: at('<a class="wb-card" href="/live/species/"'),
    visit: at('<a class="wb-card" href="/visit/"'),
    body: at('<div class="wb-prose site-article__body site-live__body">'),
  };
  for (const [name, p] of Object.entries(order)) assert.ok(p >= 0, name);
  const names = Object.keys(order);
  assert.deepEqual([...names].sort((a, b) => order[a] - order[b]), names);
  assert.match(main.slice(order.button), /^<div class="site-actions"><a class="wb-btn wb-btn--ghost wb-btn--wrap" href="\/live\/highlights\/">Reef highlights<\/a><\/div>/);
  // The badge is beside the h1, in the title row.
  // Astro puts its island loader (an inline style and scripts) before the page's first island, here the badge.
  assert.match(main, /<div class="site-live__title">\s*<h1>[^<]+<\/h1>\s*(?:<(script|style)>[\s\S]*?<\/\1>)*<astro-island\b[^>]*LiveBadge/);
});

test('/live/highlights/ shares the layout\'s order: the nav, the h1, the video, then the lead and its button', () => {
  const main = read('dist/live/highlights/index.html').match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  const order = ['aria-label="Live reef"', '<h1', '<div class="wb-video site-video">', '<p class="wb-lead">', '<div class="site-actions">'].map((n) => main.indexOf(n));
  assert.ok(order.every((p) => p >= 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('/live/: before the status is known the player is the still in the frame; without script it is the nocookie embed', () => {
  const html = live();
  const island = html.match(/<astro-island\b[^>]*LivePlayer[^>]*>[\s\S]*?<\/astro-island>/)?.[0] ?? '';
  assert.match(island, /<div class="wb-video site-video site-live__player"><img src="\/images\/learn\/wb-camera\.jpg"[^>]*alt=""/);
  assert.doesNotMatch(island, /<iframe|wb-detect/);
  assert.match(html, /<\/astro-island><noscript><div class="wb-video site-video">\s*<iframe\b[^>]*\bsrc="https:\/\/www\.youtube-nocookie\.com\/embed\/oBTGY6Ax870"/);
  const css = read('src/styles/site.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /@media \(scripting: none\)\s*\{\s*\.site-live__player\s*\{\s*display:\s*none;\s*\}/);
});

test('/live/: the two cards lead back to light pages, in the page\'s own words', () => {
  const html = live();
  const cards = [...html.matchAll(/<a class="wb-card" href="([^"]+)">([\s\S]*?)<\/a>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(cards.map(([href]) => href), ['/live/species/', '/visit/']);
  const meta = (file) => decode(read(file).match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
  const [species, visit] = cards.map(([, body]) => [decode(body.match(/<h2>([^<]+)<\/h2>/)?.[1] ?? ''), decode(body.match(/<p>([^<]+)<\/p>/)?.[1] ?? '')]);
  assert.deepEqual(species, ['Species', meta('dist/live/species/index.html')]);
  assert.deepEqual(visit, ['Plan a visit', meta('dist/visit/index.html')]);
});

test('/live/ is dark, has no map, and no longer says "Live" before it knows', () => {
  const html = live();
  assert.match(html, /<html\b[^>]*\bdata-theme="dark"/);
  assert.doesNotMatch(html, /mapbox/i);
  assert.doesNotMatch(html, /whether or not the stream is up/);
  assert.doesNotMatch(html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '', /class="wb-live/, 'the badge is drawn once the status is known');
});

test('home: the live band carries LiveNow compact under the still and the badge island, and no second player', () => {
  const html = home();
  const band = html.match(/<section class="wb-band[^"]*" data-theme="dark"[\s\S]*?<\/section>/)?.[0] ?? '';
  const islands = islandsOf(band);
  assert.deepEqual(islands.map((i) => [i.name, i.client]), [['LiveBadge', 'load'], ['LiveNow', 'visible']]);
  assert.deepEqual(islands[0].props, { camera: 'seahivecam' });
  assert.deepEqual(islands[1].props, { camera: 'seahivecam', compact: true });
  assert.equal(islandsOf(html).filter((i) => i.name === 'LivePlayer').length, 0, 'no second player');
  assert.doesNotMatch(html, /stream_raw\.mjpeg|<iframe/);
  // The badge on the still; LiveNow after the words, which the band's grid places under the still from 48rem.
  assert.match(band, /<div class="wb-video site-band__still">\s*<img\b[^>]*>\s*(?:<(script|style)>[\s\S]*?<\/\1>)*<astro-island\b[^>]*LiveBadge[\s\S]*?<\/astro-island>\s*<\/div>/);
  assert.ok(band.indexOf('site-band__words') < islands[1].at, 'LiveNow follows the words');
  assert.doesNotMatch(band, /whether or not the stream is up/);
});
