// The species gallery at /live/species/: the committed snapshot of the Java API's species and media lists
// (src/data/, written by hand with `npm run sync:species`), the grouping in src/lib/species.mjs, and the built page.
// The page tests read dist/ (run `npm run build` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CATEGORIES, categoryId, groupByCategory, initials, mediaFor } from '../src/lib/species.mjs';
import { checkMedia, selectMedia, selectSpecies, toMedia, toSpecies } from '../scripts/sync-species.mjs';

const read = (file) => readFileSync(file, 'utf8');
const species = JSON.parse(read('src/data/species.json'));
const media = JSON.parse(read('src/data/media.json'));
const SPECIES_KEYS = ['category', 'common_name', 'conservation_status', 'family', 'id', 'scientific_name'];
const MEDIA_KEYS = ['date', 'id', 'kind', 'species_id', 'thumb', 'title', 'url'];

test('the snapshot carries only the whitelisted fields', () => {
  assert.ok(species.length >= 150);
  for (const s of species) assert.deepEqual(Object.keys(s).sort(), SPECIES_KEYS);
  for (const m of media) assert.deepEqual(Object.keys(m).sort(), MEDIA_KEYS);
  for (const m of media) assert.match(m.url, /^https:\/\//);
});

test('the snapshot holds no e-mail address, ids are unique, and every clip belongs to a listed species', () => {
  for (const row of [...species, ...media]) {
    for (const value of Object.values(row)) {
      if (typeof value === 'string') assert.doesNotMatch(value, /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i, 'an e-mail address');
    }
  }
  assert.equal(new Set(species.map((s) => s.id)).size, species.length);
  assert.equal(new Set(media.map((m) => m.id)).size, media.length);
  const ids = new Set(species.map((s) => s.id));
  for (const m of media) assert.ok(ids.has(m.species_id), `media ${m.id}: species ${m.species_id} is not listed`);
  for (const m of media) assert.ok(m.kind === 'image' || m.kind === 'video', `media ${m.id}: kind ${m.kind}`);
});

test('a thumbnail is on the API, YouTube or Drive, or there is none', () => {
  for (const m of media) {
    if (m.thumb === null) continue;
    assert.match(m.thumb, /^https:\/\/(api\.wahoobay\.net\/api\/(v1\/thumb\?u=|uploads\/)|img\.youtube\.com\/vi\/)/, `media ${m.id}`);
  }
  // The old gallery's Drive thumbnails: Drive's own thumbnail, through the API's image proxy.
  for (const m of media.filter((x) => x.url.startsWith('https://drive.google.com/'))) {
    assert.match(m.thumb ?? '', /^https:\/\/api\.wahoobay\.net\/api\/v1\/thumb\?u=https%3A%2F%2Fdrive\.google\.com%2Fthumbnail%3Fid%3D[\w-]{20,}%26sz%3Dw640$/, `media ${m.id}`);
  }
});

test('the sync keeps the whitelist, writes null for a missing field, and decides kind, link and thumbnail as the old gallery did', () => {
  const row = {
    species_id: 7,
    common_name: ' Test wrasse ',
    custom_name: 'Not kept',
    scientific_name: 'Testus testus',
    category: 'Fish',
    family: null,
    name_status: 'accepted',
    created_at: '2026-01-01T00:00:00',
  };
  assert.deepEqual(toSpecies(row), {
    id: 7,
    common_name: 'Test wrasse',
    scientific_name: 'Testus testus',
    family: null,
    category: 'Fish',
    conservation_status: null,
  });
  const drive = toMedia({ media_id: 1, species_id: 7, media_kind: 'photo', storage_type: 'external', url: 'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAA/view?usp=sharing', source: 'x', created_at: '2026-01-01T00:00:00' });
  assert.deepEqual(drive, {
    id: 1,
    species_id: 7,
    kind: 'image',
    url: 'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAA/view?usp=sharing',
    thumb: `https://api.wahoobay.net/api/v1/thumb?u=${encodeURIComponent('https://drive.google.com/thumbnail?id=AAAAAAAAAAAAAAAAAAAAAAAA&sz=w640')}`,
    title: null,
    date: null,
  });
  const youtube = toMedia({ media_id: 2, species_id: 7, media_kind: 'video', storage_type: 'external', url: 'https://youtu.be/abcdefghijk', media_date: '2026-02-03T04:05' });
  assert.equal(youtube.kind, 'video');
  assert.equal(youtube.thumb, 'https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg');
  assert.equal(youtube.date, '2026-02-03T04:05');
  const upload = toMedia({ media_id: 3, species_id: 7, media_kind: null, storage_type: 'upload', url: '/uploads/test.png' });
  assert.equal(upload.kind, 'image');
  assert.equal(upload.url, 'https://api.wahoobay.net/api/uploads/test.png');
  assert.equal(upload.thumb, 'https://api.wahoobay.net/api/uploads/test.png');
  const elsewhere = toMedia({ media_id: 4, species_id: 7, media_kind: 'photo', storage_type: 'external', url: 'https://example.org/fish.jpg' });
  assert.equal(elsewhere.url, 'https://example.org/fish.jpg', 'the link is kept');
  assert.equal(elsewhere.thumb, null, 'a thumbnail on another host is dropped');
  assert.equal(toMedia({ media_id: 5, species_id: 7, media_kind: 'photo', url: 'http://example.org/fish.jpg' }), null, 'no https link, no item');
});

test('the sync leaves out the rows the old gallery hid, and sorts species by name and media newest first', () => {
  const rows = [
    { species_id: 1, common_name: 'Zebra test', scientific_name: 'Z z', category: 'Fish', name_status: 'accepted' },
    { species_id: 2, common_name: 'Guess', scientific_name: '[unverified] A guess', category: null, name_status: 'provisional' },
    { species_id: 3, common_name: 'Angel test', scientific_name: 'A a', category: 'Fish', name_status: 'accepted' },
    { species_id: 205, common_name: 'Listed by hand', scientific_name: 'B b', category: 'human like', name_status: null },
  ];
  assert.deepEqual(selectSpecies(rows).map((s) => s.id), [3, 1], 'provisional, [unverified] and the test rows are left out');
  assert.ok(!species.some((s) => [205, 210].includes(s.id)), 'the snapshot has neither test row');
  const clip = (id, speciesId, date) => ({ media_id: id, species_id: speciesId, media_kind: 'photo', url: `https://example.org/${id}.jpg`, media_date: date });
  const clips = selectMedia([clip(1, 3, '2026-01-01T00:00'), clip(2, 3), clip(3, 3, '2026-03-01T00:00'), clip(4, 2, '2026-04-01T00:00')], selectSpecies(rows));
  assert.deepEqual(clips.map((m) => m.id), [3, 1, 2], 'newest first, undated last; a hidden species\' clip is left out');
  // The committed snapshot is in that order too.
  const dates = media.map((m) => m.date);
  const dated = dates.filter((d) => d !== null);
  assert.deepEqual(dates, [...dated.sort().reverse(), ...dates.filter((d) => d === null)]);
});

test('the sync drops a thumbnail that does not answer with an image, and a clip whose own link is gone as well', async () => {
  const answers = {
    'https://t.test/1': [200, 'image/jpeg'],
    'https://t.test/2': [404, null],
    'https://t.test/3': [404, null],
    'https://l.test/2': [302, null],
    'https://l.test/3': [404, 'text/html'],
  };
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    const [status, type] = answers[url] ?? [500, null];
    return new Response(status === 200 ? 'x' : null, { status, headers: type ? { 'content-type': type } : {} });
  };
  const clip = (id, thumb) => ({ id, species_id: 1, kind: 'image', url: `https://l.test/${id}`, thumb, title: null, date: null });
  const out = await checkMedia([clip(1, 'https://t.test/1'), clip(2, 'https://t.test/2'), clip(3, 'https://t.test/3'), clip(4, null)], { get, pause: 0 });
  assert.deepEqual(out.media.map((m) => [m.id, m.thumb]), [[1, 'https://t.test/1'], [2, null], [4, null]]);
  assert.deepEqual([out.dropped, out.gone], [1, 1]);
  assert.equal(asked.filter((u) => u === 'https://t.test/2').length, 2, 'a failed thumbnail is asked twice before it is dropped');
  assert.ok(!asked.includes('https://l.test/1') && !asked.includes('https://l.test/4'), 'a link is checked only when its thumbnail fails');
});

