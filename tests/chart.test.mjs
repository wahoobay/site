// The site's one chart module (src/lib/chart.mjs, Ruling 43): the live camera page's species chart (the week's
// sightings as stacked bars, drawn at the size the chart is shown; moved out of src/lib/live.mjs in Task 7's fix round
// 1, and tests/live.test.mjs still checks it as renderState draws it in the panels), and, from Task 9, the scales,
// ticks, lines and stacked bars the trends page draws with (tests/trends.test.mjs has that page's render).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  barRects,
  bucketLabel,
  chartModel,
  chartNode,
  formatTick,
  lineModel,
  lineNode,
  linePath,
  niceDomain,
  extendRanking,
  rankingOf,
  seriesFor,
  stackModel,
  stackNode,
  ticks,
  timeTicks,
  xScale,
  yScale,
} from '../src/lib/chart.mjs';
import { emptyText } from '../src/lib/public-api.mjs';

/** Every node of a VDOM tree, depth first. */
const nodes = (node) =>
  node === null || node === undefined || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...node.children.flatMap(nodes)];
const text = (node) => (node === null || node === undefined ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join(''));

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

test('chartModel: stacked bars per day, the five species as series 1 to 5 and the rest as "other", drawn at the measured size', () => {
  const chart = chartModel(COUNTS, { width: 600, height: 120 });
  assert.equal(chart.empty, false);
  assert.equal(chart.viewBox, '0 0 600 120', 'one unit is one CSS pixel, so the axis text keeps its token size');
  assert.deepEqual(chart.legend, [
    { series: '1', label: 'Silver Porgy' },
    { series: '2', label: 'Yellowtail Snapper' },
    { series: '3', label: 'Harengula humeralis' },
    { series: '4', label: 'Striped Mullet' },
    { series: '5', label: 'Green Sea Turtle' },
    { series: 'other', label: 'Other species' },
  ]);
  assert.deepEqual(chart.days.map((d) => d.label), ['Oct 25', 'Oct 26', 'Oct 27', 'Oct 28', 'Oct 29', 'Oct 30', 'Oct 31']);
  // No bar for a zero count; each day's bars stack from the axis up, series 1 at the bottom.
  const bars = chart.bars;
  assert.ok(bars.every((b) => b.height > 0));
  assert.deepEqual(bars.filter((b) => b.day === 0).map((b) => b.series), ['other']);
  const oct29 = bars.filter((b) => b.day === 4);
  assert.deepEqual(oct29.map((b) => b.series), ['1', '2', '3', '4', '5', 'other']);
  for (let i = 1; i < oct29.length; i++) assert.ok(Math.abs(oct29[i].y + oct29[i].height - oct29[i - 1].y) < 1e-6, 'stacked');
  assert.ok(Math.abs(oct29[0].y + oct29[0].height - chart.baseline) < 1e-6, 'from the axis');
  // The tallest day (Oct 29, 1,296) fits under the top tick, and the ticks are round numbers.
  const top = chart.ticks.at(-1);
  assert.ok(top.value >= 1296);
  assert.deepEqual(chart.ticks.map((t) => t.value), [0, top.value / 2, top.value]);
  assert.ok(oct29.at(-1).y >= top.y - 1e-6);
  assert.ok(bars.every((b) => b.x >= chart.left && b.x + b.width <= 600));
});

test('chartModel: a narrow chart labels every other day, ending on today; all zero, or nothing, is the empty chart', () => {
  const narrow = chartModel(COUNTS, { width: 260, height: 64 });
  assert.deepEqual(narrow.days.map((d) => d.label), ['Oct 25', null, 'Oct 27', null, 'Oct 29', null, 'Oct 31']);
  const zero = { ...COUNTS, series: COUNTS.series.map((s) => ({ ...s, counts: s.counts.map(() => 0) })), other: COUNTS.other.map(() => 0) };
  assert.equal(chartModel(zero, { width: 600, height: 120 }).empty, true);
  assert.equal(chartModel(null, { width: 600, height: 120 }).empty, true);
  assert.equal(chartModel({ ...COUNTS, buckets: [], series: [], other: [] }, { width: 600, height: 120 }).empty, true);
  // No "Other species" when the rest is nothing.
  const fewer = chartModel({ ...COUNTS, series: COUNTS.series.slice(0, 2), other: COUNTS.other.map(() => 0) }, { width: 600, height: 120 });
  assert.deepEqual(fewer.legend.map((l) => l.series), ['1', '2']);
});

