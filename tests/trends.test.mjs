// The trends page (/live/trends/, plan 7 step 2b, Task 9): the species seen per day or week and the water and weather
// history, each a chart in the design's tall frame, under a range switch (Rulings 43 and 44). The TrendsCharts island's
// render is renderState in src/lib/trends.mjs, a small VDOM the island hands to React, so its states (nothing yet,
// loaded, empty, failed) are tested here without a browser; after `npm run build`, the built page in dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHART_KEYS,
  DEFAULT_RANGE,
  LATEST,
  RANGES,
  REFRESH_MS,
  countsPath,
  csvHref,
  historyPath,
  mergeRound,
  pathsOf,
  pointsOf,
  rangeOf,
  renderState,
  trendsTiles,
} from '../src/lib/trends.mjs';
import { emptyText } from '../src/lib/public-api.mjs';

/** Every node of a VDOM tree, depth first. */
const nodes = (node) =>
  node === null || node === undefined || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...node.children.flatMap(nodes)];
const classed = (node, cls) => nodes(node).filter((n) => (n.props.className ?? '').split(/\s+/).includes(cls));
const text = (node) => (node === null || node === undefined ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join(''));

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-31T12:00:00Z');
const THIRTY = rangeOf('30d');
// The 30-day history's buckets are 30 days / 200 points = 3.6 h apart.
const BUCKET = (30 * DAY) / 200;
const at = (i) => new Date(NOW - 20 * DAY + i * BUCKET).toISOString();

const COUNTS = {
  granularity: 'day',
  tz: 'America/New_York',
  buckets: ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'],
  series: [
    { species_id: 'Diplodus argenteus', latin: 'Diplodus argenteus', common: 'Silver Porgy', counts: [0, 115, 138, 43, 307, 148, 0] },
    { species_id: 'Ocyurus chrysurus', latin: 'Ocyurus chrysurus', common: 'Yellowtail Snapper', counts: [0, 173, 95, 55, 197, 110, 0] },
    { species_id: 'Harengula humeralis', latin: 'Harengula humeralis', common: 'Redear Sardine', counts: [0, 87, 40, 52, 166, 213, 0] },
    { species_id: 'Mugil cephalus', latin: 'Mugil cephalus', common: 'Striped Mullet', counts: [0, 4, 81, 117, 88, 40, 0] },
    { species_id: 'Chelonia mydas', latin: 'Chelonia mydas', common: 'Green Sea Turtle', counts: [0, 119, 86, 30, 4, 0, 0] },
    { species_id: 'Pterois volitans', latin: 'Pterois volitans', common: 'Lionfish (invasive)', counts: [0, 25, 17, 22, 77, 45, 0] },
  ],
  other: [0, 304, 165, 236, 457, 306, 0],
};
const water = (i, c, extra = {}) => ({ ts: at(i), water_temp_c: c, ph: 8.01, do_pct: 89.1, chlorophyll_rfu: 1.37, phycoerythrin_rfu: 0.17, turbidity_fnu: 2.79, spcond_ms_cm: 50.9, ...extra });
const weather = (i, c, ms, mm) => ({ ts: at(i), bar_press_hpa: 1016, wind_dir_avg_deg: 63, wind_speed_avg_ms: ms, air_temp_c: c, rel_humidity_pct: 84.6, rain_accum_mm: mm });
const HISTORY = {
  days: 30,
  // Four readings in a row, then the sonde was off for two buckets, then two more; one reading without a pH.
  water: [water(0, 27.1), water(1, 27.4), water(2, 27.8, { ph: null }), water(3, 28), water(6, 28.2), water(7, 28.1)],
  weather: [weather(0, 26, 4.1, 0), weather(1, 27.5, 5.7, 0.4), weather(2, 28, 6.2, 1.6)],
};
const LATEST_ANSWER = {
  water: { ts: '2026-10-25T15:34:01+00:00', water_temp_c: 27.735, ph: 8.014, do_pct: 89.142, turbidity_fnu: 2.789 },
  weather: { ts: '2026-10-31T11:57:00+00:00', air_temp_c: 27.2, wind_speed_avg_ms: 5.7, rain_accum_mm: 0 },
};

/** The island's store after one round that answered everything, for a range. */
const loaded = (range = THIRTY, answers = { counts: COUNTS, history: HISTORY, latest: LATEST_ANSWER }) =>
  mergeRound(
    null,
    [
      [countsPath(range), { status: 'fulfilled', value: answers.counts }],
      [historyPath(range), { status: 'fulfilled', value: answers.history }],
      [LATEST, { status: 'fulfilled', value: answers.latest }],
    ],
    NOW,
  );