test('groupByCategory covers every species once, unknown categories under Other', () => {
  const g = groupByCategory([{ id: 1, category: 'Fish' }, { id: 2, category: 'Octopus' }]);
  assert.deepEqual(g.get('Fish').map((s) => s.id), [1]);
  assert.deepEqual(g.get('Other').map((s) => s.id), [2]);
  assert.deepEqual([...g.keys()], CATEGORIES);
  const all = groupByCategory(species);
  assert.deepEqual([...all.values()].flat().map((s) => s.id).sort((a, b) => a - b), species.map((s) => s.id).sort((a, b) => a - b));
});

test('mediaFor lists a species\' clips in the snapshot\'s order; initials come from the name', () => {
  const list = [{ id: 9, species_id: 1 }, { id: 8, species_id: 2 }, { id: 7, species_id: 1 }];
  assert.deepEqual(mediaFor(1, list).map((m) => m.id), [9, 7]);
  assert.deepEqual(mediaFor(3, list), []);
  assert.equal(initials('Bluehead wrasse'), 'BW');
  assert.equal(initials('Spotted moray eel'), 'SE');
  assert.equal(initials('Manatee'), 'M');
  assert.equal(categoryId('Shark & Ray'), 'shark-ray');
});

test('the species page renders every species as a card, grouped, with no island and no client logic', () => {
  const html = read('dist/live/species/index.html');
  const source = read('src/pages/live/species/index.astro');
  assert.equal((html.match(/<li class="wb-card site-species__card"/g) || []).length, species.length);
  // A category with no species has no heading: an empty "Shark & Ray" would say none were seen, and the API files the
  // sharks and rays it has under Fish.
  const shown = [...groupByCategory(species)].filter(([, list]) => list.length).map(([c]) => categoryId(c));
  for (const c of CATEGORIES) {
    const heading = new RegExp(`<h2 id="${c.toLowerCase().replace(/[^a-z]+/g, '-')}"`);
    if (shown.includes(categoryId(c))) assert.match(html, heading, c);
    else assert.doesNotMatch(html, heading, c);
  }
  assert.deepEqual([...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]), shown, 'in CATEGORIES order');
  // Ruling G: no island and no script of the page's own.
  assert.doesNotMatch(html, /<astro-island\b/);
  assert.doesNotMatch(source, /<script\b|\bclient:/);
  assert.doesNotMatch(html, /data-theme="dark"/, 'a light page');
});