// Ruling 50: a species keeps its colour on a page. Its series is its place in the page's ranking (the trends page's
// 30-day species order, the live page's 7-day order), taken once and reused for every chart; a species the ranking
// does not reach is folded into "Other species", which is data-series="other" everywhere.
test('seriesFor: a species\' place in the page\'s ranking, 1 to 8; past the eighth, or not ranked, "other"', () => {
  const ranking = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  assert.equal(seriesFor('a', ranking), '1');
  assert.equal(seriesFor('h', ranking), '8');
  assert.equal(seriesFor('i', ranking), 'other', 'the design has eight series colours');
  assert.equal(seriesFor('z', ranking), 'other');
  assert.equal(seriesFor('a', []), 'other');
  assert.equal(seriesFor('a', null), 'other');
});

test('rankingOf and extendRanking: a counts answer\'s species in its order; a page\'s ranking only ever grows at its end', () => {
  assert.deepEqual(rankingOf(COUNTS), ['Diplodus argenteus', 'Ocyurus chrysurus', 'Harengula humeralis', 'Mugil cephalus', 'Chelonia mydas']);
  assert.deepEqual(rankingOf(null), []);
  assert.deepEqual(rankingOf({ series: [{ species_id: 'x' }, { latin: 'Latin only' }, { common: 'No name' }, null] }), ['x', 'Latin only'], 'the id, else the Latin');
  const week = { series: [{ species_id: 'Mugil cephalus' }, { species_id: 'Pterois volitans' }, { species_id: 'Diplodus argenteus' }] };
  const page = extendRanking(rankingOf(COUNTS), week);
  assert.deepEqual(page, [...rankingOf(COUNTS), 'Pterois volitans'], 'a species already placed keeps its place');
  assert.deepEqual(extendRanking(page, week), page, 'the same answer again changes nothing');
  assert.deepEqual(extendRanking(null, COUNTS), rankingOf(COUNTS));
});

// Ruling 63: a page open for days (a lobby screen) ranks more than eight species. A new one takes the place, and so
// the colour, of the lowest-ranked species the current answer does not show; when every ranked species is shown, the
// ranking starts again from the answer.
test('extendRanking past eight: a ninth species takes the colour of the lowest-ranked one not shown; none absent, a new ranking', () => {
  const eight = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const answer = (...ids) => ({ series: ids.map((species_id) => ({ species_id })) });
  assert.deepEqual(extendRanking(eight, answer('p2', 'n9', 'p8')), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'n9', 'p8'], 'p7 is the lowest-ranked absent');
  assert.equal(seriesFor('n9', extendRanking(eight, answer('p2', 'n9', 'p8'))), '7');
  // Two new species take the two lowest-ranked absent places, in the answer's order.
  assert.deepEqual(extendRanking(eight, answer('n9', 'p1', 'n10')), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'n10', 'n9']);
  // Every ranked species shown and a new one besides: the answer's order is the new ranking.
  const all = answer('p8', 'p7', 'p6', 'p5', 'p4', 'p3', 'p2', 'p1', 'n9');
  assert.deepEqual(extendRanking(eight, all), ['p8', 'p7', 'p6', 'p5', 'p4', 'p3', 'p2', 'p1', 'n9']);
  // A ranking under eight still grows at its end.
  assert.deepEqual(extendRanking(['p1'], answer('n9')), ['p1', 'n9']);
});

test('chartModel with a page\'s ranking: the colours follow the species, not the order; one the ranking cannot colour joins "other"', () => {
  // The same species in another order: each keeps the series its place in the ranking gives it.
  const swapped = { ...COUNTS, series: [COUNTS.series[3], COUNTS.series[0]], other: COUNTS.other };
  const ranking = rankingOf(COUNTS);
  const m = chartModel(swapped, { width: 600, height: 120 }, { ranking });
  assert.deepEqual(m.legend, [{ series: '4', label: 'Striped Mullet' }, { series: '1', label: 'Silver Porgy' }, { series: 'other', label: 'Other species' }]);
  // Mullet at the bottom of each stack, as the answer orders them: the order is the answer's, the colour the species'.
  assert.deepEqual(m.bars.filter((b) => b.day === 4).map((b) => b.series), ['4', '1', 'other']);
  // Eight species placed already (Ruling 63): a ninth keeps its name, in the colour of the lowest-ranked species the
  // answer does not show (p8 here), and "Other species" is the answer's own rest.
  const full = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const ninth = { buckets: ['2026-10-30', '2026-10-31'], series: [{ species_id: 'p2', common: 'Two', counts: [1, 2] }, { species_id: 'n9', common: 'Nine', counts: [3, 4] }], other: [5, 0] };
  const named = chartModel(ninth, { width: 600, height: 120 }, { ranking: full });
  assert.deepEqual(named.legend, [{ series: '2', label: 'Two' }, { series: '8', label: 'Nine' }, { series: 'other', label: 'Other species' }]);
  assert.equal(named.bars.filter((b) => b.series === 'other').length, 1, 'the answer\'s rest alone');
  assert.match(chartNode({ counts: ninth, ranking: full }).children[1].props['aria-label'], /Nine 7/, 'named in the label too');
  // Without a ranking a chart ranks its own answer: positions, as before, and "other" for the rest.
  assert.deepEqual(chartModel(swapped, { width: 600, height: 120 }).legend.map((l) => l.series), ['1', '2', 'other']);
});

