// The site's charts (Ruling 43: one chart module), as the design's chart frame (.wb-chart: its caption, an SVG of
// bars or lines with the design's axis and grid groups, its legend). Every chart is drawn in CSS pixels at the size it
// is shown (the island measures its SVG, a ResizeObserver), so the axis text keeps its token size. A plain module with
// no DOM, part of the islands' VDOM (h in src/lib/vdom.mjs), so the tests read it without a browser
// (tests/chart.test.mjs). Its charts:
// - chartNode: the live camera page's species chart (/live/, "Species this week": GET /api/public/species/counts
//   ?days=7&top=5, the five species most seen and every other species as "Other species", the days' bars stacked
//   from the axis; in its titled panel the caption is for a screen reader only), and a species page's two
//   (src/lib/species-live.mjs: the day's hours, "07:00", and the last twelve months, "2026-09", each with a caption of
//   its own);
// - stackNode and lineNode: the trends page's (/live/trends/, src/lib/trends.mjs): the species seen per day or week
//   (the six most seen, and the rest as "Other species") and the sensors' history as lines, both in the tall frame,
//   on round ticks (niceDomain, ticks) and dates at Wahoo Bay's midnight (timeTicks).
// A species' colour is its own on a page (Ruling 50): seriesFor gives it its place in the page's ranking (the trends
// page's 30-day species order, the live page's 7-day order, taken once and grown by extendRanking: at its end, and
// past eight in the place of a species the answer does not show, Ruling 63), so a species keeps its colour from range
// to range and refresh to refresh; "Other species" is data-series="other".
import { emptyText } from './public-api.mjs';
import { h } from './vdom.mjs';

/** @typedef {import('./vdom.mjs').VNode} VNode */
/** @typedef {{ width: number, height: number }} Size */
/** A reading at a time: `t` in epoch milliseconds, `v` the value, or null where there is none (a gap in the line). */
/** @typedef {{ t: number, v: number | null }} Point */

// katie: review: the chart's caption, new words (a sighting is a fish the camera followed for at least three frames)
const SIGHTINGS_PER_DAY = 'Sightings per day';
// katie: review: new words (the chart's last series: every species after the five, or six, most seen)
const OTHER = 'Other species';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/**
 * A bucket as a chart names it, read as written, with no time zone to shift it. With a granularity: a day
 * ("2026-10-03") as "Oct 3", a month ("2026-10-03" or "2026-10") as "Oct 2026". Without one, by its shape: a day as
 * "Oct 25", a month ("2026-09") as "Sep", an hour ("07:00") as "7 am"; anything else as it is.
 * @param {string} bucket
 * @param {'day' | 'month'} [granularity]
 */
export const bucketLabel = (bucket, granularity) => {
  const date = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(bucket);
  if (granularity && date) {
    const month = MONTHS[Number(date[2]) - 1];
    if (granularity === 'month') return `${month} ${date[1]}`;
    if (date[3]) return `${month} ${Number(date[3])}`;
  }
  const day = /^\d{4}-(\d{2})-(\d{2})$/.exec(bucket);
  if (day) return `${MONTHS[Number(day[1]) - 1]} ${Number(day[2])}`;
  const month = /^\d{4}-(\d{2})$/.exec(bucket);
  if (month) return MONTHS[Number(month[1]) - 1];
  const hour = /^(\d{2}):00$/.exec(bucket);
  if (hour) return `${Number(hour[1]) % 12 || 12} ${Number(hour[1]) < 12 ? 'am' : 'pm'}`;
  return bucket;
};

// --- A species' colour on a page (Ruling 50) -------------------------------------------------------------------

/** The design's series colours, 1 to 8; past them is "other". */
const SERIES_COLOURS = 8;

/** A counts series' species: its id, else its Latin; null for neither. */
const speciesOf = (/** @type {any} */ s) => (s && (s.species_id ?? s.latin)) || null;

/**
 * The species of a counts answer (GET /api/public/species/counts, or a chart in its shape), in its order, the most
 * seen first.
 * @param {any} counts
 * @returns {string[]}
 */
export const rankingOf = (counts) => (Array.isArray(counts?.series) ? counts.series.map(speciesOf).filter((id) => id !== null).map(String) : []);