const SIZES = Object.fromEntries(CHART_KEYS.map((key) => [key, key === 'species' ? { width: 900, height: 450 } : { width: 440, height: 220 }]));

const CAPTIONS = ['Species seen per day', 'Water temperature', 'pH', 'Oxygen', 'Turbidity', 'Air temperature', 'Wind speed', 'Rain gauge, accumulated (mm)'];
/** The class of each of the island's own parts, in order (Ruling 46: the switch under the tiles, above the charts). */
const parts = (tree) => tree.children.map((c) => c.props.className);

// --- the ranges and the API's paths ---------------------------------------------------------------------------------

test('the four ranges (Ruling 44): 7 days, 30 days, 1 year and All, 30 days first; the paths each one asks for', () => {
  assert.deepEqual(RANGES.map((r) => r.label), ['7 days', '30 days', '1 year', 'All']);
  assert.equal(DEFAULT_RANGE, '30d');
  assert.equal(rangeOf('nonsense'), THIRTY, 'an unknown range is the default');
  assert.deepEqual(RANGES.map(countsPath), [
    '/species/counts?days=7&granularity=day&top=6',
    '/species/counts?days=30&granularity=day&top=6',
    '/species/counts?days=365&granularity=week&top=6',
    '/species/counts?days=400&granularity=week&top=6',
  ]);
  assert.deepEqual(RANGES.map(historyPath), [
    '/environment/history?days=7&max_points=200',
    '/environment/history?days=30&max_points=200',
    '/environment/history?days=365&max_points=200',
    '/environment/history?days=800&max_points=500',
  ]);
  // The exports allow 7, 30, 90 and 365 days: the nearest window to each range.
  assert.deepEqual(RANGES.map((r) => csvHref('water_quality', r)), [
    '/api/public/exports/water_quality.csv?days=7',
    '/api/public/exports/water_quality.csv?days=30',
    '/api/public/exports/water_quality.csv?days=365',
    '/api/public/exports/water_quality.csv?days=365',
  ]);
  assert.deepEqual(pathsOf(THIRTY), [countsPath(THIRTY), historyPath(THIRTY), '/environment/latest']);
  assert.equal(REFRESH_MS, 10 * 60_000, 'every ten minutes');
});

test('pointsOf: a measure\'s readings in its unit, a gap where a bucket has no reading or the reading has no value', () => {
  const temp = pointsOf(HISTORY.water, { field: 'water_temp_c', convert: (c) => (c * 9) / 5 + 32 }, BUCKET);
  const values = temp.map((p) => (p.v === null ? null : Math.round(p.v * 100) / 100));
  assert.deepEqual(values, [80.78, 81.32, 82.04, 82.4, null, 82.76, 82.58]);
  assert.equal(temp[0].t, Date.parse(at(0)));
  const ph = pointsOf(HISTORY.water, { field: 'ph' }, BUCKET).map((p) => p.v);
  assert.deepEqual(ph, [8.01, 8.01, null, 8.01, null, 8.01, 8.01]);
  assert.deepEqual(pointsOf([], { field: 'ph' }, BUCKET), []);
  assert.deepEqual(pointsOf(null, { field: 'ph' }, BUCKET), []);
});

test('trendsTiles: water in °F with °C, pH, oxygen, turbidity, air in °F with °C, wind in mph with m/s; a missing reading is v: null', () => {
  assert.deepEqual(
    trendsTiles(LATEST_ANSWER).map((t) => [t.k, t.v, t.unit, t.sub]),
    [
      ['Water', '82', '°F', '28 °C'],
      ['pH', '8.0', null, null],
      ['Oxygen', '89', '%', null],
      ['Turbidity', '2.8', 'FNU', null],
      ['Air', '81', '°F', '27 °C'],
      ['Wind', '13', 'mph', '5.7 m/s'],
    ],
  );
  assert.ok(trendsTiles({ water: null, weather: null }).every((t) => t.v === null));
  assert.ok(trendsTiles(null).every((t) => t.v === null));
});

