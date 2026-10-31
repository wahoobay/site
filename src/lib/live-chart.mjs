// The live camera page's species chart (/live/, "Species this week"): the week's sightings
// (GET /api/public/species/counts?days=7&top=5) as the design's bar chart, the five species most seen as series 1 to 5
// and every other species as 6, the days' bars stacked from the axis. It is drawn in CSS pixels at the size the chart
// is shown (the island measures its SVG), so the axis text keeps its token size. Part of renderState's VDOM
// (src/lib/live.mjs); a plain module, so the tests read it without a browser (tests/live-chart.test.mjs).
import { emptyText } from './public-api.mjs';
import { h } from './vdom.mjs';

/** @typedef {import('./vdom.mjs').VNode} VNode */
/** @typedef {{ width: number, height: number }} Size */

// katie: review: the chart's caption, new words (a sighting is a fish the camera followed for at least three frames)
const SIGHTINGS_PER_DAY = 'Sightings per day';
// katie: review: new words (the chart's sixth series: every species after the five most seen)
const OTHER = 'Other species';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A bucket's date ("2026-10-25") as "Oct 25", read as a calendar date, with no time zone to shift it. */
const dayLabel = (/** @type {string} */ iso) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : iso;
};

/**
 * The week's sightings as series: the five species most seen (series 1 to 5) and every other species summed (6, when
 * there are any), each with a count per day; null when there is nothing to draw.
 * @param {any} counts GET /api/public/species/counts?days=7&top=5
 */
const chartSeries = (counts) => {
  const buckets = counts && Array.isArray(counts.buckets) ? counts.buckets.map(String) : [];
  const n = buckets.length;
  const clean = (/** @type {unknown} */ list) =>
    Array.isArray(list) && list.length === n ? list.map((v) => (typeof v === 'number' && v > 0 ? v : 0)) : buckets.map(() => 0);
  const series = (Array.isArray(counts?.series) ? counts.series : []).slice(0, 5).map((/** @type {any} */ s, /** @type {number} */ i) => ({
    series: String(i + 1),
    label: String(s.common || s.latin || s.species_id),
    counts: clean(s.counts),
  }));
  const other = clean(counts?.other);
  if (other.some((v) => v > 0)) series.push({ series: '6', label: OTHER, counts: other });
  const totals = buckets.map((_, d) => series.reduce((sum, s) => sum + s.counts[d], 0));
  const max = Math.max(0, ...totals);
  if (n === 0 || max === 0) return null;
  const legend = series.map(({ series: id, label }) => ({ series: id, label }));
  const words = series.map((s) => `${s.label} ${s.counts.reduce((a, b) => a + b, 0).toLocaleString('en-US')}`).join(', ');
  return { buckets, series, legend, max, label: `${SIGHTINGS_PER_DAY}, ${dayLabel(buckets[0])} to ${dayLabel(buckets[n - 1])}: ${words}` };
};

/** The smallest round step at least `v`: 1, 1.5, 2, 2.5, 3, 4, 5 … 10 times a power of ten, and never a fraction. */
const roundStep = (/** @type {number} */ v) => {
  const power = 10 ** Math.floor(Math.log10(v));
  const step = ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10].find((c) => c * power >= v) ?? 10) * power;
  return Number.isInteger(step) ? step : Math.ceil(step);
};

// The chart's room, in CSS pixels: the counts' labels on the left, the days' under the axis.
const PAD = { left: 44, right: 0, top: 8, bottom: 22 };
// The least room a day's label needs; narrower days are labelled every other day (or every third …), ending on today.
const LABEL_ROOM = 48;
// The least plot a measured size must leave to be drawn at all (a ResizeObserver can report an SVG at 0 wide while
// the page lays out): a smaller size is a chart not measured yet.
const MIN_PLOT = 24;
const plottable = (/** @type {Size | null | undefined} */ size) =>
  size != null && size.width - PAD.left - PAD.right >= MIN_PLOT && size.height - PAD.top - PAD.bottom >= MIN_PLOT;