/**
 * A page's ranking with the species of `counts` it does not have yet, in the answer's order: a species already placed
 * keeps its place, so its colour, for the rest of the page's life. Each new one goes at the end while the ranking has
 * fewer than eight; past eight (a page open for days, Ruling 63) it takes the place, and so the colour, of the
 * lowest-ranked species the answer does not show, and when the answer shows every ranked species the ranking starts
 * again from the answer. No ranking yet is the answer's own.
 * @param {string[] | null | undefined} ranking
 * @param {any} counts
 * @returns {string[]}
 */
export const extendRanking = (ranking, counts) => {
  const known = Array.isArray(ranking) ? ranking : [];
  const shown = rankingOf(counts).filter((id, i, all) => all.indexOf(id) === i);
  const added = shown.filter((id) => !known.includes(id));
  if (added.length === 0) return known;
  const next = [...known];
  for (const id of added) {
    if (next.length < SERIES_COLOURS) {
      next.push(id);
      continue;
    }
    // The lowest-ranked place among the eight whose species the answer does not show.
    let at = -1;
    for (let i = SERIES_COLOURS - 1; i >= 0 && at < 0; i -= 1) if (!shown.includes(next[i])) at = i;
    if (at < 0) return shown;
    next[at] = id;
  }
  return next;
};

/**
 * A species' series on a page: its place in the page's ranking, "1" to "8"; "other" past the eighth place, or for a
 * species the ranking does not have.
 * @param {string} speciesId
 * @param {string[] | null | undefined} ranking
 * @returns {string}
 */
export const seriesFor = (speciesId, ranking) => {
  const at = Array.isArray(ranking) ? ranking.indexOf(speciesId) : -1;
  return at >= 0 && at < SERIES_COLOURS ? String(at + 1) : 'other';
};

// --- The maths: domains, ticks, scales, lines and stacked bars ----------------------------------------------------

/** A number without floating-point dust (0.30000000000000004 is 0.3), and never -0. */
const tidy = (/** @type {number} */ v) => Number(v.toPrecision(12)) || 0;

/** A round step for a span cut into about `count` parts: 1, 2 or 5 times a power of ten. */
const niceStep = (/** @type {number} */ span, /** @type {number} */ count) => {
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const err = raw / power;
  return (err >= Math.sqrt(50) ? 10 : err >= Math.sqrt(10) ? 5 : err >= Math.SQRT2 ? 2 : 1) * power;
};

const isValue = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * How a chart's value axis is drawn: from zero (counts, wind, rain); at least `minSpan` wide, centred on the values,
 * so a change smaller than the sensor's noise stays a nearly flat line (0.5 for pH); never below `floor` (0 for what
 * cannot be negative).
 * @typedef {{ zero?: boolean, minSpan?: number, floor?: number }} Scale
 */

/**
 * The values' extent, rounded out to a round step (about four of them), as `scale` says. A flat line gets room above
 * and below; no values at all is null.
 * @param {Array<number | null | undefined>} values
 * @param {Scale} [scale]
 * @returns {[number, number] | null}
 */
export const niceDomain = (values, { zero = false, minSpan = 0, floor = -Infinity } = {}) => {
  const finite = /** @type {number[]} */ (values.filter(isValue));
  if (finite.length === 0) return null;
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  // From zero: zero is on the axis, and for values that are never negative it is the axis' foot.
  if (zero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    if (lo === 0) floor = Math.max(floor, 0);
  }
  const span = Math.max(minSpan, lo === hi ? Math.abs(lo) / 5 || (zero ? 1 : 2) : 0);
  if (hi - lo < span) [lo, hi] = [(lo + hi - span) / 2, (lo + hi + span) / 2];
  // Off the floor by moving the span up, so it keeps its width.
  if (lo < floor) [lo, hi] = [floor, hi + floor - lo];
  for (let i = 0; i < 4; i += 1) {
    const step = niceStep(hi - lo, 4);
    const next = [tidy(Math.floor(lo / step + 1e-9) * step), tidy(Math.ceil(hi / step - 1e-9) * step)];
    if (next[0] === lo && next[1] === hi) break;
    [lo, hi] = next;
  }
  return [Math.max(lo, floor), hi];
};

/**
 * Round values from the domain's low end to its high end, evenly spaced, about `count` steps apart.
 * @param {[number, number]} domain
 * @param {number} [count]
 */
export const ticks = ([lo, hi], count = 4) => {
  if (!(hi > lo)) return [lo];
  const step = niceStep(hi - lo, count);
  const first = Math.ceil(lo / step - 1e-9);
  const last = Math.floor(hi / step + 1e-9);
  return Array.from({ length: last - first + 1 }, (_, i) => tidy((first + i) * step));
};