test('mergeRound: each answer by its path with when it came; a failed fetch keeps the last answer and says so until a round answers', () => {
  const first = loaded();
  assert.equal(first.failed, false);
  assert.equal(first.answers[LATEST], LATEST_ANSWER);
  assert.equal(first.at[historyPath(THIRTY)], NOW);
  const later = NOW + REFRESH_MS;
  const failed = mergeRound(
    first,
    [
      [countsPath(THIRTY), { status: 'rejected', reason: new Error('HTTP 503') }],
      [historyPath(THIRTY), { status: 'fulfilled', value: { days: 30, water: [], weather: [] } }],
      [LATEST, { status: 'fulfilled', value: LATEST_ANSWER }],
    ],
    later,
  );
  assert.equal(failed.failed, true);
  assert.equal(failed.answers[countsPath(THIRTY)], COUNTS, 'what was drawn is kept');
  assert.equal(failed.at[countsPath(THIRTY)], NOW);
  assert.deepEqual(failed.answers[historyPath(THIRTY)].water, [], 'an answer that came is taken');
  const healed = mergeRound(failed, [[countsPath(THIRTY), { status: 'fulfilled', value: COUNTS }]], later + REFRESH_MS);
  assert.equal(healed.failed, false);
  assert.equal(mergeRound(null, [[LATEST, { status: 'rejected', reason: new Error('x') }]], NOW).failed, true);
});

// --- renderState ----------------------------------------------------------------------------------------------------

test('renderState before any answer (the build): the range switch with 30 days pressed, no tiles, every chart frame labelled with its range', () => {
  const tree = renderState({});
  const seg = classed(tree, 'wb-seg')[0];
  assert.equal(seg.props.role, 'group');
  assert.ok(seg.props['aria-label']);
  const buttons = seg.children;
  assert.deepEqual(buttons.map(text), ['7 days', '30 days', '1 year', 'All']);
  assert.ok(buttons.every((b) => b.type === 'button' && b.props.type === 'button' && b.props.className === 'wb-seg__btn'));
  assert.deepEqual(buttons.map((b) => b.props['aria-pressed']), ['false', 'true', 'false', 'false']);
  assert.equal(classed(tree, 'wb-tile').length, 0, 'no tile before the latest reading');
  assert.equal(classed(tree, 'wb-notice').length, 0);
  assert.deepEqual(nodes(tree).filter((n) => n.type === 'h2').map(text), ['Species', 'Water', 'Weather']);
  const figures = nodes(tree).filter((n) => n.type === 'figure');
  assert.deepEqual(figures.map((f) => text(f.children[0])), CAPTIONS);
  for (const f of figures) {
    assert.equal(f.props.className, 'wb-chart wb-chart--tall');
    const svg = f.children[1];
    assert.equal(svg.type, 'svg', 'the SVG is there to measure and keeps the frame its size');
    assert.equal(svg.props['aria-label'], `${text(f.children[0])} over the last 30 days`);
    assert.deepEqual(svg.children, []);
  }
  const csv = figures.map((f) => nodes(f).find((n) => n.type === 'a'));
  assert.deepEqual(csv.map((a) => a.props.href), [
    '/api/public/exports/sightings.csv?days=30',
    ...Array(4).fill('/api/public/exports/water_quality.csv?days=30'),
    ...Array(3).fill('/api/public/exports/weather.csv?days=30'),
  ]);
  assert.ok(csv.every((a) => text(a).startsWith('CSV')));
  assert.ok(csv.every((a) => classed(a, 'wb-sr-only').length === 1), 'each link says which file it is to a screen reader');
});

