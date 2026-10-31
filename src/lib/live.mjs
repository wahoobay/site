// The live camera's three islands (src/islands/LiveBadge.tsx, LivePlayer.tsx, LiveNow.tsx): what they make of the
// public API's answers, and what they draw. A plain module with no DOM and no React, so the tests read it without a
// build or a browser (tests/live.test.mjs).
// renderState is the islands' render: a small VDOM ({ type, props, children }, h below) with React's prop names, which
// each island hands to React (toReact, src/islands/live-shared.ts). Its branches (live, embed, offline, and not known
// yet) are the page's states:
// - not known yet (the build, and the first fetch): the still in the video frame, no badge, and the right-now panels an
//   empty box (LiveNow hydrates when it is on screen, client:visible, so the box must be there to be seen);
// - live: the camera's MJPEG stream in the frame with the detection boxes over it, the Live badge, the three panels;
// - embed or offline: the YouTube embed from youtube-nocookie.com, the Offline badge, the panels hidden.
// Colour and type are the design's classes. The one style is a detection box's geometry, left/top/width/height in
// percent of the frame: the design's .wb-detect contract (@wahoobay/design 0.3.1, its docs page).
import { emptyText, fahrenheit, relativeTime } from './public-api.mjs';
import { EMBED_ALLOW, embedUrl } from './video.mjs';

/** The reef camera, as the public API names it (GET /api/public/cameras). */
export const REEF_CAMERA = 'seahivecam';
/** The reef camera's still, under public/: the home band's picture, and the player's until the stream shows. */
export const REEF_STILL = { src: '/images/learn/wb-camera.jpg', width: 1600, height: 1066 };

// The words. The badge's "Live" is the old page's; the rest are new.
const LIVE = 'Live';
// katie: review: a new word (the badge when the camera's stream is not on)
const OFFLINE = 'Offline';
// katie: review: a new heading (the species the camera named in the last hour)
const SEEN_HOUR = 'Seen in the last hour';
// katie: review: a new heading (the water sensors' latest reading; its age is said under the tiles)
const WATER_NOW = 'Water right now';
// katie: review: a new heading (the chart of the week's sightings)
const SPECIES_WEEK = 'Species this week';
// katie: review: the chart's caption, new words (a sighting is a fish the camera followed for at least three frames)
const SIGHTINGS_PER_DAY = 'Sightings per day';
// katie: review: new words (the chart's sixth series: every species after the five most seen)
const OTHER = 'Other species';
// katie: review: new words before the reading's age ("Measured 5 days ago")
const MEASURED = 'Measured ';
// katie: review: the water tiles' labels, new words
const WATER = 'Water';
// katie: review
const OXYGEN = 'Oxygen';
// katie: review
const TURBIDITY = 'Turbidity';
// katie: review
const PH = 'pH';

/** @typedef {'live' | 'embed' | 'offline'} Status */
/** @typedef {{ width: number, height: number }} Size */
/**
 * A detection of GET /api/public/live: its box in frame pixels, [x1, y1, x2, y2].
 * @typedef {{ bbox: number[], confidence?: number | null, species_id?: string | null, latin?: string | null, common?: string | null }} Detection
 */
/** @typedef {{ type: string, props: Record<string, any>, children: Array<VNode | string> }} VNode */

const STATUSES = new Set(['live', 'embed', 'offline']);

/**
 * The camera's status from GET /api/public/cameras: its own, except that live without a stream to show is the embed;
 * a camera the answer does not list, a status the site does not know, or no answer at all is offline.
 * @param {any} cameras the API's answer, `{ cameras: [...] }`
 * @param {string} id
 * @returns {Status}
 */
export const statusOf = (cameras, id) => {
  const list = cameras && Array.isArray(cameras.cameras) ? cameras.cameras : [];
  const camera = list.find((c) => c && c.id === id);
  if (!camera || !STATUSES.has(camera.status)) return 'offline';
  if (camera.status === 'live' && !camera.stream_mjpeg) return 'embed';
  return camera.status;
};

