// The park map at /visit/map/: the committed snapshot of the Java API's datasource list (src/data/datasources.json,
// written by hand with `npm run sync:datasources`), the markers src/lib/map.mjs draws from it, and the built page.
// The page tests read dist/ (run `npm run build` first). A build without PUBLIC_MAPBOX_TOKEN shows the map's still;
// one with it (`PUBLIC_MAPBOX_TOKEN=pk.test npm run build && PUBLIC_MAPBOX_TOKEN=pk.test npm test`) renders the island.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MAP_CENTER, MAP_STYLE, MAP_ZOOM, markersFrom } from '../src/lib/map.mjs';
import { assertNoLeak, selectDatasources, toDatasource } from '../scripts/sync-datasources.mjs';

const read = (file) => readFileSync(file, 'utf8');
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const datasources = JSON.parse(read('src/data/datasources.json'));
const liveVideo = read('src/content/live/camera.md').match(/^video:\s*(\S+)\s*$/m)?.[1];
// The picture's description: the one the page's text gave the old site's picture, which showed the same three sites
// (tests/content.test.mjs asks for a real description). The picture is a still of the island (public/images/map.jpg).
const ALT = 'An aerial view of the Hillsboro Inlet, with markers for the Wahoo Bay weather station, water quality sensor and camera';

test('markersFrom keeps cameras and sensors with the right links', () => {
  const rows = [{ id: 1, name: 'Weather station', type: 1, lat: 26.26, lon: -80.08 }, { id: 8, name: 'SeaHIVE', type: 8, lat: 26.27, lon: -80.09, video: 'oBTGY6Ax870' }, { id: 9, name: 'Pier', type: 8, lat: 26.28, lon: -80.1, video: 'mV8zVsX_o_0' }];
  const m = markersFrom(rows);
  assert.deepEqual(m.map((x) => [x.kind, x.href]), [['sensor', '/live/data/'], ['camera', '/live/'], ['camera', 'https://www.youtube.com/watch?v=mV8zVsX_o_0']]);
});

test('the datasource snapshot holds only id, name, type, lat, lon and a camera video id', () => {
  for (const r of JSON.parse(readFileSync('src/data/datasources.json', 'utf8'))) {
    const keys = Object.keys(r).sort();
    assert.ok(keys.join() === 'id,lat,lon,name,type' || keys.join() === 'id,lat,lon,name,type,video');
  }
});

test('without a token the map page shows the static image and no island', () => {
  const html = readFileSync('dist/visit/map/index.html', 'utf8');
  if (!process.env.PUBLIC_MAPBOX_TOKEN) { assert.match(html, /\/images\/map\.jpg/); assert.doesNotMatch(html, /<astro-island/); }
  else assert.match(html, /<astro-island[^>]+component-export="default"/);
});

test('a marker is the row\'s id, name and place, its kind, and its link; the live camera is the /live/ page\'s', () => {
  assert.equal(liveVideo, 'oBTGY6Ax870', 'src/content/live/camera.md embeds the SeaHIVE stream');
  const [camera] = markersFrom([{ id: 5, name: 'Reef camera', type: 8, lat: 26.26, lon: -80.08, video: liveVideo }]);
  assert.deepEqual(camera, { id: 5, name: 'Reef camera', kind: 'camera', lat: 26.26, lon: -80.08, href: '/live/' });
  // The page passes the camera entry's video: another stream there makes that camera the /live/ one.
  assert.equal(markersFrom([{ id: 6, name: 'Pier', type: 8, lat: 1, lon: 2, video: 'mV8zVsX_o_0' }], 'mV8zVsX_o_0')[0].href, '/live/');
  assert.equal(markersFrom([{ id: 7, name: 'No stream', type: 8, lat: 1, lon: 2 }])[0].href, '/live/', 'a camera without a video id links the camera page');
  for (const type of [1, 2, 3, 9]) assert.equal(markersFrom([{ id: 1, name: 'x', type, lat: 1, lon: 2 }])[0].kind, 'sensor', `type ${type}`);
});

test('the map opens on the old page\'s view, over Mapbox satellite streets', () => {
  assert.deepEqual(MAP_CENTER, [-80.0853, 26.265]);
  assert.equal(MAP_ZOOM, 13.5);
  assert.equal(MAP_STYLE, 'mapbox://styles/mapbox/satellite-streets-v12');
});