/**
 * The times' extent across `width` pixels from `left`: earliest at `left`, latest at `left + width`.
 * @param {number[]} times epoch milliseconds (or bucket numbers)
 * @param {number} width
 * @param {number} [left]
 * @returns {(t: number) => number}
 */
export const xScale = (times, width, left = 0) => {
  const finite = times.filter(isValue);
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  return (t) => left + (hi > lo ? ((t - lo) / (hi - lo)) * width : width / 2);
};

/**
 * A domain up `height` pixels from `top`: its high end at `top`, its low end at `top + height`.
 * @param {[number, number]} domain
 * @param {number} height
 * @param {number} [top]
 * @returns {(v: number) => number}
 */
export const yScale = ([lo, hi], height, top = 0) => (v) => top + (hi > lo ? (1 - (v - lo) / (hi - lo)) * height : height / 2);

const px = (/** @type {number} */ v) => tidy(Math.round(v * 10) / 10);

/**
 * The SVG path (`d`) through the points, to a tenth of a pixel: '' for no points; a point without a value breaks the
 * line, and a reading alone between two gaps is a dot (a zero-length segment, which the round line cap draws).
 * @param {Point[]} points in time order
 * @param {(t: number) => number} xs
 * @param {(v: number) => number} ys
 */
export const linePath = (points, xs, ys) => {
  /** @type {string[][]} */
  const runs = [];
  /** @type {string[] | null} */
  let run = null;
  for (const p of points) {
    if (!isValue(p?.v)) {
      run = null;
      continue;
    }
    if (!run) runs.push((run = []));
    run.push(`${px(xs(p.t))} ${px(ys(/** @type {number} */ (p.v)))}`);
  }
  return runs.map((r) => `M${r[0]}${r.length === 1 ? 'h0' : r.slice(1).map((c) => `L${c}`).join('')}`).join('');
};

/**
 * Each bucket's series stacked from the axis, series 1 at the bottom, a bar per non-zero count, centred in the
 * bucket's slot (from xs(i) to xs(i + 1)) and at most 48px wide.
 * @param {{ series: string, counts: number[] }[]} series
 * @param {string[]} buckets
 * @param {(i: number) => number} xs a bucket's number to the left edge of its slot
 * @param {(v: number) => number} ys
 * @returns {{ x: number, y: number, width: number, height: number, series: string, bucket: number }[]}
 */
export const barRects = (series, buckets, xs, ys) =>
  buckets.flatMap((_, i) => {
    const slot = xs(i + 1) - xs(i);
    const width = Math.min(slot * 0.62, 48);
    const x = xs(i) + (slot - width) / 2;
    let below = 0;
    return series.flatMap((s) => {
      const v = s.counts[i];
      if (!(v > 0)) return [];
      const rect = { x, y: ys(below + v), width, height: ys(below) - ys(below + v), series: s.series, bucket: i };
      below += v;
      return [rect];
    });
  });

/** How many decimal places a step has: 1 for 0.5, 3 for 0.002, none for 500. */
const placesOf = (/** @type {number} */ step) => {
  let places = 0;
  while (places < 10 && Math.abs(tidy(step * 10 ** places) - Math.round(step * 10 ** places)) > 1e-9) places += 1;
  return places;
};
/** @type {Map<number, Intl.NumberFormat>} */
const NUMBERS = new Map();
const numberTo = (/** @type {number} */ places) => {
  if (!NUMBERS.has(places)) NUMBERS.set(places, new Intl.NumberFormat('en-US', { maximumFractionDigits: places }));
  return /** @type {Intl.NumberFormat} */ (NUMBERS.get(places));
};
/**
 * A value as an axis shows it: to as many places as the axis' step has (so no two ticks read the same), or two
 * without one; grouped ("1,500"); with its unit after it, a % or a degree sign close up ("90%", "26.5°F"), any
 * other after a space ("12 mph").
 * @param {number} value
 * @param {string} [unit]
 * @param {number} [step] the axis' step between ticks
 */
export const formatTick = (value, unit = '', step) => {
  const n = numberTo(step !== undefined && step > 0 ? placesOf(step) : 2).format(tidy(value));
  if (!unit) return n;
  return /^[%°]/.test(unit) ? `${n}${unit}` : `${n} ${unit}`;
};

// --- Dates on a time axis, at Wahoo Bay's midnight --------------------------------------------------------------

