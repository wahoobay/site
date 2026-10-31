// The fish-ID species snapshot: `npm run sync:fish` (scripts/sync-fish.mjs) reads the fish-ID app's public species list
// and writes src/data/fish.json, by hand, never in CI. These tests fake the API; they never touch the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FISH_KEYS, assertNoLeak, cleanPhotoUrl, main, selectFish, toFish } from '../scripts/sync-fish.mjs';

const read = (file) => readFileSync(file, 'utf8');

// A row of GET /api/public/species, with fields the snapshot must never carry.
const row = (over = {}) => ({
  species_id: 'abudefduf-saxatilis',
  latin: 'Abudefduf saxatilis',
  common: 'Sergeant major',
  family: 'Pomacentridae',
  order: 'Ovalentaria incertae sedis',
  aphia_id: 159795,
  photo: { url: '/api/public/species/abudefduf-saxatilis/photo.jpg', attribution: '(c) A. Diver, some rights reserved (CC BY)', license: 'cc-by', observer: 'diver42' },
  latest_crop: '/api/public/detections/987/crop.jpg',
  sightings_total: 412,
  sightings_7d: 18,
  first_seen: '2026-03-01T10:00:00-05:00',
  last_seen: '2026-10-31T08:15:00-04:00',
  reviewer: 'someone',
  notes: 'a note',
  ...over,
});

test('the snapshot keeps exactly the public list\'s keys (Task 2, Ruling 17), and only url and attribution of a photo', () => {
  assert.deepEqual([...FISH_KEYS].sort(), ['aphia_id', 'common', 'family', 'first_seen', 'last_seen', 'latest_crop', 'latin', 'order', 'photo', 'sightings_7d', 'sightings_total', 'species_id']);
  assert.deepEqual(toFish(row()), {
    species_id: 'abudefduf-saxatilis',
    latin: 'Abudefduf saxatilis',
    common: 'Sergeant major',
    family: 'Pomacentridae',
    order: 'Ovalentaria incertae sedis',
    aphia_id: 159795,
    photo: { url: '/api/public/species/abudefduf-saxatilis/photo.jpg', attribution: '(c) A. Diver, some rights reserved (CC BY)' },
    latest_crop: '/api/public/detections/987/crop.jpg',
    sightings_total: 412,
    sightings_7d: 18,
    first_seen: '2026-03-01T10:00:00-05:00',
    last_seen: '2026-10-31T08:15:00-04:00',
  });
  const sparse = toFish({ species_id: 'x', latin: ' Haemulon sciurus ' });
  assert.deepEqual(sparse, {
    species_id: 'x',
    latin: 'Haemulon sciurus',
    common: null,
    family: null,
    order: null,
    aphia_id: null,
    photo: null,
    latest_crop: null,
    sightings_total: null,
    sightings_7d: null,
    first_seen: null,
    last_seen: null,
  }, 'a field the API leaves out is null');
  assert.equal(toFish({ latin: 'Haemulon sciurus' }), null, 'no species id, no row');
  assert.equal(toFish({ species_id: 'x', latin: '  ' }), null, 'no scientific name, no row');
});

test('a photo is kept only on the allow-list: a path under /api/public/, or https on the four hosts', () => {
  for (const url of [
    '/api/public/species/abudefduf-saxatilis/photo.jpg',
    'https://inaturalist-open-data.s3.amazonaws.com/photos/123/medium.jpg',
    'https://static.inaturalist.org/photos/123/medium.jpg?1545345',
    'https://staging-ai.wahoobay.net/api/public/species/x/photo.jpg',
    'https://ai.wahoobay.net/api/public/species/x/photo.jpg',
  ])
    assert.equal(cleanPhotoUrl(url), url, url);
  for (const url of [
    'http://static.inaturalist.org/photos/123/medium.jpg',
    'https://example.org/fish.jpg',
    'https://user:pw@static.inaturalist.org/photos/1.jpg',
    'https://static.inaturalist.org:8443/photos/1.jpg',
    '/api/review/frames/1.jpg',
    '/api/public/../review/1.jpg',
    '//static.inaturalist.org/photos/1.jpg',
    'not a link',
    null,
  ])
    assert.equal(cleanPhotoUrl(url), null, String(url));
  assert.equal(toFish(row({ photo: { url: 'https://example.org/fish.jpg', attribution: 'x' } })).photo, null, 'a photo off the list is left out');
  assert.equal(toFish(row({ latest_crop: 'https://example.org/1.jpg' })).latest_crop, null, 'a crop is a path under /api/public/detections/');
  assert.equal(toFish(row({ photo: { url: '/api/public/species/x/photo.jpg' } })).photo.attribution, null);
});