test('the snapshot: unique ids, a camera and a sensor, every place near the park, every video a YouTube id', () => {
  assert.ok(datasources.length >= 2, `${datasources.length} rows`);
  assert.equal(new Set(datasources.map((r) => r.id)).size, datasources.length);
  assert.ok(datasources.some((r) => r.type === 8) && datasources.some((r) => r.type !== 8));
  for (const r of datasources) {
    assert.ok(Number.isInteger(r.id) && Number.isInteger(r.type), `${r.id}: integer id and type`);
    assert.ok(typeof r.name === 'string' && r.name.length > 0 && r.name.length <= 80, `${r.id}: a name`);
    // Within about 10 km of the map's centre: a row at 0,0 (a feed with no place) or elsewhere is not on this map.
    assert.ok(Math.abs(r.lat - MAP_CENTER[1]) < 0.1 && Math.abs(r.lon - MAP_CENTER[0]) < 0.1, `${r.id}: at the park`);
    if ('video' in r) assert.match(r.video, /^[\w-]{11}$/, `${r.id}: a YouTube video id`);
    if ('video' in r) assert.equal(r.type, 8, `${r.id}: only a camera has a video`);
  }
  assert.ok(!datasources.some((r) => r.id === 6), 'the Pompano Pier camera, which the old site took down, is left out');
  assert.deepEqual(datasources.map((r) => r.id), datasources.map((r) => r.id).sort((a, b) => a - b), 'in id order');
});

test('the sync keeps the whitelist, reads lng as lon, and takes a camera\'s link as its video id only', () => {
  const key = 'abcdefghijklmnopqrstuvwxyz012345';
  const sensor = { id: 1, name: ' Weather station ', type: 1, lat: 26.2603, lng: -80.0834, link: `https://example.test/feed?apikey=${key}`, status: 1, apikey: key };
  assert.deepEqual(toDatasource(sensor), { id: 1, name: 'Weather station', type: 1, lat: 26.2603, lon: -80.0834 });
  const camera = { id: 5, name: 'Reef camera', type: 8, lat: 26.2604, lng: -80.0837, link: 'oBTGY6Ax870', status: 1 };
  assert.deepEqual(toDatasource(camera), { id: 5, name: 'Reef camera', type: 8, lat: 26.2604, lon: -80.0837, video: 'oBTGY6Ax870' });
  assert.equal(toDatasource({ ...camera, link: 'https://www.youtube.com/watch?v=oBTGY6Ax870' }).video, 'oBTGY6Ax870', 'a YouTube address gives its id');
  assert.equal(toDatasource({ ...camera, link: `https://example.test/stream?token=${key}` }), null, 'a camera link that is not YouTube is never written');
  assert.equal(toDatasource({ ...sensor, lat: 0, lng: 0 }), null, 'a feed at 0,0 has no place on the map');
  assert.equal(toDatasource({ ...sensor, lat: null }), null);
  assert.equal(toDatasource({ ...sensor, name: 'https://example.test/x' }), null, 'a name that reads as an address is not a name');
});

test('the sync leaves out the cameras the old site took down and the rows with no place, and sorts by id', () => {
  const rows = [
    { id: 6, name: 'Pier camera', type: 8, lat: 26.2349, lng: -80.0864, link: 'mV8zVsX_o_0' },
    { id: 3, name: 'Water quality', type: 2, lat: 26.2603, lng: -80.0834, link: 'https://example.test/water' },
    { id: 2, name: 'weather_feed', type: 9, lat: 0, lng: 0, link: 'https://example.test/feed?apikey=x' },
    { id: 1, name: 'Weather station', type: 1, lat: 26.2603, lng: -80.0834, link: 'https://example.test/weather' },
  ];
  const { kept, excluded } = selectDatasources(rows);
  assert.deepEqual(kept.map((r) => r.id), [1, 3]);
  assert.deepEqual(excluded, [{ id: 2, reason: 'no place on the map' }, { id: 6, reason: 'camera taken down on the old site' }]);
});

test('the sync refuses to write a snapshot that holds any other field\'s value', () => {
  const key = 'abcdefghijklmnopqrstuvwxyz012345';
  const rows = [{ id: 1, name: 'Weather station', type: 1, lat: 26.2603, lng: -80.0834, link: `https://example.test/feed?apikey=${key}` }];
  assert.doesNotThrow(() => assertNoLeak(rows, JSON.stringify([toDatasource(rows[0])])));
  assert.throws(() => assertNoLeak(rows, JSON.stringify([{ id: 1, name: key }])), /nothing written/);
  assert.throws(() => assertNoLeak(rows, JSON.stringify([{ id: 1, name: `https://example.test/feed?apikey=${key}` }])), /nothing written/);
  // The message names the row and the field, never the value.
  assert.throws(() => assertNoLeak(rows, key), (err) => !err.message.includes(key));
});

