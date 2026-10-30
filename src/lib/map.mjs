// The park map (/visit/map/): its opening view and the markers it draws from the committed snapshot of the Java API's
// datasource list, src/data/datasources.json (scripts/sync-datasources.mjs writes it). A plain module, so the tests
// read it without a build (tests/map.test.mjs); the island (src/islands/ParkMap.tsx) imports the view from it.

/** The old page's opening view (wahoobay-net-frontend, src/pages/other/MapBox.js): its centre, [longitude, latitude]. */
export const MAP_CENTER = [-80.0853, 26.265];
/** The old page's zoom. */
export const MAP_ZOOM = 13.5;
/**
 * Mapbox's satellite streets style: the old page's own style belongs to an account nobody here holds, and a Wahoo Bay
 * style is a later change.
 */
export const MAP_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

// The video the /live/ page embeds (src/content/live/camera.md); the page passes the entry's own, and the tests hold
// the two the same.
const LIVE_VIDEO = 'oBTGY6Ax870';

// The datasource type of a camera (the old page's `type === 8`); every other type is a sensor.
const CAMERA = 8;

/**
 * One marker per row of the snapshot: a camera (type 8) links the /live/ page when its stream is the one that page
 * embeds (or it has none), else its stream on YouTube; a sensor links the data dashboards.
 * @param {{ id: number, name: string, type: number, lat: number, lon: number, video?: string }[]} rows
 * @param {string} [live] the video id the /live/ page embeds
 * @returns {{ id: number, name: string, kind: 'camera' | 'sensor', lat: number, lon: number, href: string }[]}
 */
export const markersFrom = (rows, live = LIVE_VIDEO) =>
  rows.map(({ id, name, type, lat, lon, video }) => {
    if (type !== CAMERA) return { id, name, kind: 'sensor', lat, lon, href: '/live/data/' };
    const href = !video || video === live ? '/live/' : `https://www.youtube.com/watch?v=${video}`;
    return { id, name, kind: 'camera', lat, lon, href };
  });