const DAY_MS = 86_400_000;
// The reef is in Florida: a chart's days start at its midnight.
const WALL = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});
/** Wahoo Bay's clock at an instant, written as if it were UTC (so its date is read with getUTC…). */
const wall = (/** @type {number} */ ms) => {
  /** @type {Record<string, number>} */
  const p = {};
  for (const { type, value } of WALL.formatToParts(ms)) p[type] = Number(value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
};
/** The instant of midnight at Wahoo Bay on a day (month 0 to 11; Date.UTC's overflow rules). */
const midnight = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => {
  const utc = Date.UTC(y, m, d);
  const first = utc - (wall(utc) - utc);
  return utc - (wall(first) - first);
};

// Text on an axis is --wb-text-xs (12px): about 7px a character, labels 12px apart, and a label may reach 8px into
// the frame's padding.
const CHAR_PX = 7;
const LABEL_GAP = 12;
const EDGE = 8;
const textWidth = (/** @type {string} */ label) => label.length * CHAR_PX;
const fits = (/** @type {number} */ x, /** @type {string} */ label, /** @type {number} */ width) =>
  x - textWidth(label) / 2 >= -EDGE && x + textWidth(label) / 2 <= width + EDGE;
/** The room a label needs on an axis: its width and the gap to the next. */
const roomFor = (/** @type {string} */ label) => textWidth(label) + LABEL_GAP;
const DAY_ROOM = roomFor('Oct 25');
const MONTH_ROOM = roomFor('Oct 2026');

/**
 * The dates to mark under a time axis `width` pixels wide: each day at Wahoo Bay's midnight while a label fits in a
 * day, else every second or third day, or each Monday, or every other Monday ("Oct 25"); then the first of each month, or of
 * every second, third, sixth or twelfth month ("Oct 2026", January leading). Only those inside the span.
 * @param {[number, number]} span epoch milliseconds
 * @param {number} width
 * @returns {{ t: number, label: string }[]}
 */
export const timeTicks = ([t0, t1], width) => {
  if (!(t1 > t0) || !(width > 0)) return [];
  const perDay = (width * DAY_MS) / (t1 - t0);
  const from = new Date(wall(t0));
  const to = new Date(wall(t1));
  const inside = (/** @type {{ t: number }} */ tick) => tick.t >= t0 && tick.t <= t1;
  const k = [1, 2, 3, 7, 14].find((n) => n * perDay >= DAY_ROOM);
  if (k) {
    const days = Math.round((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / DAY_MS);
    return Array.from({ length: days + 1 }, (_, i) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i)))
      .filter((d) => (d.getTime() / DAY_MS + 3) % k === 0) // day 4 of the epoch was a Monday
      .map((d) => ({ t: midnight(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), label: bucketLabel(d.toISOString().slice(0, 10), 'day') }))
      .filter(inside);
  }
  const every = [1, 2, 3, 6, 12].find((n) => n * 30 * perDay >= MONTH_ROOM) ?? 12;
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  return Array.from({ length: months + 1 }, (_, i) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)))
    .filter((d) => d.getUTCMonth() % every === 0)
    .map((d) => ({ t: midnight(d.getUTCFullYear(), d.getUTCMonth(), 1), label: bucketLabel(d.toISOString().slice(0, 7), 'month') }))
    .filter(inside);
};

/**
 * Which buckets of a bar chart get a label under the axis, and what it says: days ("Oct 25") every day, or every
 * other day …, ending on the last; weeks by the first week of each month, or of every second, third … month, as the
 * month ("Oct 2026"), so a year's weeks read as months.
 * @param {string[]} buckets
 * @param {'day' | 'week'} granularity
 * @param {number} slot a bucket's width in pixels
 * @returns {Map<number, string>}
 */
const bucketTicks = (buckets, granularity, slot) => {
  if (granularity === 'week') {
    const firsts = buckets.flatMap((iso, i) => (/^\d{4}-\d{2}-0[1-7]$/.test(iso) ? [i] : []));
    const monthOf = (/** @type {number} */ i) => Number(buckets[i].slice(5, 7)) - 1;
    const spaced = (/** @type {number[]} */ list) => list.every((i, j) => j === 0 || (i - list[j - 1]) * slot >= MONTH_ROOM);
    const chosen = [1, 2, 3, 6, 12].map((n) => firsts.filter((i) => monthOf(i) % n === 0)).find(spaced) ?? [];
    return new Map(chosen.map((i) => [i, bucketLabel(buckets[i], 'month')]));
  }
  const every = Math.max(1, Math.ceil(DAY_ROOM / slot));
  return new Map(buckets.flatMap((iso, i) => ((buckets.length - 1 - i) % every === 0 ? [[i, bucketLabel(iso, 'day')]] : [])));
};