test('the page without a token: the still where the page\'s picture was, the page\'s copy after it, no Mapbox', { skip: Boolean(process.env.PUBLIC_MAPBOX_TOKEN) }, () => {
  const html = read('dist/visit/map/index.html');
  const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  // Final review, Important 1: the sentence that says the interactive map is to come is the picture's caption, so it
  // is on the page only while the page shows the picture.
  const still = `<img class="wb-media site-map__still" src="/images/map.jpg" width="1316" height="1076" alt="${ALT}" loading="lazy" decoding="async">`;
  const caption = '<p class="wb-caption site-map__caption">The interactive map returns in a later update of this site.</p>';
  assert.match(main, new RegExp(`</p>${escapeRe(still)}(<!--[^>]*-->)?${escapeRe(caption)}<div class="wb-prose site-article__body">`), 'the still and its caption, after the lead and before the text');
  assert.match(main, /<p class="wb-lead">[^<]*<\/p><img class="wb-media site-map__still"/);
  assert.equal((main.match(/\/images\/map\.jpg/g) || []).length, 1, 'the picture once');
  for (const site of ['Wahoo Bay Camera', 'Pompano Pier Camera', 'Wahoo Bay Weather Station', 'Wahoo Bay Water Quality']) assert.ok(main.includes(`<li>${site}</li>`), site);
  assert.equal((main.match(/returns in a later update/g) || []).length, 1, 'the sentence once, as the caption');
  assert.doesNotMatch(html, /mapbox/i, 'no Mapbox script, stylesheet or token on the page');
  assert.doesNotMatch(html, /<noscript/);
});

test('the page with a token: the island on view, its still for readers without script', { skip: !process.env.PUBLIC_MAPBOX_TOKEN }, () => {
  const html = read('dist/visit/map/index.html');
  const island = html.match(/<astro-island\b[^>]*>[\s\S]*?<\/astro-island>/)?.[0] ?? '';
  assert.match(island, /\bclient="visible"/);
  assert.match(island, /<div class="wb-map site-map" role="region" aria-label="Map of Wahoo Bay">/);
  assert.match(island, /<p class="site-map__status" role="status">Loading the map…<\/p>/);
  assert.ok(html.includes(`</astro-island><noscript><img class="wb-media site-map__still" src="/images/map.jpg" width="1316" height="1076" alt="${ALT}"></noscript><div class="wb-prose site-article__body">`), 'the still in a noscript, before the text');
  // One prop per marker of the snapshot (Astro serialises the props into the island's attribute).
  const props = island.match(/\bprops="([^"]*)"/)?.[1].replaceAll('&quot;', '"') ?? '';
  for (const r of datasources) assert.ok(props.includes(`"name":[0,"${r.name}"]`), r.name);
  // Final review, Important 1: with the map on the page, nothing says it is still to come.
  const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  assert.doesNotMatch(main, /returns in a later update/);
});

