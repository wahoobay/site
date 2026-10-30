// The species gallery at /live/species/: the committed snapshot of the Java API's species and media lists
// (src/data/, written by hand with `npm run sync:species`), the grouping in src/lib/species.mjs, and the built page.
// The page tests read dist/ (run `npm run build` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CATEGORIES, categoryId, groupByCategory, initials, mediaFor } from '../src/lib/species.mjs';
import { assertLinks, binomial, checkMedia, cleanLink, selectMedia, selectSpecies, toMedia, toSpecies } from '../scripts/sync-species.mjs';

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
    url: 'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAA/view',
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
  // Final review, minor 3: a link on another host is never published (it could be a signed or token-bearing address).
  assert.equal(toMedia({ media_id: 4, species_id: 7, media_kind: 'photo', storage_type: 'external', url: 'https://example.org/fish.jpg' }), null, 'a link on another host: no item');
  assert.equal(toMedia({ media_id: 5, species_id: 7, media_kind: 'photo', url: 'http://example.org/fish.jpg' }), null, 'no https link, no item');
  assert.equal(toMedia({ media_id: 6, species_id: 7, media_kind: 'video', url: 'https://youtu.be/abcdefghijk?si=AbCdEf123' }).url, 'https://youtu.be/abcdefghijk', 'a ?si= parameter is stripped');
});