test('the sync refuses to write a key off the whitelist, ?key=, a user in a link, or an e-mail address', () => {
  const ok = selectFish([row()]).fish;
  assert.doesNotThrow(() => assertNoLeak(ok));
  const leaks = [
    [{ ...ok[0], reviewer: 'someone' }, /species abudefduf-saxatilis: key "reviewer"/],
    [{ ...ok[0], photo: { ...ok[0].photo, observer: 'diver42' } }, /key "photo\.observer"/],
    [{ ...ok[0], photo: { ...ok[0].photo, url: 'https://static.inaturalist.org/p.jpg?key=abc123' } }, /"photo\.url"/],
    [{ ...ok[0], photo: { ...ok[0].photo, attribution: 'see https://diver:pw@example.org/x' } }, /"photo\.attribution"/],
    [{ ...ok[0], common: 'Write to a.diver@example.org' }, /"common"/],
    [{ ...ok[0], latest_crop: '/api/public/detections/1/crop.jpg?KEY=x' }, /"latest_crop"/],
    [{ ...ok[0], photo: { ...ok[0].photo, url: 'https://ai.wahoobay.net/p.jpg?w=1&api_key=abc123' } }, /"photo\.url"/],
    [{ ...ok[0], photo: { ...ok[0].photo, url: '//diver:pw@static.inaturalist.org/p.jpg' } }, /"photo\.url"/],
    [{ ...ok[0], species_id: 'Abudefduf saxatilis', common: 'a.diver@example.org' }, /species Abudefduf saxatilis: "common"/],
    [{ ...ok[0], species_id: 'a.diver@example.org' }, /species #1: "species_id"/],
  ];
  for (const [bad, message] of leaks) {
    assert.throws(() => assertNoLeak([bad]), (err) => {
      assert.match(err.message, message);
      assert.match(err.message, /nothing written/);
      assert.ok(!/abc123|diver:pw|a\.diver@|diver42|someone/.test(err.message), 'the message never carries the value');
      return true;
    });
  }
});

test('the snapshot is sorted by scientific name, one entry a species: two ids of one name are merged (Ruling 32)', () => {
  const rows = [
    row({ species_id: 'b', latin: 'Haemulon sciurus' }),
    row({ species_id: 'a', latin: 'Abudefduf saxatilis' }),
    { species_id: 'nameless' },
    row({ species_id: 'c', latin: 'Acanthurus chirurgus' }),
  ];
  const { fish, dropped, merged } = selectFish(rows);
  assert.deepEqual(fish.map((f) => f.latin), ['Abudefduf saxatilis', 'Acanthurus chirurgus', 'Haemulon sciurus']);
  assert.deepEqual([dropped, merged], [1, 0]);
  const two = selectFish([
    row({ species_id: 'Abudefduf saxatilis', sightings_total: 2, sightings_7d: 2, last_seen: '2026-10-29T22:13:59.297526+00:00' }),
    row({ species_id: 'abudefduf_saxatilis', latin: 'Abudefduf Saxatilis', sightings_total: 8, sightings_7d: 8, last_seen: '2026-10-25T15:44:01.364629+00:00' }),
  ]);
  assert.deepEqual(two.fish.map((f) => [f.species_id, f.sightings_total, f.sightings_7d]), [['Abudefduf saxatilis', 10, 10]]);
  assert.equal(two.merged, 1);
  // The header and the README say so.
  const header = read('scripts/sync-fish.mjs').slice(0, 3000).replace(/\n\/\/ ?/g, ' ');
  assert.match(header, /two ids[\s\S]*seen most recently[\s\S]*summed/);
  assert.match(read('README.md'), /sync:fish[\s\S]*two ids[\s\S]*seen most recently/);
});

const answer = (body, status = 200) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

test('main writes src/data/fish.json from the API and prints counts only', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-fish-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = pathToFileURL(join(dir, 'fish.json'));
  const logged = [];
  t.mock.method(console, 'log', (...args) => logged.push(args.join(' ')));
  const asked = [];
  const get = async (url, init) => {
    asked.push(url);
    assert.ok(init?.signal, 'with a timeout');
    return answer({ species: [row({ species_id: 'b', latin: 'Haemulon sciurus', photo: { url: 'https://example.org/x.jpg', attribution: 'x' } }), row()] })();
  };
  await main({ api: 'https://staging-ai.example/', out, get });
  assert.deepEqual(asked, ['https://staging-ai.example/api/public/species']);
  const written = JSON.parse(read(out));
  assert.deepEqual(written.map((f) => f.species_id), ['abudefduf-saxatilis', 'b']);
  assert.equal(written[1].photo, null);
  assert.ok(read(out).endsWith('}\n]\n'));
  const log = logged.join('\n');
  assert.match(log, /species: 2 from the API, 2 kept, 0 left out \(no id or name\), 0 merged \(one species under two ids\)/);
  assert.match(log, /photos: 1 kept, 1 left out/);
  assert.doesNotMatch(log, /Abudefduf|Sergeant|Haemulon|inaturalist|example\.org|Diver/, 'no names, links or values');
});

test('main writes nothing when the API fails or a value leaks', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-fish-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = pathToFileURL(join(dir, 'fish.json'));
  t.mock.method(console, 'log', () => {});
  await assert.rejects(main({ api: 'https://x.example', out, get: answer('<html>secret page</html>', 503) }), (err) => /HTTP 503/.test(err.message) && !/secret/.test(err.message));
  await assert.rejects(main({ api: 'https://x.example', out, get: answer('<html>secret page</html>') }), (err) => /not JSON/.test(err.message) && !/secret/.test(err.message));
  await assert.rejects(main({ api: 'https://x.example', out, get: answer({ rows: [] }) }), /not a list/);
  await assert.rejects(main({ api: 'https://x.example', out, get: answer({ species: [row({ common: 'mail a.diver@example.org' })] }) }), /nothing written/);
  await assert.rejects(main({ api: 'https://x.example', out, get: answer({ species: [] }) }), /no species.*nothing written/);
  assert.equal(existsSync(out), false);
});

test('the sync runs by hand, never in CI or at build; the README documents it', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['sync:fish'], 'node scripts/sync-fish.mjs');
  assert.match(read('README.md'), /^npm run sync:fish +# .*by hand.*SYNC_API.*commit/m);
  for (const file of readdirSync('.github/workflows')) assert.doesNotMatch(read(`.github/workflows/${file}`), /sync[-:]fish/, file);
  for (const script of ['build', 'test', 'check', 'check:links']) assert.doesNotMatch(pkg.scripts[script], /sync/, script);
  assert.match(read('scripts/sync-fish.mjs'), /process\.env\.SYNC_API \?\? 'https:\/\/staging-ai\.wahoobay\.net'/);
});
