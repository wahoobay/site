// A species page's live numbers (/live/species/<slug>/, src/pages/live/species/[slug].astro): what the SpeciesLive
// island (src/islands/SpeciesLive.tsx) makes of the species' profile on the fish-ID app (GET /api/public/species/{id}:
// the list's entry plus by_hour, by_month and recent) and what it draws. A plain module with no DOM and no React, so
// the tests read it without a build or a browser (tests/species-live.test.mjs).
// renderState is the island's render, a small VDOM (h in src/lib/vdom.mjs) with React's prop names, which the island
// hands to React (toReact, src/islands/live-shared.ts). Its three states:
// - not loaded yet (the build, and until the profile arrives): the three tiles with the snapshot's numbers, the page's
//   own (src/data/fish.json), and "Last seen" as a date, since the build cannot know how long ago it will be read;
// - loaded ('ok'): the tiles with the profile's numbers and "Last seen" as how long ago; "When we see it", the day's
//   hours and the last twelve months as the design's bar charts (src/lib/chart.mjs); the twelve most recent crops;
// - failed ('error', any ApiError: a 404, a 5xx, no answer): the snapshot's numbers stay, and the design's notice says
//   so, once (Review Focus 3).
// Colour and type are the design's classes; nothing here sets a style. The one detector waiver is the design's own,
// on the tiles' numbers (tileNode).
import { chartNode } from './chart.mjs';
import { relativeTime } from './public-api.mjs';
import { h } from './vdom.mjs';

// The words, all new.
// katie: review: a stat tile's label, new words (how often the reef camera has seen the species, in all)
const SEEN_TOTAL = 'Seen in total';
// katie: review: a stat tile's label, new words (when the reef camera last saw it: a date, or "3 h ago")
const LAST_SEEN = 'Last seen';
// katie: review: a stat tile's label, new words (how often the camera saw it in the last seven days)
const THIS_WEEK = 'This week';
// katie: review: a new heading (the species' two charts: the hours of the day and the months it is seen in)
const WHEN = 'When we see it';
// katie: review: a chart's caption, new words (sightings by the hour of the day, Wahoo Bay's time)
const BY_HOUR = 'By hour of day';
// katie: review: a chart's caption, new words (sightings in each of the last twelve months)
const BY_MONTH = 'By month';
// katie: review: a new heading (the camera's most recent pictures of the species)
const RECENT = 'Recent sightings';
// katie: review: a new sentence (the notice when the live numbers did not load: the page keeps those it was built with)
const NOT_LOADED = 'The latest numbers did not load. These are from the last update of this page.';

/** How many of the most recent crops the page shows (the profile's `recent` has up to twelve). */
export const RECENT_MAX = 12;

/** @typedef {import('./vdom.mjs').VNode} VNode */
/** @typedef {{ width: number, height: number }} Size */
/**
 * A species' numbers: the snapshot's (the page's own, from src/data/fish.json) or the profile's.
 * @typedef {{ sightings_total: number | null, sightings_7d: number | null, last_seen: string | null }} Numbers
 */

/**
 * The profile's path under /api/public: the species id as one path segment (108 of the fish-ID app's 112 ids have a
 * space, "Ablennes hians").
 * @param {string} speciesId
 */
export const profilePath = (speciesId) => `/species/${encodeURIComponent(speciesId)}`;

const count = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isTime = (/** @type {unknown} */ v) => typeof v === 'string' && Number.isFinite(Date.parse(v));

// A date as Wahoo Bay has it, "Oct 30": the camera is in Florida.
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

/**
 * The three tiles: seen in total, last seen and this week. "Last seen" is a date ("Oct 30") until the island knows the
 * time (`now`), then how long ago ("3 h ago"); a species never seen has no "Last seen" tile.
 * @param {Partial<Numbers> | null | undefined} numbers
 * @param {number | null} now epoch milliseconds, or null while the time is not known (the build)
 * @returns {{ k: string, v: string }[]}
 */
export const speciesTiles = (numbers, now) => {
  const last = numbers?.last_seen;
  const lastSeen = isTime(last) ? (now === null ? DATE.format(new Date(/** @type {string} */ (last))) : relativeTime(/** @type {string} */ (last), now)) : null;
  return [
    { k: SEEN_TOTAL, v: (count(numbers?.sightings_total) ?? 0).toLocaleString('en-US') },
    ...(lastSeen ? [{ k: LAST_SEEN, v: lastSeen }] : []),
    { k: THIS_WEEK, v: (count(numbers?.sightings_7d) ?? 0).toLocaleString('en-US') },
  ];
};

/**
 * The profile's numbers, each the snapshot's where the profile lacks it.
 * @param {any} profile
 * @param {Partial<Numbers> | undefined} snapshot
 * @returns {Partial<Numbers>}
 */
const numbersOf = (profile, snapshot) => ({
  sightings_total: count(profile.sightings_total) ?? snapshot?.sightings_total ?? null,
  sightings_7d: count(profile.sightings_7d) ?? snapshot?.sightings_7d ?? null,
  last_seen: isTime(profile.last_seen) ? profile.last_seen : snapshot?.last_seen ?? null,
});

const HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