test('the sync leaves out the rows the old gallery hid, and sorts species by name and media newest first', () => {
  const rows = [
    { species_id: 1, common_name: 'Zebra wrasse', scientific_name: 'Z z', category: 'Fish', name_status: 'accepted' },
    { species_id: 2, common_name: 'Guess', scientific_name: '[unverified] A guess', category: null, name_status: 'provisional' },
    { species_id: 3, common_name: 'Angel wrasse', scientific_name: 'A a', category: 'Fish', name_status: 'accepted' },
    { species_id: 205, common_name: 'Listed by hand', scientific_name: 'B b', category: 'human like', name_status: null },
    // Ruling N: placeholders are not public, by either name.
    { species_id: 6, common_name: null, scientific_name: 'TBC 4', category: null, name_status: 'unidentified' },
    { species_id: 7, common_name: 'tbc crab', scientific_name: 'C c', category: 'Invertebrate', name_status: null },
    { species_id: 8, common_name: 'A test fish', scientific_name: 'D d', category: 'Fish', name_status: null },
    { species_id: 9, common_name: null, scientific_name: ' homo SAPIENS ', category: 'Mammal', name_status: null },
    { species_id: 10, common_name: 'Testudo test', scientific_name: 'Testudo graeca', category: 'Reptile', name_status: 'accepted' },
    { species_id: 11, common_name: 'Spur-thighed tortoise', scientific_name: 'Testudo graeca', category: 'Reptile', name_status: 'accepted' },
  ];
  assert.deepEqual(selectSpecies(rows).map((s) => s.id), [3, 11, 1], 'provisional, [unverified], placeholder and test rows are left out');
  assert.ok(!species.some((s) => [205, 210].includes(s.id)), 'the snapshot has neither test row');
  const clip = (id, speciesId, date) => ({ media_id: id, species_id: speciesId, media_kind: 'photo', url: `https://api.wahoobay.net/api/uploads/${id}.jpg`, media_date: date });
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

// Ruling AE (finish review, fix 8): "Diodon Hystrix" and "Neogonodactylus Wennerae" were capitalised as the API has
// them. The sync writes a scientific name as nomenclature does: the genus capitalised, every other word lower case;
// "sp." and "spp." are left as they are.
test('the sync writes a scientific name as "Genus species"', () => {
  assert.equal(binomial('Diodon Hystrix'), 'Diodon hystrix');
  assert.equal(binomial('NEOGONODACTYLUS WENNERAE'), 'Neogonodactylus wennerae');
  assert.equal(binomial('lutjanus griseus'), 'Lutjanus griseus');
  assert.equal(binomial('Ocyropsis maculata immaculata'), 'Ocyropsis maculata immaculata', 'a subspecies: every word after the genus lower case');
  assert.equal(binomial('Mycteroperca  sp.'), 'Mycteroperca sp.');
  assert.equal(binomial('Haemulon spp.'), 'Haemulon spp.');
  assert.equal(binomial(null), null);
  assert.equal(toSpecies({ species_id: 1, scientific_name: ' Diodon Hystrix ' }).scientific_name, 'Diodon hystrix');
  // The header documents the rule.
  assert.match(read('scripts/sync-species.mjs').slice(0, 2000), /Genus species/);
});

// Final review, minor 3: a clip's link is published only on the allow-listed hosts, with no query parameter but
// YouTube's v and t, and the sync refuses to write a snapshot with any other.
test('a clip\'s link: only the allow-listed hosts, no query parameter but v and t; the sync refuses to write any other', () => {
  assert.equal(cleanLink('https://www.youtube.com/watch?v=abcdefghijk&si=x&t=42&feature=share'), 'https://www.youtube.com/watch?v=abcdefghijk&t=42');
  assert.equal(cleanLink('https://youtube.com/watch?v=abcdefghijk'), 'https://youtube.com/watch?v=abcdefghijk');
  assert.equal(cleanLink('https://youtu.be/abcdefghijk?si=AbCdEf123#t=3'), 'https://youtu.be/abcdefghijk', 'and no fragment');
  assert.equal(cleanLink('https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAA/view?usp=sharing&resourcekey=0-abc'), 'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAA/view');
  assert.equal(cleanLink('https://drive.google.com/open?id=AAAAAAAAAAAAAAAAAAAAAAAA'), 'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAA/view', 'a Drive file in its plain form, its id kept');
  assert.equal(cleanLink('https://api.wahoobay.net/api/uploads/a.jpg?token=secret'), 'https://api.wahoobay.net/api/uploads/a.jpg');
  for (const bad of ['https://example.org/fish.jpg', 'http://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAA/view', 'https://storage.googleapis.com/b/o?X-Goog-Signature=x', 'https://user:pw@drive.google.com/x', 'not a link'])
    assert.equal(cleanLink(bad), null, bad);
  const clip = (id, url) => ({ id, species_id: 1, kind: 'image', url, thumb: null, title: null, date: null });
  assert.doesNotThrow(() => assertLinks([clip(1, 'https://youtu.be/abcdefghijk'), clip(2, 'https://www.youtube.com/watch?v=abcdefghijk&t=4')]));
  for (const url of ['https://example.org/fish.jpg', 'https://youtu.be/abcdefghijk?si=x']) {
    assert.throws(() => assertLinks([clip(3, url)]), /media 3: .*nothing written/, url);
    assert.throws(() => assertLinks([clip(3, url)]), (err) => !err.message.includes(url), 'the message never carries the link');
  }
});

// Ruling N: no placeholder row is public. These patterns are the ruling's, kept here apart from the script's own list.
test('no row of the snapshot is a placeholder or a test entry', () => {
  const placeholder = (name) => name !== null && (/^TBC\b/i.test(name) || /\btest\b/i.test(name) || /^homo sapiens$/i.test(name.trim()));
  for (const s of species) {
    assert.ok(!placeholder(s.common_name), `species ${s.id}: common name`);
    assert.ok(!placeholder(s.scientific_name), `species ${s.id}: scientific name`);
  }
  assert.ok(!species.some((s) => [205, 210].includes(s.id)), 'neither test id');
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
  assert.equal((html.match(/<li class="wb-card site-species__card[ "]/g) || []).length, species.length);
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

// Ruling AE (finish review, fix 8): a third of the cards showed an initials square instead of a photograph. A species
// with a photograph has it over its names; one without is a compact card of words only: no picture slot, no initials.
test('each card: a lazy thumbnail over the names, or the names alone; the status caption, and the clips in a new tab', () => {
  const html = read('dist/live/species/index.html');
  const cards = [...html.matchAll(/<li class="wb-card site-species__card( site-species__card--text)?">([\s\S]*?)<\/li>\s*(?=<li class="wb-card|<\/ul>)/g)].map((m) => ({ text: Boolean(m[1]), body: m[2] }));
  assert.equal(cards.length, species.length);
  assert.equal((html.match(/<li class="wb-card site-species__card/g) || []).length, species.length, 'a card per species');
  const byName = new Map(species.map((s) => [s.common_name ?? s.scientific_name, s]));
  let thumbs = 0;
  let words = 0;
  for (const { text, body } of cards) {
    const img = body.match(/<img\b[^>]*>/)?.[0];
    if (!text) {
      thumbs += 1;
      assert.match(img ?? '', /^<img class="wb-card__media site-species__media" src="https:\/\/[^"]+" alt="" loading="lazy"/);
    } else {
      words += 1;
      assert.equal(img, undefined, 'a card without a photo has no picture');
      assert.match(body, /^<div class="wb-card__body"><h3>/, 'its words come first, with no slot before them');
    }
    for (const a of body.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []) {
      assert.match(a, /^<a href="https:\/\/[^"]+" target="_blank" rel="noopener">(Photo|Video)( \d+)?<span class="wb-sr-only">/);
    }
  }
  assert.doesNotMatch(html, /wb-initials/, 'no initials square on the page');
  const withMedia = new Set(media.filter((m) => m.thumb).map((m) => m.species_id));
  assert.equal(thumbs, withMedia.size);
  assert.equal(words, species.length - withMedia.size);
  // A species with no clip at all is one of the word cards.
  const noClips = species.filter((s) => !media.some((m) => m.species_id === s.id));
  assert.ok(noClips.length > 0);
  for (const s of noClips) {
    const name = s.common_name ?? s.scientific_name;
    const decoded = (body) => body.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const card = cards.find((c) => decoded(c.body).includes(`<h3>${s.common_name ? name : `<i>${name}</i>`}</h3>`));
    assert.ok(card?.text, `${s.id}: a card of words only`);
  }
  assert.equal((html.match(/target="_blank" rel="noopener">(Photo|Video)/g) || []).length, media.length, 'a link per clip');
  // Ruling O: the status is caption text after the scientific name, not a chip (the accent is for "alive right now").
  assert.doesNotMatch(html, /\bwb-chip\b/);
  for (const s of species.filter((x) => x.conservation_status)) {
    const card = cards.find((c) => c.body.includes(`<span class="wb-caption">${s.conservation_status}</span>`))?.body ?? '';
    assert.ok(card, s.conservation_status);
    const at = (needle) => card.indexOf(needle);
    assert.ok(at(s.scientific_name) >= 0 && at(s.scientific_name) < at('class="wb-caption"'), `${s.id}: the status follows the scientific name`);
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
  assert.match(read('README.md'), /^npm run sync:species +# .*by hand.*commit/m, 'the README documents the sync');
  for (const file of readdirSync('.github/workflows')) {
    assert.doesNotMatch(read(`.github/workflows/${file}`), /sync[-:]species/, file);
  }
  for (const script of ['build', 'test', 'check', 'check:links']) {
    assert.doesNotMatch(JSON.parse(read('package.json')).scripts[script], /sync/, script);
  }
});