/**
 * How often the player asks: the detections every second while the camera is live, the camera's status every 30 s
 * (any other status, or none yet).
 * @param {Status | null} status
 */
export const pollInterval = (status) => (status === 'live' ? 1000 : 30000);

/** How often the right-now panels refresh. */
export const panelsInterval = 60000;

/** The boxes go when the camera's frame has not changed for this long. */
export const staleAfterMs = 3000;

/**
 * Whether the frame last changed too long ago to draw its boxes.
 * @param {number} changedAt when the frame_id last changed, epoch milliseconds
 * @param {number} now
 */
export const isStale = (changedAt, now) => now - changedAt > staleAfterMs;

const percent = (/** @type {number} */ v, /** @type {number} */ total) => Math.round((v / total) * 10000) / 100;

/**
 * A box in frame pixels as left/top/width/height in percent of the rendered image, to two places. The image fills the
 * design's 16:9 frame (object-fit: cover), so a frame of another shape is scaled to cover it and cropped evenly.
 * @param {number[]} bbox [x1, y1, x2, y2] in frame pixels
 * @param {Size} frame the stream's own size
 * @param {Size} rendered the image's size on the page
 */
export const scaleBox = ([x1, y1, x2, y2], frame, rendered) => {
  const scale = Math.max(rendered.width / frame.width, rendered.height / frame.height);
  const dx = (rendered.width - frame.width * scale) / 2;
  const dy = (rendered.height - frame.height * scale) / 2;
  return {
    left: percent(x1 * scale + dx, rendered.width),
    top: percent(y1 * scale + dy, rendered.height),
    width: percent((x2 - x1) * scale, rendered.width),
    height: percent((y2 - y1) * scale, rendered.height),
  };
};

/**
 * A box's label: the common name, else the Latin (else the id), and the model's confidence as a whole percentage.
 * @param {Detection} d
 * @returns {{ name: string, small: string | null }}
 */
export const labelFor = (d) => ({
  name: d.common || d.latin || d.species_id || '',
  small: typeof d.confidence === 'number' && Number.isFinite(d.confidence) ? `${Math.round(d.confidence * 100)}%` : null,
});

/**
 * A box's identity from one poll to the next: its species and its centre to 2 % of the frame. React keeps the element
 * of a key it saw on the last poll, so a fish that stays put keeps its box and the design's fade-in plays only when a
 * box appears.
 * @param {Detection} d
 * @param {{ left: number, top: number, width: number, height: number }} box scaleBox's
 */
export const boxKey = (d, box) => {
  const step = (/** @type {number} */ v) => Math.round(v / 2) * 2;
  return `${d.species_id ?? d.latin ?? d.common ?? ''}@${step(box.left + box.width / 2)},${step(box.top + box.height / 2)}`;
};

/**
 * The boxes to draw: each detection with a four-number box, in percent of the rendered image, keyed, with its label;
 * `inside` when the box's top is within 1.5em of the frame's top, where the label above it would be cut off (the
 * design's .wb-detect--inside). None before the stream has shown a frame.
 * @param {Detection[]} detections
 * @param {Size | null | undefined} frame the stream's own size (the image's naturalWidth and naturalHeight)
 * @param {Size | null | undefined} rendered the image's size on the page
 * @param {number} em the frame's font size in pixels
 */
export const boxesFor = (detections, frame, rendered, em) => {
  if (!frame || !(frame.width > 0 && frame.height > 0) || !rendered || !(rendered.width > 0 && rendered.height > 0)) return [];
  /** @type {Map<string, number>} */
  const seen = new Map();
  return (Array.isArray(detections) ? detections : [])
    .filter((d) => d && Array.isArray(d.bbox) && d.bbox.length === 4 && d.bbox.every(Number.isFinite))
    .map((d) => {
      const box = scaleBox(d.bbox, frame, rendered);
      const base = boxKey(d, box);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { key: n > 1 ? `${base}~${n}` : base, ...box, inside: (box.top / 100) * rendered.height < 1.5 * em, ...labelFor(d) };
    });
};