// --- The models: what to draw at a measured size ------------------------------------------------------------------

/** The step between an axis' ticks; 1 for a single tick. */
const stepOf = (/** @type {number[]} */ values) => (values.length > 1 ? tidy(values[1] - values[0]) : 1);

/** The smallest round step at least `v`: 1, 1.5, 2, 2.5, 3, 4, 5 … 10 times a power of ten, and never a fraction. */
const roundStep = (/** @type {number} */ v) => {
  const power = 10 ** Math.floor(Math.log10(v));
  const step = ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10].find((c) => c * power >= v) ?? 10) * power;
  return Number.isInteger(step) ? step : Math.ceil(step);
};

// The chart's room, in CSS pixels: the values' labels on the left (the trends charts measure theirs), the dates'
// under the axis.
const PAD = { left: 44, right: 0, top: 8, bottom: 22 };
// The least plot a measured size must leave to be drawn at all (a ResizeObserver can report an SVG at 0 wide while
// the page lays out): a smaller size is a chart not measured yet.
const MIN_PLOT = 24;
const plottable = (/** @type {Size | null | undefined} */ size) =>
  size != null && size.width - PAD.left - PAD.right >= MIN_PLOT && size.height - PAD.top - PAD.bottom >= MIN_PLOT;

/**
 * The counts as series: the `top` species most seen, each in its colour on the page (seriesFor its place in
 * `ranking`, which the answer's own order extends; without one, the answer's order), and every other species summed
 * as "other", with a species the ranking cannot colour added to it; each with a count per bucket, in the answer's
 * order, "other" last; null when there is nothing to draw. The label, the SVG's aria-label, is the caption, the span
 * ("Oct 25 to Oct 31", or the words given) and each series' total.
 * @param {any} counts GET /api/public/species/counts, or a species page's chart in its shape
 * @param {{ caption?: string, top?: number, span?: string, ranking?: string[] | null }} [options]
 */
const chartSeries = (counts, { caption = SIGHTINGS_PER_DAY, top = 5, span, ranking } = {}) => {
  const buckets = counts && Array.isArray(counts.buckets) ? counts.buckets.map(String) : [];
  const n = buckets.length;
  const clean = (/** @type {unknown} */ list) =>
    Array.isArray(list) && list.length === n ? list.map((v) => (typeof v === 'number' && v > 0 ? v : 0)) : buckets.map(() => 0);
  const shown = (Array.isArray(counts?.series) ? counts.series : []).slice(0, top);
  const page = extendRanking(ranking, { series: shown });
  const other = clean(counts?.other);
  /** @type {{ series: string, label: string, counts: number[] }[]} */
  const series = [];
  for (const s of shown) {
    const id = speciesOf(s);
    const colour = id === null ? 'other' : seriesFor(String(id), page);
    const values = clean(s?.counts);
    if (colour === 'other') values.forEach((v, i) => (other[i] += v));
    else series.push({ series: colour, label: String(s.common || s.latin || s.species_id), counts: values });
  }
  if (other.some((v) => v > 0)) series.push({ series: 'other', label: OTHER, counts: other });
  const totals = buckets.map((_, d) => series.reduce((sum, s) => sum + s.counts[d], 0));
  const max = Math.max(0, ...totals);
  if (n === 0 || max === 0) return null;
  const legend = series.map(({ series: id, label }) => ({ series: id, label }));
  const words = series.map((s) => `${s.label} ${s.counts.reduce((a, b) => a + b, 0).toLocaleString('en-US')}`).join(', ');
  const label = span ? `${caption} ${span}: ${words}` : `${caption}, ${bucketLabel(buckets[0])} to ${bucketLabel(buckets[n - 1])}: ${words}`;
  return { buckets, series, legend, max, label };
};

/**
 * The live page's species chart drawn at its measured size, in CSS pixels (a viewBox of the same size, so the axis
 * text keeps its token size): the days' bars stacked from the axis, series 1 at the bottom, a bar per non-zero count;
 * round ticks on the left (three where there is room, else two); the days under the axis. `empty` when there is
 * nothing to draw.
 * @param {any} counts GET /api/public/species/counts?days=7&top=5
 * @param {Size} size the SVG's size on the page
 * @param {{ ranking?: string[] | null }} [options] the page's ranking (seriesFor)
 */
