// The species chart of the live camera page (src/lib/live-chart.mjs): the week's sightings as stacked bars, drawn at
// the size the chart is shown. Moved out of src/lib/live.mjs in fix round 1; the behaviour is unchanged, and
// tests/live.test.mjs still checks the chart as renderState draws it in the panels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartModel, chartNode } from '../src/lib/live-chart.mjs';
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

test('chartModel: stacked bars per day, the five species as series 1 to 5 and the rest as 6, drawn at the measured size', () => {
  const chart = chartModel(COUNTS, { width: 600, height: 120 });
  assert.equal(chart.empty, false);
  assert.equal(chart.viewBox, '0 0 600 120', 'one unit is one CSS pixel, so the axis text keeps its token size');
  assert.deepEqual(chart.legend, [
    { series: '1', label: 'Silver Porgy' },
    { series: '2', label: 'Yellowtail Snapper' },
    { series: '3', label: 'Harengula humeralis' },
    { series: '4', label: 'Striped Mullet' },
    { series: '5', label: 'Green Sea Turtle' },
    { series: '6', label: 'Other species' },
  ]);
  assert.deepEqual(chart.days.map((d) => d.label), ['Oct 25', 'Oct 26', 'Oct 27', 'Oct 28', 'Oct 29', 'Oct 30', 'Oct 31']);
  // No bar for a zero count; each day's bars stack from the axis up, series 1 at the bottom.
  const bars = chart.bars;
  assert.ok(bars.every((b) => b.height > 0));
  assert.deepEqual(bars.filter((b) => b.day === 0).map((b) => b.series), ['6']);
  const oct29 = bars.filter((b) => b.day === 4);
  assert.deepEqual(oct29.map((b) => b.series), ['1', '2', '3', '4', '5', '6']);
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
});

test('the chart\'s new words are marked for Katie, and it sets no style', () => {
  const source = readFileSync('src/lib/live-chart.mjs', 'utf8');
  for (const words of ["'Sightings per day'", "'Other species'"]) {
    const at = source.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(source.slice(source.lastIndexOf('\n', source.lastIndexOf('\n', at) - 1), at), /katie: review/, `${words} is marked`);
  }
  assert.doesNotMatch(source, /\bstyle\b\s*:/);
});
