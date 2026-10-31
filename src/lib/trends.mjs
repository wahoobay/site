// The trends page (/live/trends/, src/pages/live/trends/index.astro): what its island (src/islands/TrendsCharts.tsx)
// asks the public API for and what it draws. A plain module with no DOM and no React, so the tests read it without a
// build or a browser (tests/trends.test.mjs).
// The page has four ranges (Ruling 44), a .wb-seg switch whose choice is the island's state: 7 days, 30 days (the
// default), 1 year and All. For the chosen range the island asks for the species seen per day (7 and 30 days) or per
// week (the others: GET /api/public/species/counts, the six species most seen and the rest), the sensors' history
// (GET /api/public/environment/history, bucket-averaged) and their latest reading (GET /api/public/environment/latest),
// again every ten minutes while the page shows. renderState is its render, a small VDOM (h in src/lib/vdom.mjs) with
// React's prop names: the switch; the design's notice when the last round of fetches did not all answer (what was
// drawn stays); the tiles with the readings' age; "Species", the stacked bars; "Water" and "Weather", a line chart a
// measure. Each chart is a figure in the design's tall frame (src/lib/chart.mjs) with its caption, an SVG whose
// aria-label states the range (before its answer arrives too), and a "CSV" link to the matching public export, over
// the export's nearest window (the exports allow 7, 30, 90 and 365 days).
import { lineNode, stackNode } from './chart.mjs';
import { API_BASE, emptyText, fahrenheit, relativeTime } from './public-api.mjs';
import { tiles } from './live.mjs';
import { h } from './vdom.mjs';

/** @typedef {import('./vdom.mjs').VNode} VNode */
/** @typedef {{ width: number, height: number }} Size */
/** @typedef {import('./chart.mjs').Point} Point */

// The words, all new.
// katie: review: the range switch's name, for a screen reader
const CHART_RANGE = 'Chart range';
// katie: review: the four ranges (the 1-year and All charts count species per week)
const RANGE_WORDS = { '7d': ['7 days', 'over the last 7 days'], '30d': ['30 days', 'over the last 30 days'], '1y': ['1 year', 'over the last year'], all: ['All', 'over the whole record'] };
// katie: review: the three headings
const SPECIES = 'Species';
// katie: review
const WATER = 'Water';
// katie: review
const WEATHER = 'Weather';
// katie: review: the species chart's caption, for 7 and 30 days (a sighting is a fish followed for three frames or more)
const PER_DAY = 'Species seen per day';
// katie: review: the species chart's caption, for a year and All
const PER_WEEK = 'Species seen per week';
// The water charts' captions: pH, oxygen and turbidity are the live page's tile labels (src/lib/live.mjs).
const [, PH, OXYGEN, TURBIDITY] = tiles(null).map((t) => t.k);
// katie: review: the other line charts' captions
const WATER_TEMPERATURE = 'Water temperature';
// katie: review
const AIR_TEMPERATURE = 'Air temperature';
// katie: review
const WIND_SPEED = 'Wind speed';
// katie: review: the weather station's rain accumulation, in mm
const RAINFALL = 'Rainfall';
// katie: review: the weather tiles' labels, beside the live page's water tiles
const AIR = 'Air';
// katie: review
const WIND = 'Wind';
// katie: review: before each reading's age ("Water measured 5 days ago. Weather measured 3 min ago.")
const WATER_MEASURED = 'Water measured ';
// katie: review
const WEATHER_MEASURED = 'Weather measured ';
// katie: review: the notice when a fetch failed; the charts keep what they showed
const NOT_LOADED = 'Some of the readings did not load. The page tries again every ten minutes.';
// katie: review: what each chart's CSV link downloads, for a screen reader ("CSV of the water readings, 30 days")
const FILE_WORDS = { sightings: 'of the sightings', water_quality: 'of the water readings', weather: 'of the weather readings' };

/** The latest reading's path under /api/public. */
export const LATEST = '/environment/latest';
/** How often the island asks again, while the page shows. */
export const REFRESH_MS = 10 * 60_000;