test('renderState loaded: stacked bars as series 1 to 7 with a square legend, a line per measure, the tiles and their readings\' age', () => {
  const store = loaded();
  const tree = renderState({ range: '30d', ...store, sizes: SIZES });
  const [species, ...lines] = nodes(tree).filter((n) => n.type === 'figure');
  const bars = classed(species, 'wb-chart__bar');
  assert.ok(bars.length > 20);
  assert.ok(bars.every((b) => /^[1-7]$/.test(b.props['data-series'])));
  const legend = classed(species, 'wb-chart__legend')[0];
  assert.deepEqual(legend.children.map((li) => li.props['data-series']), ['1', '2', '3', '4', '5', '6', '7']);
  assert.ok(legend.children.every((li) => li.props['data-kind'] === 'bar'));
  assert.equal(text(legend.children[6]), 'Other species');
  assert.match(species.children[1].props['aria-label'], /^Species seen per day over the last 30 days: Silver Porgy 751, /);
  assert.equal(lines.length, 7);
  for (const f of lines) {
    const path = nodes(f).find((n) => n.type === 'path');
    assert.equal(path.props['data-series'], '1', text(f.children[0]));
    assert.match(path.props.d, /^M/);
    assert.match(f.children[1].props['aria-label'], /over the last 30 days: from .+ to .+$/);
    assert.equal(classed(f, 'wb-chart__axis').length, 1);
    assert.equal(classed(f, 'wb-chart__grid').length, 1);
  }
  // The water temperature's line breaks where the sonde was off.
  assert.equal(nodes(lines[0]).find((n) => n.type === 'path').props.d.match(/M/g).length, 2);
  assert.match(lines[0].children[1].props['aria-label'], /^Water temperature over the last 30 days: from 80\.78°F to 82\.76°F$/);
  const tiles = classed(tree, 'wb-tile');
  assert.deepEqual(tiles.map((t) => text(classed(t, 'wb-tile__k')[0])), ['Water', 'pH', 'Oxygen', 'Turbidity', 'Air', 'Wind']);
  assert.equal(text(classed(tiles[5], 'wb-tile__v')[0]), '13mph5.7 m/s');
  const age = classed(tree, 'site-trends__age')[0];
  assert.equal(text(age), 'Water measured 5 days ago. Weather measured 3 min ago.');
  assert.equal(classed(tree, 'wb-notice').length, 0);
  // Ruling 46: the latest readings first, then the switch, directly above the charts it changes.
  assert.deepEqual(parts(tree), ['site-trends__now', 'wb-seg site-trends__range', 'site-trends__section', 'site-trends__section', 'site-trends__section']);
});

// Fix round 1, Important 1: each measure's axis has a minimum span (pH 0.5, turbidity 1 FNU, temperatures 2 °C,
// oxygen 10 %, wind 2 m/s, rain 5 mm) and the measures that cannot be negative never go below zero.
test('renderState: a near-flat pH is a nearly flat line on distinct labels; flat zeros never put the axis below zero', () => {
  const flat = {
    days: 30,
    water: [0, 1, 2, 3].map((i) => water(i, 27.1 + i * 0.01, { ph: 8.11 + (i % 2) * 0.01, do_pct: 0, turbidity_fnu: 0 })),
    weather: [0, 1, 2].map((i) => weather(i, 26, 0, 0)),
  };
  const tree = renderState({ range: '30d', ...loaded(THIRTY, { counts: COUNTS, history: flat, latest: LATEST_ANSWER }), sizes: SIZES });
  const figures = Object.fromEntries(nodes(tree).filter((n) => n.type === 'figure').map((f) => [text(f.children[0]), f]));
  const yLabels = (f) => nodes(f).filter((n) => n.type === 'text' && n.props.textAnchor === 'end').map(text);
  const tickValues = (f) => yLabels(f).map((l) => Number(l.replace(/[^\d.-]/g, '')));
  for (const [caption, span] of [['pH', 0.5], ['Water temperature', 3.6], ['Oxygen', 10], ['Turbidity', 1], ['Air temperature', 3.6], ['Wind speed', 4.47], ['Rain gauge, accumulated (mm)', 5]]) {
    const labels = yLabels(figures[caption]);
    assert.equal(new Set(labels).size, labels.length, `${caption}: ${labels.join(', ')}`);
    const values = tickValues(figures[caption]);
    assert.ok(Math.max(...values) - Math.min(...values) >= span - 1e-9, `${caption}: the axis spans ${values.join(', ')}`);
  }
  const path = nodes(figures.pH).find((n) => n.type === 'path').props.d;
  const ys = [...path.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.05 * 220, `pH's 0.01 is ${Math.max(...ys) - Math.min(...ys)}px, not the chart's height`);
  for (const caption of ['Oxygen', 'Turbidity', 'Wind speed', 'Rain gauge, accumulated (mm)']) {
    assert.ok(tickValues(figures[caption]).every((v) => v >= 0), `${caption}: ${yLabels(figures[caption]).join(', ')}`);
  }
});

test('renderState by week: the 1-year and All charts count species per week', () => {
  for (const id of ['1y', 'all']) {
    const range = rangeOf(id);
    const tree = renderState({ range: id, ...loaded(range), sizes: SIZES });
    const seg = classed(tree, 'wb-seg')[0];
    assert.deepEqual(seg.children.map((b) => b.props['aria-pressed'] === 'true'), RANGES.map((r) => r.id === id));
    const species = nodes(tree).find((n) => n.type === 'figure');
    assert.equal(text(species.children[0]), 'Species seen per week');
    const csv = nodes(tree).filter((n) => n.type === 'a').map((a) => a.props.href);
    assert.ok(csv.every((href) => href.endsWith('.csv?days=365')), csv.join());
  }
  assert.match(nodes(renderState({ range: 'all' })).find((n) => n.type === 'svg').props['aria-label'], /^Species seen per week as far back as the record goes, up to about two years$/);
});