test('the category list jumps to each heading with plain anchors', () => {
  const html = read('dist/live/species/index.html');
  const nav = html.match(/<nav class="site-subnav site-species__jump"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const hrefs = [...nav.matchAll(/<a class="wb-nav__link" href="#([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]));
});

test('each card: a lazy thumbnail or the initials square, the names, the status chip, and the clips in a new tab', () => {
  const html = read('dist/live/species/index.html');
  const cards = [...html.matchAll(/<li class="wb-card site-species__card">([\s\S]*?)<\/li>\s*(?=<li class="wb-card|<\/ul>)/g)].map((m) => m[1]);
  assert.equal(cards.length, species.length);
  const byName = new Map(species.map((s) => [s.common_name ?? s.scientific_name, s]));
  let thumbs = 0;
  let squares = 0;
  for (const card of cards) {
    const img = card.match(/<img\b[^>]*>/)?.[0];
    if (img) {
      thumbs += 1;
      assert.match(img, /^<img class="wb-card__media site-species__media" src="https:\/\/[^"]+" alt="" loading="lazy"/);
    } else {
      squares += 1;
      assert.match(card, /<span class="wb-initials site-species__media" aria-hidden="true">[A-Z]{1,2}<\/span>/);
    }
    for (const a of card.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []) {
      assert.match(a, /^<a href="https:\/\/[^"]+" target="_blank" rel="noopener">(Photo|Video)( \d+)?<span class="wb-sr-only">/);
    }
  }
  const withMedia = new Set(media.filter((m) => m.thumb).map((m) => m.species_id));
  assert.equal(thumbs, withMedia.size);
  assert.equal(squares, species.length - withMedia.size);
  assert.equal((html.match(/target="_blank" rel="noopener">(Photo|Video)/g) || []).length, media.length, 'a link per clip');
  for (const s of species.filter((x) => x.conservation_status)) {
    assert.ok(html.includes(`<span class="wb-chip">${s.conservation_status}</span>`), s.conservation_status);
  }
  assert.ok(byName.size > 0);
  for (const s of species.filter((x) => x.common_name && x.scientific_name).slice(0, 20)) {
    assert.ok(html.includes(`<i>${s.scientific_name}</i>`), s.scientific_name);
  }
});

test('the new words on the page are marked for Katie', () => {
  const source = read('src/pages/live/species/index.astro');
  for (const words of ['<h1', 'wb-lead', '<h2', 'KIND_LABEL']) {
    const at = source.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(source.slice(Math.max(0, at - 260), at), /katie: review/, `${words} is marked`);
  }
});

test('the old gallery address redirects here; the sync runs by hand, never in CI or at build', () => {
  const redirects = JSON.parse(read('redirects.json'));
  assert.equal(redirects.find((r) => r.from === '/pages/fish-photos-videos')?.to, '/live/species/');
  const froms = redirects.map((r) => r.from);
  assert.deepEqual(froms, [...froms].sort(), 'redirects.json stays sorted');
  assert.equal(JSON.parse(read('package.json')).scripts['sync:species'], 'node scripts/sync-species.mjs');
  for (const file of readdirSync('.github/workflows')) {
    assert.doesNotMatch(read(`.github/workflows/${file}`), /sync[-:]species/, file);
  }
  for (const script of ['build', 'test', 'check', 'check:links']) {
    assert.doesNotMatch(JSON.parse(read('package.json')).scripts[script], /sync/, script);
  }
});