// The browser check (blocked stream, 1440): a ResizeObserver once reported the SVG at 0 wide, and the chart drew bars of
// negative width. A size with no room to plot in is a chart not measured yet.
test('chartNode: a chart measured too small to plot in is drawn as not measured yet, never with negative sizes', () => {
  for (const chartSize of [{ width: 0, height: 0 }, { width: 40, height: 64 }, { width: 300, height: 20 }]) {
    const svg = nodes(chartNode({ counts: COUNTS, chartSize })).find((n) => n.type === 'svg');
    assert.deepEqual(svg.children, [], JSON.stringify(chartSize));
    assert.equal(svg.props.viewBox, undefined);
  }
  const drawn = nodes(chartNode({ counts: COUNTS, chartSize: { width: 120, height: 64 } })).filter((n) => n.type === 'rect');
  assert.ok(drawn.length > 0 && drawn.every((r) => r.props.width > 0 && r.props.height > 0));
});

test('chartNode: the figure with its caption, the SVG to measure, and the legend; the empty chart says so in the frame', () => {
  const figure = chartNode({ counts: COUNTS });
  assert.equal(figure.type, 'figure');
  assert.equal(figure.props.className, 'wb-chart');
  assert.equal(text(figure.children[0]), 'Sightings per day');
  assert.equal(figure.children[1].type, 'svg');
  assert.equal(figure.children[2].props.className, 'wb-chart__legend');
  const empty = chartNode({ counts: null });
  assert.deepEqual(empty.children.map((c) => c.props.className ?? c.type), ['figcaption', 'wb-chart__empty']);
  assert.equal(text(empty.children[1]), emptyText('chart'));
  // Ruling 50: in a panel with its own title the caption is for a screen reader only, the figure's name; not shown.
  const panel = chartNode({ counts: COUNTS, hiddenCaption: true });
  assert.equal(panel.children[0].type, 'figcaption');
  assert.equal(panel.children[0].props.className, 'wb-sr-only');
  assert.equal(text(panel.children[0]), 'Sightings per day');
  assert.equal(chartNode({ counts: null, hiddenCaption: true }).children[0].props.className, 'wb-sr-only');
  assert.equal(figure.children[0].props.className, undefined, 'shown by default');
});

test('the chart\'s new words are marked for Katie, and it sets no style', () => {
  const source = readFileSync('src/lib/chart.mjs', 'utf8');
  for (const words of ["'Sightings per day'", "'Other species'"]) {
    const at = source.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(source.slice(source.lastIndexOf('\n', source.lastIndexOf('\n', at) - 1), at), /katie: review/, `${words} is marked`);
  }
  assert.doesNotMatch(source, /\bstyle\b\s*:/);
});

// Task 8: the species page draws its two charts with this module ("When we see it": the day's 24 hours and the last
// twelve months, GET /api/public/species/{id}'s by_hour and by_month), so a bucket can be a day, a month or an hour, and
// a chart can carry its own caption.
test('bucketLabel: a day as "Oct 25", a month as "Sep", an hour as "7 am"', () => {
  assert.equal(bucketLabel('2026-10-25'), 'Oct 25');
  assert.equal(bucketLabel('2026-09'), 'Sep');
  assert.equal(bucketLabel('2025-12'), 'Dec');
  assert.equal(bucketLabel('00:00'), '12 am');
  assert.equal(bucketLabel('07:00'), '7 am');
  assert.equal(bucketLabel('12:00'), '12 pm');
  assert.equal(bucketLabel('23:00'), '11 pm');
  assert.equal(bucketLabel('soon'), 'soon', 'anything else as it is');
});