test('renderState empty: every chart says "No data for this period" in its frame; no tile reading says so too', () => {
  const zero = { ...COUNTS, series: COUNTS.series.map((s) => ({ ...s, counts: s.counts.map(() => 0) })), other: COUNTS.other.map(() => 0) };
  const tree = renderState({ range: '30d', ...loaded(THIRTY, { counts: zero, history: { days: 30, water: [], weather: [] }, latest: { water: null, weather: null } }), sizes: SIZES });
  const figures = nodes(tree).filter((n) => n.type === 'figure');
  assert.equal(figures.length, 8);
  for (const f of figures) {
    assert.equal(text(classed(f, 'wb-chart__empty')[0]), emptyText('chart'), text(f.children[0]));
    assert.equal(nodes(f).filter((n) => n.type === 'svg').length, 0);
    assert.ok(nodes(f).some((n) => n.type === 'a'), 'the CSV link stays');
  }
  assert.equal(classed(tree, 'wb-tile').length, 0);
  assert.ok(nodes(tree).some((n) => text(n) === emptyText('water')));
});

test('renderState failed: the design\'s notice once, and the charts already drawn stay', () => {
  const store = loaded();
  const failed = mergeRound(store, pathsOf(THIRTY).map((p) => [p, { status: 'rejected', reason: new Error('HTTP 503') }]), NOW + REFRESH_MS);
  const tree = renderState({ range: '30d', ...failed, sizes: SIZES });
  const notices = classed(tree, 'wb-notice');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].props.role, 'status');
  assert.ok(text(notices[0]).length > 10);
  assert.ok(classed(tree, 'wb-chart__bar').length > 20, 'the bars stay');
  assert.equal(nodes(tree).filter((n) => n.type === 'path').length, 7, 'the lines stay');
  assert.equal(classed(tree, 'wb-tile').length, 6, 'the tiles stay');
  assert.deepEqual(parts(tree), ['wb-notice', 'site-trends__now', 'wb-seg site-trends__range', 'site-trends__section', 'site-trends__section', 'site-trends__section'], 'the notice above all');
  // A first round that failed: the notice, and the frames as built, never "No data".
  const first = renderState({ ...mergeRound(null, pathsOf(THIRTY).map((p) => [p, { status: 'rejected', reason: new Error('x') }]), NOW) });
  assert.equal(classed(first, 'wb-notice').length, 1);
  assert.equal(classed(first, 'wb-chart__empty').length, 0);
});

test('renderState: a range button tells the island which range was chosen; the measured refs reach the SVGs', () => {
  const chosen = [];
  const refs = Object.fromEntries(CHART_KEYS.map((key) => [key, `ref:${key}`]));
  const tree = renderState({ onRange: (id) => chosen.push(id), refs });
  for (const b of classed(tree, 'wb-seg')[0].children) b.props.onClick();
  assert.deepEqual(chosen, ['7d', '30d', '1y', 'all']);
  assert.deepEqual(nodes(tree).filter((n) => n.type === 'svg').map((s) => s.props.ref), CHART_KEYS.map((key) => `ref:${key}`));
});