/**
 * A chart of the species alone, in the shape of the live page's species counts (src/lib/chart.mjs): its buckets
 * and one series, named as the page names the species.
 * @param {any} profile
 * @param {string} name
 * @param {string[]} buckets
 * @param {unknown[]} counts
 */
const oneSeries = (profile, name, buckets, counts) => ({
  buckets,
  series: [{ species_id: profile.species_id ?? null, latin: profile.latin ?? null, common: name, counts }],
});

/**
 * The profile's sightings by the hour of the day (by_hour, 24 counts, Wahoo Bay's hours) as the chart module's
 * buckets ("00:00" to "23:00"); null without them.
 * @param {any} profile
 * @param {string} name
 */
export const hourCounts = (profile, name) =>
  Array.isArray(profile?.by_hour) && profile.by_hour.length === 24 ? oneSeries(profile, name, HOURS, profile.by_hour) : null;

/**
 * The profile's sightings in each of the last twelve months (by_month, [{ month: "2026-09", sightings }]) as the chart
 * module's buckets; null without them.
 * @param {any} profile
 * @param {string} name
 */
export const monthCounts = (profile, name) => {
  if (!Array.isArray(profile?.by_month)) return null;
  const months = profile.by_month.filter((/** @type {any} */ m) => m && typeof m.month === 'string');
  return oneSeries(
    profile,
    name,
    months.map((/** @type {any} */ m) => m.month),
    months.map((/** @type {any} */ m) => m.sightings),
  );
};

// The number carries the design's sanctioned detector waiver, as on its docs page: brand blue on white is 3.8:1, and
// --wb-text-2xl at weight 800 is large text (3:1), which the detector cannot tell from a clamp() size. The server
// renders these tiles, so the detector reads them.
/** @param {{ k: string, v: string }} t */
const tileNode = (t) =>
  h(
    'div',
    { key: t.k, className: 'wb-tile' },
    h('p', { className: 'wb-tile__k' }, t.k),
    h('p', { className: 'wb-tile__v', 'data-impeccable-ignore': 'low-contrast' }, t.v),
  );

/**
 * What the island has to draw with; every field is optional.
 * @typedef {object} RenderData
 * @property {string} [name] the species as the page names it (its common name, else its Latin): the charts' series
 * @property {Partial<Numbers>} [snapshot] the page's numbers, from src/data/fish.json
 * @property {any} [profile] GET /api/public/species/{id}
 * @property {number} [now] epoch milliseconds, when the profile arrived
 * @property {string[]} [failed] the crops that did not load: left out
 * @property {(src: string) => void} [onCropError] told which crop did not load
 * @property {Size | null} [hourSize] the hours chart's SVG as measured
 * @property {any} [hourRef] React's ref for the hours chart's SVG
 * @property {Size | null} [monthSize] the months chart's SVG as measured
 * @property {any} [monthRef] React's ref for the months chart's SVG
 */

/**
 * The island's render: null before the profile has loaded, 'ok' once it has, 'error' when it failed.
 * @param {'ok' | 'error' | null} status
 * @param {RenderData} [data]
 * @returns {VNode}
 */
export const renderState = (status, data = {}) => {
  const profile = status === 'ok' && data.profile && typeof data.profile === 'object' ? data.profile : null;
  const numbers = profile ? numbersOf(profile, data.snapshot) : data.snapshot;
  const tiles = h('div', { className: 'site-species-live__tiles' }, speciesTiles(numbers, profile ? (data.now ?? null) : null).map(tileNode));
  if (status === 'error') return h('div', { className: 'site-species-live' }, tiles, h('div', { className: 'wb-notice', role: 'status' }, h('p', null, NOT_LOADED)));
  if (!profile) return h('div', { className: 'site-species-live' }, tiles);

  const name = data.name ?? profile.common ?? profile.latin ?? '';
  const when = h(
    'div',
    { className: 'site-species-live__when' },
    h('h2', null, WHEN),
    h(
      'div',
      { className: 'site-species-live__charts' },
      chartNode({ counts: hourCounts(profile, name), chartSize: data.hourSize, chartRef: data.hourRef, caption: BY_HOUR }),
      chartNode({ counts: monthCounts(profile, name), chartSize: data.monthSize, chartRef: data.monthRef, caption: BY_MONTH }),
    ),
  );
  const failed = new Set(data.failed ?? []);
  const crops = (Array.isArray(profile.recent) ? profile.recent : [])
    .filter((/** @type {any} */ r) => r && typeof r.crop === 'string' && !failed.has(r.crop))
    .slice(0, RECENT_MAX);
  const recent =
    crops.length > 0 &&
    h(
      'div',
      { className: 'site-species-live__recent' },
      h('h2', null, RECENT),
      h(
        'ul',
        { className: 'site-species-live__crops', role: 'list' },
        crops.map((/** @type {any} */ r) =>
          h(
            'li',
            { key: r.crop },
            h(
              'figure',
              null,
              h('img', { className: 'wb-media site-species-live__crop', src: r.crop, alt: '', loading: 'lazy', decoding: 'async', onError: () => data.onCropError?.(r.crop) }),
              h('figcaption', { className: 'wb-caption' }, relativeTime(r.ts, data.now ?? Number.NaN)),
            ),
          ),
        ),
      ),
    );
  return h('div', { className: 'site-species-live' }, tiles, when, recent);
};