/**
 * @typedef {object} Range
 * @property {'7d' | '30d' | '1y' | 'all'} id
 * @property {string} label the switch's words
 * @property {string} span the charts' labels' words ("over the last 30 days")
 * @property {{ days: number, granularity: 'day' | 'week' }} counts the species counts asked for (400 days at most)
 * @property {{ days: number, maxPoints: number }} history the history asked for (days 1, 7, 30, 90, 365 or 800; max_points 100, 200 or 500)
 * @property {number} exportDays the exports' nearest window (7, 30, 90 or 365)
 */
/** @type {Range[]} */
export const RANGES = /** @type {const} */ ([
  ['7d', { days: 7, granularity: 'day' }, { days: 7, maxPoints: 200 }, 7],
  ['30d', { days: 30, granularity: 'day' }, { days: 30, maxPoints: 200 }, 30],
  ['1y', { days: 365, granularity: 'week' }, { days: 365, maxPoints: 200 }, 365],
  ['all', { days: 400, granularity: 'week' }, { days: 800, maxPoints: 500 }, 365],
]).map(([id, counts, history, exportDays]) => ({ id, label: RANGE_WORDS[id][0], span: RANGE_WORDS[id][1], counts, history, exportDays }));

/** The range the page opens on. */
export const DEFAULT_RANGE = '30d';

/** A range by its id; an unknown id is the default. */
export const rangeOf = (/** @type {string | undefined} */ id) => RANGES.find((r) => r.id === id) ?? /** @type {Range} */ (RANGES.find((r) => r.id === DEFAULT_RANGE));

/** The species counts' path for a range. */
export const countsPath = (/** @type {Range} */ r) => `/species/counts?days=${r.counts.days}&granularity=${r.counts.granularity}&top=6`;
/** The history's path for a range. */
export const historyPath = (/** @type {Range} */ r) => `/environment/history?days=${r.history.days}&max_points=${r.history.maxPoints}`;
/** A public export's CSV over a range's nearest window. */
export const csvHref = (/** @type {string} */ name, /** @type {Range} */ r) => `${API_BASE}/exports/${name}.csv?days=${r.exportDays}`;
/** Every path the island asks for a range: the counts, the history, the latest reading. */
export const pathsOf = (/** @type {Range} */ r) => [countsPath(r), historyPath(r), LATEST];

const reading = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const toF = (/** @type {number} */ c) => (c * 9) / 5 + 32;
const toMph = (/** @type {number} */ ms) => ms * 2.236936;

/**
 * A line chart of the page: its key (the island measures each chart's SVG by it), caption, the history's list and
 * field, the unit the chart shows it in (and the conversion to it), whether its axis starts at zero, and its export.
 * @typedef {{ key: string, caption: string, list: 'water' | 'weather', field: string, unit: string, convert?: (v: number) => number, zero?: boolean, file: string }} Measure
 */
/** @type {Measure[]} */
const WATER_CHARTS = [
  { key: 'water-temp', caption: WATER_TEMPERATURE, list: 'water', field: 'water_temp_c', unit: '°F', convert: toF, file: 'water_quality' },
  { key: 'ph', caption: PH, list: 'water', field: 'ph', unit: '', file: 'water_quality' },
  { key: 'oxygen', caption: OXYGEN, list: 'water', field: 'do_pct', unit: '%', file: 'water_quality' },
  { key: 'turbidity', caption: TURBIDITY, list: 'water', field: 'turbidity_fnu', unit: 'FNU', file: 'water_quality' },
];
/** @type {Measure[]} */
const WEATHER_CHARTS = [
  { key: 'air-temp', caption: AIR_TEMPERATURE, list: 'weather', field: 'air_temp_c', unit: '°F', convert: toF, file: 'weather' },
  { key: 'wind', caption: WIND_SPEED, list: 'weather', field: 'wind_speed_avg_ms', unit: 'mph', convert: toMph, zero: true, file: 'weather' },
  { key: 'rain', caption: RAINFALL, list: 'weather', field: 'rain_accum_mm', unit: 'mm', zero: true, file: 'weather' },
];
/** The species chart's export: the sightings, one row per fish followed, which is what the chart counts. */
const SPECIES_FILE = 'sightings';

/** Every chart's key, in the page's order: the species chart, then the water's and the weather's. */
export const CHART_KEYS = ['species', ...WATER_CHARTS.map((m) => m.key), ...WEATHER_CHARTS.map((m) => m.key)];