export const chartModel = (counts, { width, height }, { ranking } = {}) => {
  const data = chartSeries(counts, { ranking });
  if (!data) return /** @type {const} */ ({ empty: true });
  const n = data.buckets.length;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const steps = plotH >= 48 ? 2 : 1;
  const step = roundStep(data.max / steps);
  const ys = yScale([0, step * steps], plotH, PAD.top);
  const xs = xScale([0, n], plotW, PAD.left);
  const slot = plotW / n;
  // Days too narrow for a label each are labelled every other day (or every third …), ending on today.
  const every = Math.max(1, Math.ceil(DAY_ROOM / slot));
  return {
    empty: /** @type {const} */ (false),
    viewBox: `0 0 ${width} ${height}`,
    left: PAD.left,
    baseline: ys(0),
    right: width - PAD.right,
    bars: barRects(data.series, data.buckets, xs, ys).map((b) => ({ ...b, day: b.bucket })),
    ticks: Array.from({ length: steps + 1 }, (_, i) => ({ value: i * step, y: ys(i * step), label: (i * step).toLocaleString('en-US') })),
    days: data.buckets.map((iso, day) => ({ label: (n - 1 - day) % every === 0 ? bucketLabel(iso) : null, x: xs(day) + slot / 2 })),
    legend: data.legend,
    label: data.label,
  };
};

/**
 * The trends page's species chart at its measured size: the buckets' bars stacked from the axis, the `top` species
 * most seen as series 1 to `top` and the rest as the next; whole-number ticks from zero, the left margin as wide as
 * the longest; days or weeks under the axis (bucketTicks). By day, the labels end on the last day, so the plot stops
 * short of the right edge by what that label needs to stay in the frame. `empty` when there is nothing to draw.
 * @param {any} counts GET /api/public/species/counts?days=…&granularity=…&top=6
 * @param {Size} size
 * @param {{ granularity?: 'day' | 'week', top?: number, ranking?: string[] | null }} [options]
 */
export const stackModel = (counts, { width, height }, { granularity = 'day', top = 6, ranking } = {}) => {
  const data = chartSeries(counts, { top, ranking });
  const domain = data && niceDomain([0, data.max], { zero: true, floor: 0 });
  if (!data || !domain) return /** @type {const} */ ({ empty: true });
  const values = ticks(domain).filter(Number.isInteger);
  const labels = values.map((v) => formatTick(v, '', stepOf(values)));
  const left = Math.ceil(Math.max(...labels.map(textWidth))) + 8;
  const n = data.buckets.length;
  const last = granularity === 'day' ? textWidth(bucketLabel(data.buckets[n - 1], 'day')) / 2 - EDGE : 0;
  const right = Math.max(PAD.right, Math.ceil(last - (width - left) / n / 2) + 1);
  const plotW = width - left - right;
  const xs = xScale([0, n], plotW, left);
  const ys = yScale(domain, height - PAD.top - PAD.bottom, PAD.top);
  const slot = plotW / n;
  const marks = bucketTicks(data.buckets, granularity, slot);
  return {
    empty: /** @type {const} */ (false),
    viewBox: `0 0 ${width} ${height}`,
    left,
    baseline: ys(0),
    right: width - right,
    bars: barRects(data.series, data.buckets, xs, ys),
    ticks: values.map((value, i) => ({ value, y: ys(value), label: labels[i] })),
    days: data.buckets.map((_, i) => {
      const x = xs(i) + slot / 2;
      const label = marks.get(i) ?? null;
      return { x, label: label !== null && fits(x, label, width) ? label : null };
    }),
    legend: data.legend,
  };
};

/**
 * A line chart at its measured size: the points as one path (with its gaps) across the span, round ticks on the left
 * (four where there is room, else two; the unit on the top one) on the measure's scale (niceDomain), the left margin
 * as wide as the longest label, the dates under the axis (timeTicks). `empty` when no point has a value.
 * @param {{ points: Point[], domain: [number, number], unit?: string } & Scale} line `domain` is the span of time the
 *   chart covers, epoch milliseconds
 * @param {Size} size
 */