const reading = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fixed = (/** @type {number | null} */ v, /** @type {number} */ places) => (v === null ? null : v.toFixed(places));

/**
 * The four water tiles from GET /api/public/environment/latest: the water temperature in °F with the °C under it, pH,
 * dissolved oxygen (% saturation) and turbidity. A missing reading, or no reading at all, is v: null.
 * @param {any} latest
 * @returns {{ k: string, v: string | null, unit: string | null, sub: string | null }[]}
 */
export const tiles = (latest) => {
  const water = latest && typeof latest === 'object' ? latest.water : null;
  const c = reading(water?.water_temp_c);
  const f = fahrenheit(c);
  return [
    { k: WATER, v: f === null ? null : String(f), unit: '°F', sub: c === null ? null : `${Math.round(c)} °C` },
    { k: PH, v: fixed(reading(water?.ph), 1), unit: null, sub: null },
    { k: OXYGEN, v: fixed(reading(water?.do_pct), 0), unit: '%', sub: null },
    { k: TURBIDITY, v: fixed(reading(water?.turbidity_fnu), 1), unit: 'FNU', sub: null },
  ];
};

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
 * A VDOM node: React's prop names; children flattened, numbers as text, null, undefined and false left out.
 * @param {string} type
 * @param {Record<string, any> | null} props
 * @param {...any} children
 * @returns {VNode}
 */
const h = (type, props, ...children) => ({
  type,
  props: props ?? {},
  children: children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false)
    .map((c) => (typeof c === 'object' ? c : String(c))),
});

/** @param {Status | null} status */
const badgeNode = (status) => {
  if (status === null || status === undefined) return null;
  // The live badge breathes (spec §4.3), so it carries the design's waiver, as in its docs; the offline one is still.
  return status === 'live'
    ? h('span', { className: 'wb-live', 'data-impeccable-ignore': 'pulsing-dot' }, LIVE)
    : h('span', { className: 'wb-live wb-live--off' }, OFFLINE);
};