/**
 * A measure's readings from the history's rows, in time order, in the chart's unit: a reading without the value is
 * a gap (v: null), and so is a stretch of more than a bucket and a half with no row (the sensor was off).
 * @param {any[] | null | undefined} rows the history's `water` or `weather`
 * @param {{ field: string, convert?: (v: number) => number }} measure
 * @param {number} bucketMs the history's bucket, days / max_points
 * @returns {Point[]}
 */
export const pointsOf = (rows, { field, convert }, bucketMs) => {
  /** @type {Point[]} */
  const points = [];
  let last = Number.NaN;
  for (const row of Array.isArray(rows) ? rows : []) {
    const t = Date.parse(row?.ts);
    if (!Number.isFinite(t)) continue;
    if (t - last > 1.5 * bucketMs) points.push({ t: (last + t) / 2, v: null });
    const v = reading(row[field]);
    points.push({ t, v: v === null ? null : convert ? convert(v) : v });
    last = t;
  }
  return points;
};

/**
 * The six tiles from GET /api/public/environment/latest: the live page's four water tiles (tiles in src/lib/live.mjs),
 * then the air in °F with the °C under it and the wind in mph with the m/s under it. A missing reading is v: null.
 * @param {any} latest
 * @returns {{ k: string, v: string | null, unit: string | null, sub: string | null }[]}
 */
export const trendsTiles = (latest) => {
  const weather = latest && typeof latest === 'object' ? latest.weather : null;
  const air = reading(weather?.air_temp_c);
  const f = fahrenheit(air);
  const wind = reading(weather?.wind_speed_avg_ms);
  return [
    ...tiles(latest),
    { k: AIR, v: f === null ? null : String(f), unit: '°F', sub: air === null ? null : `${Math.round(air)} °C` },
    { k: WIND, v: wind === null ? null : String(Math.round(toMph(wind))), unit: 'mph', sub: wind === null ? null : `${wind.toFixed(1)} m/s` },
  ];
};

/**
 * The island's store after a round of fetches: each answer by its path and when it came, the last one kept when its
 * fetch fails; `failed` while the latest round did not all answer.
 * @param {Store | null} was
 * @param {Array<[string, PromiseSettledResult<any>]>} round
 * @param {number} now epoch milliseconds
 * @returns {Store}
 */
export const mergeRound = (was, round, now) => {
  const answers = { ...(was?.answers ?? {}) };
  const at = { ...(was?.at ?? {}) };
  let failed = false;
  for (const [path, settled] of round) {
    if (settled.status === 'fulfilled') {
      answers[path] = settled.value;
      at[path] = now;
    } else failed = true;
  }
  return { answers, at, failed };
};

/**
 * @typedef {object} Store
 * @property {Record<string, any>} answers the API's answers by path
 * @property {Record<string, number>} at when each arrived, epoch milliseconds
 * @property {boolean} failed the latest round's fetches did not all answer
 */

/**
 * What the island has to draw with; every field is optional.
 * @typedef {object} RenderData
 * @property {string} [range] the chosen range's id (DEFAULT_RANGE)
 * @property {Record<string, any>} [answers] mergeRound's
 * @property {Record<string, number>} [at] mergeRound's
 * @property {boolean} [failed] mergeRound's
 * @property {Record<string, Size | null | undefined>} [sizes] each chart's SVG as measured, by its key (CHART_KEYS)
 * @property {Record<string, any>} [refs] React's ref for each chart's SVG, by its key
 * @property {(id: string) => void} [onRange] told which range was chosen
 */

/** The switch: a button per range, the chosen one pressed. */
const rangeNode = (/** @type {Range} */ range, /** @type {RenderData['onRange']} */ onRange) =>
  h(
    'div',
    { key: 'range', className: 'wb-seg site-trends__range', role: 'group', 'aria-label': CHART_RANGE },
    RANGES.map((r) =>
      h('button', { key: r.id, className: 'wb-seg__btn', type: 'button', 'aria-pressed': r.id === range.id ? 'true' : 'false', onClick: () => onRange?.(r.id) }, r.label),
    ),
  );

/** A chart's CSV link: "CSV", and for a screen reader which file and window. */
const csvNode = (/** @type {string} */ file, /** @type {Range} */ range) =>
  h('p', { className: 'site-trends__csv' }, h('a', { href: csvHref(file, range) }, 'CSV', h('span', { className: 'wb-sr-only' }, ` ${FILE_WORDS[/** @type {keyof typeof FILE_WORDS} */ (file)]}, ${range.exportDays} days`)));