export const lineModel = ({ points, domain, unit = '', zero, minSpan, floor }, { width, height }) => {
  const range = niceDomain(points.map((p) => p.v), { zero, minSpan, floor });
  if (!range) return /** @type {const} */ ({ empty: true });
  const plotH = height - PAD.top - PAD.bottom;
  const values = ticks(range, plotH >= 120 ? 4 : 2);
  const labels = values.map((v, i) => formatTick(v, i === values.length - 1 ? unit : '', stepOf(values)));
  const left = Math.ceil(Math.max(...labels.map(textWidth))) + 8;
  const plotW = width - left - PAD.right;
  const xs = xScale(domain, plotW, left);
  const ys = yScale(range, plotH, PAD.top);
  return {
    empty: /** @type {const} */ (false),
    viewBox: `0 0 ${width} ${height}`,
    left,
    baseline: ys(range[0]),
    right: width - PAD.right,
    d: linePath(points, xs, ys),
    ticks: values.map((value, i) => ({ value, y: ys(value), label: labels[i] })),
    times: timeTicks(domain, plotW)
      .map(({ t, label }) => ({ x: xs(t), label }))
      .filter((t) => fits(t.x, t.label, width)),
  };
};

// --- The nodes: the design's chart frame around a model -----------------------------------------------------------

/**
 * @typedef {{ left: number, right: number, baseline: number, ticks: { value: number, y: number, label: string }[] }} Axes
 */

/** The dashed gridlines at each tick above the axis. */
const gridNode = (/** @type {Axes} */ model) =>
  h('g', { className: 'wb-chart__grid' }, model.ticks.filter((t) => t.y < model.baseline - 0.5).map((t) => h('line', { key: t.value, x1: model.left, x2: model.right, y1: t.y, y2: t.y })));

/** The axis line, the ticks' labels on the left and the dates' under the axis. */
const axisNode = (/** @type {Axes} */ model, /** @type {{ x: number, label: string | null }[]} */ dates) =>
  h(
    'g',
    { className: 'wb-chart__axis' },
    h('line', { x1: model.left, x2: model.right, y1: model.baseline, y2: model.baseline }),
    model.ticks.map((t) => h('text', { key: `y${t.value}`, x: model.left - 8, y: t.y + 4, textAnchor: 'end' }, t.label)),
    dates.map((d, i) => d.label && h('text', { key: `x${i}`, x: d.x, y: model.baseline + 16, textAnchor: 'middle' }, d.label)),
  );

/** A bar chart's stacked bars, each the design's bar in its series' colour. */
const barsNode = (/** @type {ReturnType<typeof barRects>} */ bars) =>
  bars.map((b) => h('rect', { key: `${b.bucket}-${b.series}`, className: 'wb-chart__bar', 'data-series': b.series, x: b.x, y: b.y, width: b.width, height: b.height }));

/** A bar chart's legend: a square key per series. */
const legendNode = (/** @type {{ series: string, label: string }[]} */ legend) =>
  h('ul', { className: 'wb-chart__legend', role: 'list' }, legend.map((l) => h('li', { key: l.series, 'data-series': l.series, 'data-kind': 'bar' }, l.label)));

/** The design's empty chart: one sentence where the drawing would be. */
const emptyNode = () => h('p', { className: 'wb-chart__empty' }, emptyText('chart'));

/**
 * The frame: the caption, the drawing (or the empty sentence), then what follows it (a legend, a link). The caption
 * can carry a class: wb-sr-only in a panel whose title already says what the chart is (it stays the figure's name for
 * a screen reader), wb-as-is for a caption that keeps its case ("pH"); and `content`, nodes shown in place of its
 * text (a unit that keeps its case).
 * @param {string | { text: string, className?: string, content?: any[] }} caption
 * @param {boolean} tall the trends page's 2:1 frame
 * @param {...any} children
 */
const frameNode = (caption, tall, ...children) => {
  const { text, className, content } = typeof caption === 'string' ? { text: caption, className: undefined, content: undefined } : caption;
  return h('figure', { className: tall ? 'wb-chart wb-chart--tall' : 'wb-chart' }, h('figcaption', className ? { className } : null, ...(content ?? [text])), ...children);
};

/**
 * The live page's species panel chart (and a species page's two): the design's chart frame with its caption, the SVG
 * (drawn once the island has measured it), and the legend; the empty chart's sentence when there is nothing to draw.
 * `caption` is "Sightings per day" unless the chart has its own (a species page's); `hiddenCaption` keeps it for a
 * screen reader only, in a panel whose title already says what the chart shows (Ruling 50). `ranking` is the page's
 * (seriesFor).
 * @param {{ counts?: any, chartSize?: Size | null, chartRef?: any, caption?: string, hiddenCaption?: boolean, ranking?: string[] | null }} data
 * @returns {VNode}
 */