/** @param {ReturnType<typeof boxesFor>[number]} b */
const boxNode = (b) =>
  h(
    'div',
    {
      key: b.key,
      className: b.inside ? 'wb-detect wb-detect--inside' : 'wb-detect',
      style: { left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` },
    },
    h('span', { className: 'wb-detect__label' }, b.name, b.small && h('small', null, b.small)),
  );

/**
 * @param {Status | null} status
 * @param {RenderData} data
 */
const playerNode = (status, data) => {
  const still = data.still ?? REEF_STILL;
  const frame = (/** @type {VNode[]} */ ...children) => h('div', { className: 'wb-video site-video site-live__player' }, ...children);
  const stillImage = h('img', { src: still.src, width: still.width, height: still.height, alt: '', ref: data.streamRef });
  if (status === null || status === undefined) return frame(stillImage);
  if (status !== 'live') {
    return frame(
      h('iframe', {
        src: embedUrl(data.embedId ?? ''),
        title: data.title,
        loading: 'lazy',
        allow: EMBED_ALLOW,
        allowFullScreen: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
      }),
    );
  }
  // While the page is hidden the image shows the still, which ends the stream's download until the page shows again.
  const boxes = data.paused ? [] : boxesFor(data.detections ?? [], data.frame, data.rendered, data.em ?? 16);
  return frame(
    data.paused ? stillImage : h('img', { src: data.stream ?? undefined, alt: '', ref: data.streamRef, onError: data.onStreamError }),
    h('div', { className: 'site-live__overlay', 'aria-hidden': 'true' }, boxes.map(boxNode)),
  );
};

/** @param {RenderData} data */
const chartNode = (data) => {
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

/**
 * @param {Status | null} status
 * @param {RenderData} data
 */
const panelsNode = (status, data) => {
  const compact = Boolean(data.compact);
  const className = compact ? 'site-live-now site-live-now--compact' : 'site-live-now';
  if (status === null || status === undefined) return h('div', { className });
  if (status !== 'live') return h('div', { className, hidden: true });
  const heading = compact ? 'h3' : 'h2';
  const species = Array.isArray(data.summary?.species) ? data.summary.species : [];
  const water = data.latest && typeof data.latest === 'object' ? data.latest.water : null;
  const shown = tiles(data.latest)
    .slice(0, compact ? 3 : 4)
    .filter((t) => t.v !== null);
  const age = water ? relativeTime(water.ts, data.now ?? Number.NaN) : null;
  return h(
    'div',
    { className },
    h(
      'div',
      { className: 'wb-panel site-live-now__panel' },
      h(heading, { className: 'wb-panel__title' }, SEEN_HOUR),
      species.length > 0
        ? h(
            'ul',
            { className: 'site-live-now__chips', role: 'list' },
            species.map((/** @type {any} */ s) =>
              h('li', { key: s.species_id }, h('span', { className: 'wb-chip' }, s.common || s.latin || s.species_id, h('small', { className: 'wb-chip__meta' }, s.count))),
            ),
          )
        : h('p', { className: 'wb-caption' }, emptyText('hour')),
    ),
    h(
      'div',
      { className: 'wb-panel site-live-now__panel' },
      h(heading, { className: 'wb-panel__title' }, WATER_NOW),
      shown.length > 0
        ? [
            h(
              'div',
              { className: 'site-live-now__tiles' },
              shown.map((t) =>
                h(
                  'div',
                  { key: t.k, className: 'wb-tile' },
                  h('p', { className: 'wb-tile__k' }, t.k),
                  // The unit is the design's small after the number; the °C is a small of its own, on its own line.
                  h('p', { className: 'wb-tile__v' }, t.v, t.unit && h('small', null, t.unit), t.sub && h('small', { className: 'site-live-now__sub' }, t.sub)),
                ),
              ),
            ),
            age && h('p', { className: 'wb-caption' }, `${MEASURED}${age}`),
          ]
        : h('p', { className: 'wb-caption' }, emptyText('water')),
    ),
    !compact &&
      h('div', { className: 'wb-panel site-live-now__panel site-live-now__panel--chart' }, h(heading, { className: 'wb-panel__title' }, SPECIES_WEEK), chartNode(data)),
  );
};

/**
 * What an island has to draw with; every field is optional.
 * @typedef {object} RenderData
 * @property {string} [embedId] the YouTube video the embed shows (the camera page's `video`)
 * @property {string} [title] the embed's title
 * @property {{ src: string, width: number, height: number }} [still] REEF_STILL by default
 * @property {string | null} [stream] the MJPEG stream's address (streamUrl in src/lib/public-api.mjs)
 * @property {Detection[]} [detections] the current frame's (GET /api/public/live)
 * @property {Size | null} [frame] the stream's own size
 * @property {Size | null} [rendered] the stream image's size on the page
 * @property {number} [em] the frame's font size in pixels
 * @property {boolean} [paused] the page is hidden: the still instead of the stream, and no boxes
 * @property {any} [streamRef] React's ref for the stream's image
 * @property {(event: any) => void} [onStreamError] the stream image's error handler
 * @property {boolean} [compact] the home band's panels: the chips and three tiles
 * @property {any} [summary] GET /api/public/detections/summary?hours=1
 * @property {any} [latest] GET /api/public/environment/latest
 * @property {any} [counts] GET /api/public/species/counts?days=7&top=5
 * @property {Size | null} [chartSize] the chart's SVG as measured
 * @property {any} [chartRef] React's ref for the chart's SVG
 * @property {number} [now] epoch milliseconds, for the reading's age
 */

/**
 * The islands' render for a status (null while it is not known): the badge (LiveBadge), the player (LivePlayer) and the
 * right-now panels (LiveNow), each a VDOM node; the badge is null until the status is known.
 * @param {Status | null} status
 * @param {RenderData} [data]
 * @returns {{ badge: VNode | null, player: VNode, panels: VNode }}
 */
export const renderState = (status, data = {}) => ({
  badge: badgeNode(status),
  player: playerNode(status, data),
  panels: panelsNode(status, data),
});