/** The latest readings as tiles, with their age; nothing until the answer has come. */
const nowNode = (/** @type {any} */ latest, /** @type {number | undefined} */ now) => {
  if (latest === undefined) return null;
  const shown = trendsTiles(latest).filter((t) => t.v !== null);
  if (shown.length === 0) return h('p', { key: 'now', className: 'wb-caption' }, emptyText('water'));
  const ages = /** @type {const} */ ([
    [WATER_MEASURED, latest?.water?.ts],
    [WEATHER_MEASURED, latest?.weather?.ts],
  ]).flatMap(([words, ts]) => {
    const age = relativeTime(ts ?? null, now ?? Number.NaN);
    return age ? [`${words}${age}.`] : [];
  });
  return h(
    'div',
    { key: 'now', className: 'site-trends__now' },
    h(
      'div',
      { className: 'site-trends__tiles' },
      shown.map((t) =>
        h(
          'div',
          { key: t.k, className: 'wb-tile' },
          h('p', { className: 'wb-tile__k' }, t.k),
          // The unit is the design's small after the number; the °C (or m/s) is a small of its own, on its own line.
          h('p', { className: 'wb-tile__v' }, t.v, t.unit && h('small', null, t.unit), t.sub && h('small', { className: 'site-trends__sub' }, t.sub)),
        ),
      ),
    ),
    ages.length > 0 && h('p', { className: 'wb-caption site-trends__age' }, ages.join(' ')),
  );
};

/**
 * The island's render: the switch, the notice when a fetch failed, the latest readings, and the three sections of
 * charts for the chosen range.
 * @param {RenderData} [data]
 * @returns {VNode}
 */
export const renderState = (data = {}) => {
  const range = rangeOf(data.range);
  const answers = data.answers ?? {};
  const at = data.at ?? {};
  const sizes = data.sizes ?? {};
  const refs = data.refs ?? {};
  const counts = answers[countsPath(range)];
  const history = answers[historyPath(range)];
  const now = at[historyPath(range)] ?? Number.NaN;

  // The span the line charts cover: the range up to the history's answer, or for All from the first reading.
  const rows = history ? [...(history.water ?? []), ...(history.weather ?? [])] : [];
  const first = Math.min(...rows.map((r) => Date.parse(r?.ts)).filter(Number.isFinite));
  const start = range.id === 'all' && Number.isFinite(first) ? first : now - range.history.days * 86_400_000;
  /** @type {[number, number]} */
  const domain = [start, now];
  const bucketMs = (range.history.days * 86_400_000) / range.history.maxPoints;
  const line = (/** @type {Measure} */ m) =>
    lineNode({
      points: history ? pointsOf(history[m.list], m, bucketMs) : undefined,
      domain,
      unit: m.unit,
      zero: m.zero,
      caption: m.caption,
      label: `${m.caption} ${range.span}`,
      size: sizes[m.key],
      chartRef: refs[m.key],
      after: csvNode(m.file, range),
    });
  const section = (/** @type {string} */ id, /** @type {string} */ heading, /** @type {any} */ body) =>
    h('section', { key: id, className: 'site-trends__section', 'aria-labelledby': id }, h('h2', { id }, heading), body);

  // Keyed, so the notice and the tiles coming and going never make React redraw the charts after them.
  return h(
    'div',
    { className: 'site-trends' },
    rangeNode(range, data.onRange),
    data.failed && h('div', { key: 'notice', className: 'wb-notice', role: 'status' }, h('p', null, NOT_LOADED)),
    nowNode(answers[LATEST], at[LATEST]),
    section(
      'trends-species',
      SPECIES,
      stackNode({
        counts,
        granularity: range.counts.granularity,
        caption: range.counts.granularity === 'week' ? PER_WEEK : PER_DAY,
        span: range.span,
        size: sizes.species,
        chartRef: refs.species,
        after: csvNode(SPECIES_FILE, range),
      }),
    ),
    section('trends-water', WATER, h('div', { className: 'site-trends__charts' }, WATER_CHARTS.map(line))),
    section('trends-weather', WEATHER, h('div', { className: 'site-trends__charts' }, WEATHER_CHARTS.map(line))),
  );
};