export const chartNode = (data) => {
  const words = data.caption ?? SIGHTINGS_PER_DAY;
  const caption = data.hiddenCaption ? { text: words, className: 'wb-sr-only' } : words;
  const series = chartSeries(data.counts, { caption: words, ranking: data.ranking });
  if (!series) return frameNode(caption, false, emptyNode());
  // The SVG is drawn once the island has measured it (data.chartSize, a ResizeObserver on data.chartRef).
  const model = data.chartSize && plottable(data.chartSize) ? chartModel(data.counts, data.chartSize, { ranking: data.ranking }) : null;
  const drawing =
    model && !model.empty
      ? [gridNode(model), barsNode(model.bars), axisNode(model, model.days)]
      : [];
  return frameNode(
    caption,
    false,
    h('svg', { ref: data.chartRef, viewBox: model && !model.empty ? model.viewBox : undefined, role: 'img', 'aria-label': series.label }, drawing),
    legendNode(series.legend),
  );
};

/**
 * The trends page's species chart in the tall frame: before its answer has arrived (`counts` undefined) the SVG to
 * measure, labelled with the caption and the span; with nothing to draw, the empty sentence; else the stacked bars
 * (stackModel, once measured), labelled with each series' total, and the square-keyed legend. `after` follows the
 * legend (the page's CSV link).
 * @param {{ counts?: any, granularity?: 'day' | 'week', caption: string, span: string, size?: Size | null, chartRef?: any, after?: any, ranking?: string[] | null }} data
 * @returns {VNode}
 */
export const stackNode = (data) => {
  const { caption, span, ranking } = data;
  if (data.counts === undefined) return frameNode(caption, true, h('svg', { ref: data.chartRef, role: 'img', 'aria-label': `${caption} ${span}` }), data.after);
  const series = chartSeries(data.counts, { caption, top: 6, span, ranking });
  if (!series) return frameNode(caption, true, emptyNode(), data.after);
  const model = data.size && plottable(data.size) ? stackModel(data.counts, data.size, { granularity: data.granularity, ranking }) : null;
  const drawing =
    model && !model.empty
      ? [gridNode(model), barsNode(model.bars), axisNode(model, model.days)]
      : [];
  return frameNode(
    caption,
    true,
    h('svg', { ref: data.chartRef, viewBox: model && !model.empty ? model.viewBox : undefined, role: 'img', 'aria-label': series.label }, drawing),
    legendNode(series.legend),
    data.after,
  );
};

/**
 * A trends line chart in the tall frame: before its answer has arrived (`points` undefined) the SVG to measure,
 * labelled `label`; with no value to draw, the empty sentence; else the line as a path of series 1 over the grid and
 * axis (lineModel, once measured), labelled with the lowest and highest values. `after` follows the drawing.
 * @param {{ points?: Point[], domain: [number, number], unit?: string, caption: string, captionContent?: any[], asIs?: boolean, label: string, size?: Size | null, chartRef?: any, after?: any } & Scale} data
 *   `asIs`: the caption keeps its case ("pH"; the design's .wb-as-is); `captionContent`: what the caption shows, when a
 *   part of it keeps its case (a unit in a .wb-as-is span); `caption` is its words
 * @returns {VNode}
 */
export const lineNode = (data) => {
  const { label, points, unit = '' } = data;
  const caption = { text: data.caption, className: data.asIs ? 'wb-as-is' : undefined, content: data.captionContent };
  if (points === undefined) return frameNode(caption, true, h('svg', { ref: data.chartRef, role: 'img', 'aria-label': label }), data.after);
  const values = /** @type {number[]} */ (points.map((p) => p.v).filter(isValue));
  if (values.length === 0) return frameNode(caption, true, emptyNode(), data.after);
  const model = data.size && plottable(data.size) ? lineModel({ ...data, points }, data.size) : null;
  const drawing = model && !model.empty ? [gridNode(model), axisNode(model, model.times), h('path', { 'data-series': '1', d: model.d })] : [];
  const words = `${label}: from ${formatTick(Math.min(...values), unit)} to ${formatTick(Math.max(...values), unit)}`;
  return frameNode(
    caption,
    true,
    h('svg', { ref: data.chartRef, viewBox: model && !model.empty ? model.viewBox : undefined, role: 'img', 'aria-label': words }, drawing),
    data.after,
  );
};