test('the new words are marked for Katie, and the trends render sets no style', () => {
  const lib = readFileSync('src/lib/trends.mjs', 'utf8');
  for (const words of ["'Species seen per day'", "'Species seen per week'", "'Water temperature'", "'Air temperature'", "'Wind speed'", "'Rain gauge, accumulated (mm)'", "'Chart range'", "'Air'", "'Wind'", "'Water measured '", "'Weather measured '", "'Species'", "'Weather'"]) {
    const at = lib.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(lib.slice(lib.lastIndexOf('\n', lib.lastIndexOf('\n', at) - 1), at), /katie: review/, `${words} is marked`);
  }
  assert.doesNotMatch(lib, /\bstyle\b\s*:/);
  const island = readFileSync('src/islands/TrendsCharts.tsx', 'utf8');
  assert.doesNotMatch(island, /\bstyle=\{|\.style\.|setAttribute\(['"]style/);
  assert.match(island, /poll\(/, 'refreshes on the shared poll, which waits while the page is hidden');
  assert.match(island, /REFRESH_MS/);
});

// --- the built pages -----------------------------------------------------------------------------------------------

const read = (file) => readFileSync(file, 'utf8');
const decode = (s) => s.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
const islandsOf = (html) =>
  [...html.matchAll(/<astro-island\b([^>]*)>/g)].map((m) => {
    const attr = (name) => m[1].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
    return { name: JSON.parse(decode(attr('opts') ?? '{}')).name, client: attr('client'), at: m.index };
  });
const trends = () => read('dist/live/trends/index.html');

test('/live/trends/: a light page with the Live reef nav, the h1, the lead, the island (client:visible), the closing sentence', () => {
  const html = trends();
  assert.doesNotMatch(html.match(/<html\b[^>]*>/)[0], /data-theme/, 'light');
  const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  const md = read('src/content/pages/live/trends.md');
  const title = md.match(/^title: (.+)$/m)[1];
  const description = md.match(/^description: (.+)$/m)[1];
  assert.equal(title, 'Trends and environment');
  assert.match(html, /<title>Trends and environment/);
  const islands = islandsOf(main);
  assert.deepEqual(islands.map((i) => [i.name, i.client]), [['TrendsCharts', 'visible']]);
  const order = {
    nav: main.indexOf('aria-label="Live reef"'),
    h1: main.indexOf('<h1>Trends and environment</h1>'),
    lead: main.indexOf(`<p class="wb-lead">${description}</p>`),
    island: islands[0].at,
    body: main.indexOf('<div class="wb-prose site-article__body">'),
  };
  for (const [name, p] of Object.entries(order)) assert.ok(p >= 0, name);
  assert.deepEqual(Object.keys(order).sort((a, b) => order[a] - order[b]), Object.keys(order));
  const body = main.slice(order.body);
  assert.match(body, /The <a href="\/live\/data\/">Wahoo Bay dashboard<\/a> shows the same history in Power BI, and the <a href="\/live\/downloads\/">open data<\/a> page has it as files to download\./);
  assert.match(md, /katie: review[^\n]*\n[^\n]*\/live\/downloads\//, 'the sentence is marked');
  // The Live reef navigation marks Trends, this page, current.
  const nav = main.match(/<nav class="site-subnav" aria-label="Live reef">[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.match(nav, /<a class="wb-nav__link wb-nav__link--on" href="\/live\/trends\/" aria-current="page">Trends<\/a>/);
  assert.equal(nav.match(/aria-current=/g)?.length, 1, 'Trends alone is marked');
});

test('/live/trends/: the island as built has the range switch, the figures in order with their CSV links, and no style', () => {
  const html = trends();
  const island = html.match(/<astro-island\b[^>]*TrendsCharts[\s\S]*?<\/astro-island>/)?.[0] ?? '';
  assert.match(island, /<div class="wb-seg site-trends__range" role="group" aria-label="Chart range">/);
  assert.match(island, /<button class="wb-seg__btn" type="button" aria-pressed="true">30 days<\/button>/);
  // As built (no reading yet, so no tiles), the switch is the island's first part and right above the first chart's section.
  assert.match(island, /<div class="site-trends"><div class="wb-seg site-trends__range"[^>]*>(?:<button\b[^>]*>[^<]*<\/button>){4}<\/div><section class="site-trends__section" aria-labelledby="trends-species">/);
  const captions = [...island.matchAll(/<figure class="wb-chart wb-chart--tall"><figcaption>([^<]+)<\/figcaption>/g)].map((m) => decode(m[1]));
  assert.deepEqual(captions, CAPTIONS);
  const csv = [...island.matchAll(/<a href="([^"]+)">CSV/g)].map((m) => m[1]);
  assert.equal(csv.length, 8);
  for (const href of csv) assert.match(href, /^\/api\/public\/exports\/(sightings|water_quality|weather)\.csv\?days=30$/);
  assert.doesNotMatch(island, /style=/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, 'one page at this address');
});

test('/live/data/: a line under the heading leads to the trends page', () => {
  const main = read('dist/live/data/index.html').match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  const link = main.indexOf('<a href="/live/trends/">');
  assert.ok(link > main.indexOf('<h1>') && link < main.indexOf('<section'), 'between the h1 and the first dashboard');
  assert.match(main, /The <a href="\/live\/trends\/">trends page<\/a> charts the same sensor history from the reef's own instruments\./);
  assert.match(read('src/pages/live/data/index.astro'), /katie: review[^\n]*\n[^\n]*\/live\/trends\//);
});