test('chartModel and chartNode: months and hours under the axis; a caption of the chart\'s own, in its aria-label too', () => {
  const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const one = (buckets, counts) => ({ buckets, series: [{ species_id: 'Ablennes hians', latin: 'Ablennes hians', common: 'Flat Needlefish', counts }] });
  const byMonth = one(months, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 33]);
  assert.deepEqual(chartModel(byMonth, { width: 800, height: 160 }).days.map((d) => d.label), ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const byHour = one(hours, [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 8, 3, 9, 7, 3, 0, 0, 0, 0, 0, 0, 0]);
  const labels = chartModel(byHour, { width: 600, height: 120 }).days.map((d) => d.label).filter(Boolean);
  assert.equal(labels.at(-1), '11 pm', 'the last hour labelled, as the last day is');
  assert.ok(labels.every((l) => /^\d{1,2} (am|pm)$/.test(l)), labels.join());
  const figure = chartNode({ counts: byHour, caption: 'By hour of day' });
  assert.equal(text(figure.children[0]), 'By hour of day');
  assert.match(figure.children[1].props['aria-label'], /^By hour of day, 12 am to 11 pm: Flat Needlefish 33$/);
  assert.equal(text(chartNode({ counts: null, caption: 'By month' }).children[0]), 'By month', 'the empty chart keeps its caption');
  assert.equal(text(chartNode({ counts: COUNTS }).children[0]), 'Sightings per day', 'the live page\'s chart is unchanged');
});