/**
 * The species chart drawn at its measured size, in CSS pixels (a viewBox of the same size, so the axis text keeps its
 * token size): the days' bars stacked from the axis, series 1 at the bottom, a bar per non-zero count; round ticks on
 * the left (three where there is room, else two); the days under the axis. `empty` when there is nothing to draw.
 * @param {any} counts GET /api/public/species/counts?days=7&top=5
 * @param {Size} size the SVG's size on the page
 */
export const chartModel = (counts, { width, height }) => {
  const data = chartSeries(counts);
  if (!data) return /** @type {const} */ ({ empty: true });
  const n = data.buckets.length;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const steps = plotH >= 48 ? 2 : 1;
  const step = roundStep(data.max / steps);
  const top = step * steps;
  const y = (/** @type {number} */ v) => PAD.top + plotH * (1 - v / top);
  const slot = plotW / n;
  const barW = Math.min(slot * 0.62, 48);
  const every = Math.max(1, Math.ceil(LABEL_ROOM / slot));
  const bars = data.buckets.flatMap((_, day) => {
    let below = 0;
    return data.series.flatMap((s) => {
      const v = s.counts[day];
      if (v <= 0) return [];
      const bar = { day, series: s.series, x: PAD.left + day * slot + (slot - barW) / 2, y: y(below + v), width: barW, height: y(below) - y(below + v) };
      below += v;
      return [bar];
    });
  });
  return {
    empty: /** @type {const} */ (false),
    viewBox: `0 0 ${width} ${height}`,
    left: PAD.left,
    baseline: y(0),
    right: width - PAD.right,
    bars,
    ticks: Array.from({ length: steps + 1 }, (_, i) => ({ value: i * step, y: y(i * step) })),
    days: data.buckets.map((iso, day) => ({ label: (n - 1 - day) % every === 0 ? dayLabel(iso) : null, x: PAD.left + day * slot + slot / 2 })),
    legend: data.legend,
    label: data.label,
  };
};

/**
 * The species panel's chart: the design's chart frame with its caption, the SVG (drawn once the island has measured
 * it), and the legend; the empty chart's sentence when there is nothing to draw.
 * @param {{ counts?: any, chartSize?: Size | null, chartRef?: any }} data
 * @returns {VNode}
 */
export const chartNode = (data) => {
  const series = chartSeries(data.counts);
  if (!series) return h('figure', { className: 'wb-chart' }, h('figcaption', null, SIGHTINGS_PER_DAY), h('p', { className: 'wb-chart__empty' }, emptyText('chart')));
  // The SVG is drawn once the island has measured it (data.chartSize, a ResizeObserver on data.chartRef).
  const model = data.chartSize && plottable(data.chartSize) ? chartModel(data.counts, data.chartSize) : null;
  const drawing =
    model && !model.empty
      ? [
          h('g', { className: 'wb-chart__grid' }, model.ticks.slice(1).map((t) => h('line', { key: t.value, x1: model.left, x2: model.right, y1: t.y, y2: t.y }))),
          model.bars.map((b) => h('rect', { key: `${b.day}-${b.series}`, className: 'wb-chart__bar', 'data-series': b.series, x: b.x, y: b.y, width: b.width, height: b.height })),
          h(
            'g',
            { className: 'wb-chart__axis' },
            h('line', { x1: model.left, x2: model.right, y1: model.baseline, y2: model.baseline }),
            model.ticks.map((t) => h('text', { key: `y${t.value}`, x: model.left - 8, y: t.y + 4, textAnchor: 'end' }, t.value.toLocaleString('en-US'))),
            model.days.map((d, i) => d.label && h('text', { key: `x${i}`, x: d.x, y: model.baseline + 16, textAnchor: 'middle' }, d.label)),
          ),
        ]
      : [];
  return h(
    'figure',
    { className: 'wb-chart' },
    h('figcaption', null, SIGHTINGS_PER_DAY),
    h('svg', { ref: data.chartRef, viewBox: model && !model.empty ? model.viewBox : undefined, role: 'img', 'aria-label': series.label }, drawing),
    h('ul', { className: 'wb-chart__legend', role: 'list' }, series.legend.map((l) => h('li', { key: l.series, 'data-series': l.series, 'data-kind': 'bar' }, l.label))),
  );
};