test('the new words are the island\'s and are marked for Katie; only the island loads Mapbox GL and its stylesheet', () => {
  const island = read('src/islands/ParkMap.tsx');
  for (const words of ['Watch live', 'Open on YouTube', 'See the data', 'Loading the map…', 'The map could not load.']) {
    const at = island.indexOf(`'${words}'`);
    assert.ok(at > 0, words);
    assert.match(island.slice(Math.max(0, island.lastIndexOf('\n', at - 1) - 160), at), /katie: review/, `${words} is marked`);
  }
  assert.doesNotMatch(island, /\bstyle=\{|\.style\.|setAttribute\(['"]style/, 'no inline styles of the island\'s own');
  assert.match(island, /^import mapboxCss from 'mapbox-gl\/dist\/mapbox-gl\.css\?url';$/m, 'the stylesheet comes with the island\'s script');
  assert.match(island, /import\('mapbox-gl'\)/, 'Mapbox GL loads only when the island runs');
  const files = readdirSync('src', { recursive: true }).filter((f) => /\.(astro|tsx?|mjs|css|md)$/.test(f));
  const users = files.filter((f) => /mapbox-gl/.test(read(join('src', f))));
  assert.deepEqual(users, [join('islands', 'ParkMap.tsx')]);
  assert.match(JSON.parse(read('package.json')).dependencies['mapbox-gl'], /^3\.\d+\.\d+$/, 'pinned to one 3.x release');
});

// Ruling Q: a sensor's marker was the accent's chip (the accent means alive right now) and a camera's the live badge.
// A marker is the design's map pin now (@wahoobay/design 0.2.2): .wb-marker in action blue, a camera's the accent
// (.wb-marker--camera), in a 44px target, named by its place; the place's name is the popup's title.
test('a marker is the design\'s map pin, a camera\'s the live variant; no chip or live badge on the map', () => {
  const island = read('src/islands/ParkMap.tsx');
  const marker = island.slice(island.indexOf('const markerElement'), island.indexOf('const panelElement'));
  assert.ok(marker.length > 0, 'markerElement');
  assert.match(marker, /el\.className = m\.kind === 'camera' \? 'wb-marker wb-marker--camera' : 'wb-marker';/);
  assert.match(marker, /el\.setAttribute\('aria-label', m\.name\);/);
  assert.doesNotMatch(marker, /textContent/, 'a pin, not a label: the name is the popup\'s');
  assert.doesNotMatch(island, /wb-chip|wb-live|pulsing-dot|site-map__marker/);
  // Stacked places sit a whole target apart, so no marker's 44px target covers another's.
  assert.match(island, /^const STACK_STEP = 44;/m);
  assert.doesNotMatch(read('src/styles/site.css'), /site-map__marker/, 'the pin is the design\'s, cursor and all');
  const design = read('node_modules/@wahoobay/design/dist/components.css');
  assert.match(design, /\.wb-marker::before\s*\{[^}]*background:\s*var\(--wb-color-action\)/);
  assert.match(design, /\.wb-marker--camera::before\s*\{[^}]*background:\s*var\(--wb-color-accent\)/);
  assert.match(design, /\.wb-map \.mapboxgl-popup-content/, 'the map\'s popups in the system\'s face');
});

// Astro drops a stylesheet an island imports dynamically from the client build, and the island's preload of it 404s:
// every file the island's chunk names must be in dist/ (Mapbox GL's chunk and stylesheet among them).
test('the built island names only files that are in dist/, Mapbox GL\'s script and stylesheet among them', () => {
  const chunk = readdirSync('dist/_astro').find((f) => /^ParkMap\.[\w-]+\.js$/.test(f));
  assert.ok(chunk, 'the island is built');
  const js = read(join('dist/_astro', chunk));
  const named = [...new Set([...js.matchAll(/_astro\/[\w.-]+\.(?:js|css)/g)].map((m) => m[0]))];
  assert.ok(named.some((f) => /^_astro\/mapbox-gl\.[\w-]+\.js$/.test(f)), 'Mapbox GL\'s chunk');
  assert.ok(named.some((f) => /^_astro\/mapbox-gl\.[\w-]+\.css$/.test(f)), 'Mapbox GL\'s stylesheet');
  for (const f of named) assert.ok(readdirSync('dist/_astro').includes(f.slice('_astro/'.length)), `${f} is in dist/`);
  // Only the island links it: no page's own stylesheet carries Mapbox GL's rules.
  for (const css of readdirSync('dist/_astro').filter((f) => /^Base\.[\w-]+\.css$/.test(f))) {
    assert.doesNotMatch(read(join('dist/_astro', css)), /\.mapboxgl-map\{/, css);
  }
});

test('the section shows the island only with a public token, and the map page takes it where the picture was', () => {
  const section = read('src/components/ParkMapSection.astro');
  assert.match(section, /import\.meta\.env\.PUBLIC_MAPBOX_TOKEN/);
  assert.match(section, /startsWith\('pk\.'\)/, 'a secret token (sk.…) stops the build');
  assert.match(section, /<ParkMap client:visible token=\{token\} markers=\{markers\} \/>/);
  const slug = read('src/pages/[...slug].astro');
  assert.match(slug, /'visit\/map': ParkMapSection/);
  const md = read('src/content/pages/visit/map.md');
  assert.doesNotMatch(md, /\(\/images\/map\.jpg\)/, 'the picture is the section\'s now, not the body\'s');
  assert.doesNotMatch(md, /returns in a later update/, 'the sentence is the still\'s caption, in the section');
  // The caption is new words, marked for Katie where it is written.
  const at = section.indexOf('The interactive map returns in a later update of this site.');
  assert.ok(at > 0 && section.slice(0, at).includes('{token ? ('), 'in the section, after the token test');
  assert.match(section.slice(section.lastIndexOf('\n', section.lastIndexOf('\n', at) - 1), at), /katie: review/, 'marked for Katie');
});

test('the old map addresses redirect here; the sync runs by hand, never in CI or at build', () => {
  const redirects = JSON.parse(read('redirects.json'));
  for (const from of ['/pages/map', '/pages/mapbox']) assert.equal(redirects.find((r) => r.from === from)?.to, '/visit/map/', from);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['sync:datasources'], 'node scripts/sync-datasources.mjs');
  assert.match(read('README.md'), /^npm run sync:datasources +# .*by hand.*commit/m, 'the README documents the sync');
  for (const file of readdirSync('.github/workflows')) assert.doesNotMatch(read(`.github/workflows/${file}`), /sync[-:]datasources/, file);
  for (const script of ['build', 'test', 'check', 'check:links']) assert.doesNotMatch(pkg.scripts[script], /sync/, script);
});