// --- Task 9: the trends page's maths (Ruling 43) -------------------------------------------------------------------

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≈ ${b}`);

test('niceDomain: the values\' extent rounded out to a nice step; from zero when asked; a flat line still has room', () => {
  assert.deepEqual(niceDomain([26.1, 27.9]), [26, 28]);
  assert.deepEqual(niceDomain([27.9, 26.1, null, 27]), [26, 28], 'any order; a missing value is left out');
  assert.deepEqual(niceDomain([3, 97]), [0, 100]);
  assert.deepEqual(niceDomain([2.2, 3.1], { zero: true }), [0, 4]);
  assert.deepEqual(niceDomain([0, 0], { zero: true }), [0, 1], 'no rain at all is still a chart from 0');
  const flat = niceDomain([8, 8, 8]);
  assert.ok(flat[0] < 8 && flat[1] > 8, `a flat pH has room above and below: ${flat}`);
  assert.equal(niceDomain([]), null);
  assert.equal(niceDomain([null, Number.NaN]), null);
});

// Fix round 1, Important 1: a near-flat series filled the chart's height and repeated its axis labels.
test('niceDomain: at least `minSpan` wide around the values; never below `floor`', () => {
  assert.deepEqual(niceDomain([8.11, 8.12], { minSpan: 0.5 }), [7.8, 8.4], 'a 0.01 change in pH no longer fills the chart');
  for (const [values, options] of [[[8.11, 8.12], { minSpan: 0.5 }], [[95, 98], { minSpan: 10, floor: 0 }], [[81.2, 81.3], { minSpan: 3.6 }]]) {
    const [lo, hi] = niceDomain(values, options);
    assert.ok(hi - lo >= options.minSpan, `${values}: ${lo}..${hi}`);
    assert.ok(lo <= Math.min(...values) && hi >= Math.max(...values), `${values}: ${lo}..${hi} holds them`);
  }
  assert.deepEqual(niceDomain([26.1, 27.9], { minSpan: 0.5 }), [26, 28], 'a wider series is as it was');
  // Oxygen, turbidity, wind, rain and counts cannot be negative.
  assert.equal(niceDomain([0, 0], { floor: 0 })[0], 0, 'not [-1, 1]');
  assert.deepEqual(niceDomain([0.2, 0.4], { minSpan: 1, floor: 0 }), [0, 1], 'the span moves up off the floor');
  assert.ok(niceDomain([0.4, 0.5], { floor: 0 })[0] >= 0);
});

test('formatTick with the axis\' step: as many places as the step has, so no two labels are the same', () => {
  assert.equal(formatTick(8.112, '', 0.002), '8.112');
  assert.equal(formatTick(8.11, '', 0.002), '8.11');
  assert.equal(formatTick(26.5, '°F', 0.5), '26.5°F');
  assert.equal(formatTick(80, '°F', 1), '80°F');
  assert.equal(formatTick(1500, '', 500), '1,500');
  assert.equal(formatTick(0.0004, '', 0.0001), '0.0004');
  // A near-flat pH without a minimum span: every tick has a label of its own.
  const flat = lineModel({ points: [{ t: NOW - 2 * DAY, v: 8.11 }, { t: NOW - DAY, v: 8.12 }], domain: [NOW - 7 * DAY, NOW] }, { width: 600, height: 300 });
  const labels = flat.ticks.map((t) => t.label);
  assert.ok(labels.length >= 3, labels.join());
  assert.equal(new Set(labels).size, labels.length, `no repeated label: ${labels.join(', ')}`);
});

test('lineModel with a minimum span: a 0.01 change in pH is a nearly flat line, on ticks a tenth or more apart', () => {
  const ph = lineModel({ points: [{ t: NOW - 2 * DAY, v: 8.11 }, { t: NOW - DAY, v: 8.12 }], domain: [NOW - 7 * DAY, NOW], minSpan: 0.5 }, { width: 600, height: 300 });
  const ys = [...ph.d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.05 * 270, `the line rises ${Math.max(...ys) - Math.min(...ys)}px`);
  assert.ok(ph.ticks.slice(1).every((t, i) => t.value - ph.ticks[i].value >= 0.1 - 1e-9), ph.ticks.map((t) => t.value).join());
  const empty = lineModel({ points: [{ t: NOW - DAY, v: 0 }, { t: NOW, v: 0 }], domain: [NOW - 7 * DAY, NOW], floor: 0 }, { width: 600, height: 300 });
  assert.ok(empty.ticks.every((t) => t.value >= 0), empty.ticks.map((t) => t.value).join());
});

test('ticks: evenly spaced round values from the domain\'s low end to its high end', () => {
  assert.deepEqual(ticks([26, 28], 4), [26, 26.5, 27, 27.5, 28]);
  assert.deepEqual(ticks([0, 100]), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(ticks([0, 1500]), [0, 500, 1000, 1500]);
  assert.deepEqual(ticks([7.6, 8.4]), [7.6, 7.8, 8, 8.2, 8.4], 'no floating-point dust: 7.8, not 7.800000000000001');
  for (const [lo, hi] of [[26, 28], [0, 100], [0, 7], [0.1, 0.9]]) {
    const t = ticks([lo, hi]);
    const steps = t.slice(1).map((v, i) => v - t[i]);
    assert.ok(steps.every((s) => Math.abs(s - steps[0]) < 1e-9), `${lo}..${hi}: evenly spaced`);
    assert.ok(t[0] >= lo && t.at(-1) <= hi, `${lo}..${hi}: inside the domain`);
  }
});

test('xScale and yScale: the times across the width, from `left`; the domain up the height, from `top`, high values on top', () => {
  const xs = xScale([1000, 3000, 2000], 200, 40);
  near(xs(1000), 40);
  near(xs(2000), 140);
  near(xs(3000), 240);
  near(xScale([0, 10], 100)(5), 50, 'left defaults to 0');
  const ys = yScale([26, 28], 100, 8);
  near(ys(28), 8);
  near(ys(26), 108);
  near(ys(27), 58);
});

test('linePath: an SVG path through the points; nothing for no points; a gap where a value is missing', () => {
  const id = (v) => v;
  assert.equal(linePath([], id, id), '');
  assert.equal(linePath([{ t: 0, v: null }], id, id), '');
  assert.equal(linePath([{ t: 0, v: 10 }, { t: 10, v: 5 }, { t: 20, v: 0 }], id, id), 'M0 10L10 5L20 0');
  // A missing reading breaks the line: two runs, the second starting with a move.
  assert.equal(linePath([{ t: 0, v: 10 }, { t: 10, v: 5 }, { t: 20, v: null }, { t: 30, v: 0 }, { t: 40, v: 5 }], id, id), 'M0 10L10 5M30 0L40 5');
  // A reading alone between two gaps is a dot (a zero-length segment, which the round line cap draws).
  assert.equal(linePath([{ t: 0, v: null }, { t: 10, v: 5 }, { t: 20, v: null }], id, id), 'M10 5h0');
  // Coordinates to a tenth of a pixel.
  assert.equal(linePath([{ t: 0, v: 1 / 3 }, { t: 1, v: 2 / 3 }], (t) => t * 100.04, (v) => v * 10), 'M0 3.3L100 6.7');
});

test('barRects: each bucket\'s series stacked from the axis, series 1 at the bottom, no bar for a zero', () => {
  const xs = xScale([0, 2], 200, 40); // two buckets, 100px each
  const ys = yScale([0, 10], 100, 0);
  const rects = barRects(
    [
      { series: '1', counts: [4, 0] },
      { series: '2', counts: [3, 5] },
    ],
    ['2026-10-03', '2026-10-04'],
    xs,
    ys,
  );
  assert.deepEqual(rects.map((r) => [r.bucket, r.series]), [[0, '1'], [0, '2'], [1, '2']]);
  const [a, b, c] = rects;
  near(a.y + a.height, 100, 'the first from the axis');
  near(a.height, 40);
  near(b.y + b.height, a.y, 'the second on top of the first');
  near(b.height, 30);
  near(c.y + c.height, 100, 'a bucket whose series 1 is zero starts series 2 at the axis');
  assert.ok(rects.every((r) => r.width > 0 && r.width <= 48), 'bars at most 48px wide');
  near(a.x + a.width / 2, 90, 'centred in its bucket');
  near(c.x + c.width / 2, 190);
});

test('formatTick: the number as the axis shows it, with its unit', () => {
  assert.equal(formatTick(26.5, '°F'), '26.5°F');
  assert.equal(formatTick(90, '%'), '90%');
  assert.equal(formatTick(12, 'mph'), '12 mph');
  assert.equal(formatTick(2.5, 'FNU'), '2.5 FNU');
  assert.equal(formatTick(8.1, ''), '8.1');
  assert.equal(formatTick(1500), '1,500');
  assert.equal(formatTick(0.30000000000000004), '0.3');
  assert.equal(formatTick(-0), '0');
});

// Fix round 1: "Week of Oct 3" never reached the page (week axes are labelled by month), so it went.
test('bucketLabel with a granularity: a day as "Oct 3", a month with its year', () => {
  assert.equal(bucketLabel('2026-10-03', 'day'), 'Oct 3');
  assert.equal(bucketLabel('2026-10-03', 'month'), 'Oct 2026');
  assert.equal(bucketLabel('2025-12', 'month'), 'Dec 2025');
  assert.equal(bucketLabel('2026-09'), 'Sep', 'without one, as Task 8\'s species page reads it');
});

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-31T12:00:00Z');

test('timeTicks: days at Wahoo Bay\'s midnight while they fit, then weeks, then months, each label with room', () => {
  // Seven days across 600px: a tick each day, at midnight in Florida (04:00Z in October, daylight time).
  const week = timeTicks([NOW - 7 * DAY, NOW], 600);
  assert.deepEqual(week.map((t) => t.label), ['Oct 25', 'Oct 26', 'Oct 27', 'Oct 28', 'Oct 29', 'Oct 30', 'Oct 31']);
  assert.equal(new Date(week[0].t).toISOString(), '2026-10-25T04:00:00.000Z');
  // The same week across 200px: fewer, still whole days, still a day apart or more.
  const narrow = timeTicks([NOW - 7 * DAY, NOW], 200);
  assert.ok(narrow.length >= 2 && narrow.length < 7, narrow.map((t) => t.label).join());
  assert.ok(narrow.every((t) => new Date(t.t).getUTCHours() === 4));
  // A year across 300px: months, with their year, a quarter apart (Jan, Apr, Jul, Oct).
  const year = timeTicks([NOW - 365 * DAY, NOW], 300);
  assert.deepEqual(year.map((t) => t.label), ['Jan 2026', 'Apr 2026', 'Jul 2026', 'Oct 2026']);
  assert.equal(new Date(year[0].t).toISOString(), '2026-01-01T05:00:00.000Z', 'midnight in Florida, standard time');
  // Ten days across 260px: every third day rather than one Monday alone.
  assert.ok(timeTicks([NOW - 10 * DAY, NOW], 260).length >= 3);
  assert.deepEqual(timeTicks([NOW, NOW], 300), []);
});

// The water temperature over a week, °F: two readings, a gap (the sensor was off), two more.
const WATER_POINTS = [
  { t: NOW - 6 * DAY, v: 80.1 },
  { t: NOW - 5 * DAY, v: 81.4 },
  { t: NOW - 4.5 * DAY, v: null },
  { t: NOW - 2 * DAY, v: 82.9 },
  { t: NOW - DAY, v: 82.2 },
];
const LINE = { points: WATER_POINTS, domain: [NOW - 7 * DAY, NOW], unit: '°F' };

test('lineModel: the readings as one path at the measured size, round ticks with the unit on the top one, days under the axis', () => {
  const m = lineModel(LINE, { width: 600, height: 300 });
  assert.equal(m.empty, false);
  assert.equal(m.viewBox, '0 0 600 300', 'one unit is one CSS pixel');
  assert.match(m.d, /^M[\d.]+ [\d.]+L[\d.]+ [\d.]+M[\d.]+ [\d.]+L[\d.]+ [\d.]+$/, 'two runs: the gap is kept');
  assert.deepEqual(m.ticks.map((t) => t.value), [80, 81, 82, 83]);
  assert.deepEqual(m.ticks.map((t) => t.label), ['80', '81', '82', '83°F']);
  assert.ok(m.ticks.every((t, i) => i === 0 || t.y < m.ticks[i - 1].y), 'higher values higher up');
  near(m.baseline, m.ticks[0].y, 'the axis at the domain\'s low end');
  assert.ok(m.left >= 30 && m.left < 80, `room for "83°F": ${m.left}`);
  assert.equal(m.times.length, 7);
  assert.ok(m.times.every((t) => t.x > m.left && t.x < 600));
  assert.equal(lineModel({ ...LINE, points: [] }, { width: 600, height: 300 }).empty, true);
  assert.equal(lineModel({ ...LINE, points: [{ t: NOW, v: null }] }, { width: 600, height: 300 }).empty, true);
  assert.deepEqual(lineModel({ ...LINE, zero: true, unit: 'mm' }, { width: 600, height: 300 }).ticks[0].value, 0, 'from zero when asked');
});

test('lineNode: a tall chart frame with its caption, the line as a path of series 1 with axes and grid, the label and the link after', () => {
  const link = { type: 'a', props: { href: '/x.csv' }, children: ['CSV'] };
  const figure = lineNode({ ...LINE, caption: 'Water temperature', label: 'Water temperature over the last 7 days', size: { width: 600, height: 300 }, after: link });
  assert.equal(figure.type, 'figure');
  assert.equal(figure.props.className, 'wb-chart wb-chart--tall');
  assert.equal(text(figure.children[0]), 'Water temperature');
  const svg = figure.children[1];
  assert.equal(svg.type, 'svg');
  assert.equal(svg.props.role, 'img');
  assert.match(svg.props['aria-label'], /^Water temperature over the last 7 days: from 80\.1°F to 82\.9°F$/);
  const path = nodes(svg).find((n) => n.type === 'path' && n.props['data-series']);
  assert.equal(path.props['data-series'], '1');
  assert.ok(path.props.d.startsWith('M'));
  assert.equal(nodes(svg).filter((n) => n.props.className === 'wb-chart__grid').length, 1);
  const axis = nodes(svg).find((n) => n.props.className === 'wb-chart__axis');
  assert.deepEqual(nodes(axis).filter((n) => n.type === 'text').map(text).slice(0, 4), ['80', '81', '82', '83°F']);
  assert.equal(figure.children.at(-1), link);
  // Not measured yet: the SVG to measure, with nothing in it, its label already saying what the line does.
  const unmeasured = lineNode({ ...LINE, caption: 'Water temperature', label: 'Water temperature over the last 7 days' });
  assert.deepEqual(unmeasured.children[1].children, []);
  assert.match(unmeasured.children[1].props['aria-label'], /: from 80\.1°F to 82\.9°F$/);
  // Before the answer has arrived (no points at all): the SVG to measure, labelled with the range only.
  const before = lineNode({ ...LINE, points: undefined, caption: 'Water temperature', label: 'Water temperature over the last 7 days' });
  assert.deepEqual(before.children[1].children, []);
  assert.equal(before.children[1].props['aria-label'], 'Water temperature over the last 7 days');
  // Nothing to draw: the design's empty sentence in the frame, the caption and the link kept.
  const empty = lineNode({ ...LINE, points: [], caption: 'Water temperature', label: 'x', size: { width: 600, height: 300 }, after: link });
  assert.deepEqual(empty.children.map((c) => c.props.className ?? c.type), ['figcaption', 'wb-chart__empty', 'a']);
  assert.equal(text(empty.children[1]), emptyText('chart'));
  // Ruling 50: "pH" keeps its case, against the caption's capitals (the design's .wb-as-is), in every state.
  for (const points of [LINE.points, undefined, []]) {
    const ph = lineNode({ ...LINE, points, caption: 'pH', asIs: true, label: 'pH over the last 7 days', size: { width: 600, height: 300 } });
    assert.equal(ph.children[0].props.className, 'wb-as-is');
  }
  assert.equal(figure.children[0].props.className, undefined);
});

const TOP6 = {
  ...COUNTS,
  series: [...COUNTS.series, { species_id: 'Pterois volitans', latin: 'Pterois volitans', common: 'Lionfish (invasive)', counts: [0, 25, 17, 22, 77, 45, 0] }],
};

test('stackModel: the six species most seen as series 1 to 6 and the rest as "other", round ticks from zero, days labelled', () => {
  const m = stackModel(TOP6, { width: 600, height: 300 }, { granularity: 'day' });
  assert.equal(m.empty, false);
  assert.deepEqual(m.legend.map((l) => l.series), ['1', '2', '3', '4', '5', '6', 'other']);
  assert.deepEqual(m.legend.map((l) => l.label).slice(5), ['Lionfish (invasive)', 'Other species']);
  assert.ok(m.bars.every((b) => /^([1-6]|other)$/.test(b.series) && b.height > 0));
  assert.equal(m.ticks[0].value, 0);
  assert.ok(m.ticks.every((t) => Number.isInteger(t.value)), 'whole sightings');
  assert.ok(m.ticks.at(-1).value >= 1296 + 77, 'the tallest day under the top tick');
  assert.deepEqual(m.days.filter((d) => d.label).map((d) => d.label), ['Oct 25', 'Oct 26', 'Oct 27', 'Oct 28', 'Oct 29', 'Oct 30', 'Oct 31']);
  assert.equal(stackModel(null, { width: 600, height: 300 }).empty, true);
  // Small counts still get whole-number ticks.
  const one = { buckets: ['2026-10-30', '2026-10-31'], series: [{ species_id: 'a', latin: 'a', common: 'A', counts: [1, 0] }], other: [0, 0] };
  assert.deepEqual(stackModel(one, { width: 600, height: 300 }).ticks.map((t) => t.value), [0, 1]);
});

test('stackModel on a phone: thirty days at 324px label every few days, ending on the last, which stays in the frame', () => {
  const buckets = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, 2 + i)).toISOString().slice(0, 10));
  const daily = { buckets, series: [{ species_id: 'a', latin: 'a', common: 'A', counts: buckets.map((_, i) => (i > 22 ? 300 + i : 0)) }], other: buckets.map(() => 0) };
  const m = stackModel(daily, { width: 324, height: 162 }, { granularity: 'day' });
  const labelled = m.days.filter((d) => d.label);
  assert.equal(labelled.at(-1).label, 'Oct 31', 'today is labelled');
  assert.ok(labelled.length >= 3 && labelled.length <= 6, labelled.map((d) => d.label).join());
  assert.ok(labelled.every((d) => d.x + 21 <= 324 + 8), 'inside the frame\'s padding');
  assert.ok(m.bars.every((b) => b.x + b.width <= m.right + 1e-9));
});

test('stackModel by week: the first week of each month labelled with the month and year, as many as fit', () => {
  // 53 weeks from Monday 2025-10-27 to Monday 2026-10-26.
  const buckets = Array.from({ length: 53 }, (_, i) => new Date(Date.UTC(2025, 9, 27 + 7 * i)).toISOString().slice(0, 10));
  const weekly = { buckets, series: [{ species_id: 'a', latin: 'a', common: 'A', counts: buckets.map((_, i) => i % 5) }], other: buckets.map(() => 0) };
  const wide = stackModel(weekly, { width: 1000, height: 500 }, { granularity: 'week' }).days.filter((d) => d.label);
  assert.equal(wide[0].label, 'Nov 2025');
  assert.equal(wide.length, 12, 'every month at 1000px');
  const narrow = stackModel(weekly, { width: 320, height: 160 }, { granularity: 'week' }).days.filter((d) => d.label);
  // Fewer at 320px: months a quarter apart (January, April, July, October), none past the frame's edge.
  assert.ok(narrow.length >= 3 && narrow.length <= 4, narrow.map((d) => d.label).join());
  assert.ok(narrow.every((d) => /^(Jan|Apr|Jul|Oct) 20\d\d$/.test(d.label)), narrow.map((d) => d.label).join());
  assert.ok(narrow.every((d) => d.x - 28 >= -8 && d.x + 28 <= 328));
  const before = stackNode({ counts: undefined, caption: 'Species seen per week', span: 'over the last year' });
  assert.equal(before.children[1].props['aria-label'], 'Species seen per week over the last year', 'before the answer: the range');
});

test('stackNode: the tall frame, its caption, the bars and axes, a square legend key per series, the label stating the range', () => {
  const figure = stackNode({ counts: TOP6, granularity: 'day', caption: 'Species seen per day', span: 'over the last 7 days', size: { width: 600, height: 300 } });
  assert.equal(figure.props.className, 'wb-chart wb-chart--tall');
  assert.equal(text(figure.children[0]), 'Species seen per day');
  const svg = figure.children[1];
  assert.match(svg.props['aria-label'], /^Species seen per day over the last 7 days: Silver Porgy 751, /);
  assert.ok(nodes(svg).filter((n) => n.props.className === 'wb-chart__bar').length > 20);
  const legend = figure.children[2];
  assert.equal(legend.props.className, 'wb-chart__legend');
  assert.ok(legend.children.every((li) => li.props['data-kind'] === 'bar'));
  assert.equal(legend.children.length, 7);
  const empty = stackNode({ counts: null, caption: 'Species seen per day', span: 'over the last 7 days', size: { width: 600, height: 300 } });
  assert.equal(text(empty.children[1]), emptyText('chart'));
  const before = stackNode({ counts: TOP6, caption: 'Species seen per day', span: 'over the last 7 days' });
  assert.deepEqual(before.children[1].children, [], 'not measured yet');
});

test('the chart module sets no style, and draws only with the design\'s chart classes', () => {
  const source = readFileSync('src/lib/chart.mjs', 'utf8');
  assert.doesNotMatch(source, /\bstyle\b\s*:/);
  assert.doesNotMatch(source, /Week of|LABEL_ROOM/, 'no words no visitor sees; one label-room rule');
  const classes = [...source.matchAll(/className: '([^']+)'/g)].flatMap((m) => m[1].split(' '));
  // The design's chart classes, its hidden-text utility for a panel chart's caption, and .wb-as-is for "pH".
  assert.ok(classes.every((c) => c.startsWith('wb-chart') || c === 'wb-sr-only' || c === 'wb-as-is'), classes.join());
});
