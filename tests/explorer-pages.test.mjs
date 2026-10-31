// The species explorer's pages (plan 7 step 2b, Task 8), read from the built site in dist/ (run `npm run build` first):
// /live/species/, every species of both lists (unionSpecies over the committed snapshots) as a card in its category,
// each card linking to the species' own page, /live/species/<slug>/, built from the same snapshot; a species with a
// fish-ID id carries the SpeciesLive island for its live numbers, one without carries none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pictureOf, seenTimes, unionSpecies } from '../src/lib/explorer.mjs';
import { CATEGORIES, categoryId, groupByCategory } from '../src/lib/species.mjs';

const read = (file) => readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const list = unionSpecies(json('src/data/fish.json'), json('src/data/species.json'), json('src/data/media.json'));
const bySlug = new Map(list.map((s) => [s.slug, s]));
const pageOf = (slug) => join('dist/live/species', slug, 'index.html');
const mainOf = (html) => html.match(/<main\b[^>]*>([\s\S]*)<\/main>/)?.[1] ?? '';
const index = read('dist/live/species/index.html');
/** Text as Astro writes it in an element (it escapes &, <, >, " and ') and in an attribute (& and "). */
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const attr = (s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const islandsOf = (html) => [...html.matchAll(/<astro-island\b([^>]*)>/g)].map((m) => m[1]);
const propsOf = (attrs) => JSON.parse((attrs.match(/\bprops="([^"]*)"/)?.[1] ?? '{}').replaceAll('&quot;', '"').replaceAll('&amp;', '&'));

const MANATEE = 'trichechus-manatus';
const SHRIMP = 'stenopus-hispidus';
const NEEDLEFISH = 'ablennes-hians';

test('every species of both lists has a page at its slug, and no other species page is built', () => {
  assert.ok(list.length >= 200, `${list.length} species`);
  for (const s of list) assert.ok(existsSync(pageOf(s.slug)), `${s.slug}: no page`);
  const built = readdirSync('dist/live/species', { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepEqual(built, list.map((s) => s.slug).sort());
  for (const s of list) {
    const main = mainOf(read(pageOf(s.slug)));
    const h1 = main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
    assert.equal(h1, s.common ? esc(s.common) : `<i>${esc(s.latin)}</i>`, `${s.slug}: the h1 is the common name, else the Latin`);
  }
});

test('the index links each species page once, from its card, in its category, in the 2a category order', () => {
  const main = mainOf(index);
  for (const s of list) {
    const links = main.split(`href="/live/species/${s.slug}/"`).length - 1;
    assert.equal(links, 1, `${s.slug}: ${links} links`);
  }
  const cards = [...main.matchAll(/<a class="wb-card site-species__card" href="\/live\/species\/([^"/]+)\/">/g)].map((m) => m[1]);
  assert.equal(cards.length, list.length, 'a card per species');
  // Sections in CATEGORIES order, a category with no species left out, each card under its own category.
  const shown = [...groupByCategory(list)].filter(([, l]) => l.length).map(([c]) => c);
  assert.deepEqual([...main.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]), shown.map(categoryId));
  assert.deepEqual(shown, CATEGORIES.filter((c) => shown.includes(c)));
  for (const [, id, body] of main.matchAll(/<section class="site-species__group" aria-labelledby="([^"]+)">([\s\S]*?)<\/section>/g)) {
    for (const [, slug] of body.matchAll(/href="\/live\/species\/([^"/]+)\/"/g)) assert.equal(categoryId(bySlug.get(slug).category), id, slug);
  }
});

test('the index: the Live nav, h1 "Species", the lead, no island and no script; a card is a link with its picture, names and "Seen N times"', () => {
  const main = mainOf(index);
  assert.match(main, /^<div class="wb-container site-article"><nav class="site-subnav" aria-label="Live reef">/);
  // The site marks new words for Katie with HTML comments (CLAUDE.md), which the build keeps.
  assert.match(main, /<h1 id="species-title">Species<\/h1>\s*(?:<!--[\s\S]*?-->\s*)*<p class="wb-lead">Photos and video clips of every species the Wahoo Bay underwater cameras and volunteers have recorded\.<\/p>/);
  assert.doesNotMatch(index, /<astro-island\b|<script\b/, 'static: no island, no script');
  const cards = [...main.matchAll(/<li class="site-species__item( site-species__item--text)?"><a class="wb-card site-species__card" href="\/live\/species\/([^"/]+)\/">([\s\S]*?)<\/a><\/li>/g)];
  assert.equal(cards.length, list.length);
  for (const [, text, slug, body] of cards) {
    const s = bySlug.get(slug);
    const picture = pictureOf(s);
    assert.equal(Boolean(text), picture === null, `${slug}: a card of words only exactly when there is no picture`);
    const img = body.match(/<img\b[^>]*>/)?.[0];
    if (picture) {
      assert.ok(img?.includes(`src="${attr(picture.src)}"`), `${slug}: its picture`);
      assert.match(img, /\balt=""/);
      assert.match(img, /\bloading="lazy"/);
      assert.equal(/\bonerror=/.test(img), picture.sameOrigin, `${slug}: a picture on the site's own origin hides itself when it fails`);
    } else {
      assert.equal(img, undefined, `${slug}: no picture slot`);
      assert.match(body, /^<div class="wb-card__body"><h3>/);
    }
    assert.ok(body.includes(s.common ? `<h3>${esc(s.common)}</h3><p><i>${esc(s.latin)}</i></p>` : `<h3><i>${esc(s.latin)}</i></h3>`), `${slug}: its names`);
    const seen = seenTimes(s.sightings_total);
    if (seen) assert.ok(body.includes(`<p class="wb-caption">${seen}</p>`), `${slug}: ${seen}`);
    else assert.doesNotMatch(body, /Seen /, `${slug}: never seen, no count`);
  }
  assert.ok(list.some((s) => s.sightings_total > 0) && list.some((s) => s.sightings_total === 0));
  const sections = [...main.matchAll(/<section class="site-species__group"[\s\S]*?<\/section>/g)].map((m) => m[0]).join('');
  assert.doesNotMatch(sections, /wb-initials|target="_blank"/, 'no initials square; the clips have moved to the species pages');
  // In each category the cards with a picture come first, then the cards of words only (the 2a fix wave's rule).
  for (const [, id, body] of main.matchAll(/<section class="site-species__group" aria-labelledby="([^"]+)">([\s\S]*?)<\/section>/g)) {
    const kinds = [...body.matchAll(/<li class="site-species__item( site-species__item--text)?">/g)].map((m) => (m[1] ? 'text' : 'picture'));
    assert.deepEqual(kinds, [...kinds].sort((a, b) => (a === b ? 0 : a === 'picture' ? -1 : 1)), `${id}: pictures first`);
  }
});

// The brief's Java-only species was the manatee; since the fish-ID catalogue gained it (Trichechus manatus, Mammalia),
// it is on both lists, and the banded coral shrimp stands for a species on the Java list only.
test('a species on the Java list only (the banded coral shrimp): a page with its clips and its picture, no island, no numbers', () => {
  const shrimp = bySlug.get(SHRIMP);
  assert.ok(shrimp && shrimp.species_id === null && shrimp.media.length > 0, 'the fixture: Java only, with clips');
  const html = read(pageOf(SHRIMP));
  assert.doesNotMatch(html, /<astro-island\b|<script\b|SpeciesLive/, 'no island');
  assert.doesNotMatch(html, /wb-tile|wb-chart/, 'no tiles and no charts without a fish-ID id');
  const main = mainOf(html);
  assert.match(main, new RegExp(`<h1>${esc(shrimp.common)}</h1>\\s*(?:<!--[\\s\\S]*?-->\\s*)*<p class="wb-lead"><i>${shrimp.latin}</i></p>`));
  assert.match(main, /<h2[^>]*>Photographs and clips from volunteers<\/h2>/);
  for (const m of shrimp.media) assert.ok(main.includes(`<a href="${attr(m.url)}" target="_blank" rel="noopener">`), `clip ${m.id}`);
  assert.match(main, new RegExp(`(Photo|Video)( \\d+)?<span class="wb-sr-only">: ${esc(shrimp.common)} \\(opens in a new tab\\)</span></a>`));
  assert.ok(main.includes(`src="${attr(pictureOf(shrimp).src)}"`), 'its picture, the first volunteer photo');
  assert.match(main, /<p class="site-species-page__back"><a class="wb-back" href="\/live\/species\/"><svg class="wb-icon"[\s\S]*?<\/svg> Back to species<\/a><\/p>/);
  // Every species on the Java list only: no island; a clip a link.
  for (const s of list.filter((x) => x.species_id === null)) {
    const page = read(pageOf(s.slug));
    assert.doesNotMatch(page, /<astro-island\b/, s.slug);
    assert.equal((mainOf(page).match(/ target="_blank" rel="noopener">/g) ?? []).length - 1, s.media.length, `${s.slug}: a link per clip (and Fish ID)`);
  }
});

test('the manatee, on both lists now: its page has the island and the volunteers\' clips', () => {
  const manatee = bySlug.get(MANATEE);
  assert.ok(manatee.species_id && manatee.java_id && manatee.media.length > 0);
  const html = read(pageOf(MANATEE));
  assert.deepEqual(islandsOf(html).map((a) => propsOf(a).speciesId), [[0, manatee.species_id]]);
  for (const m of manatee.media) assert.ok(mainOf(html).includes(`<a href="${attr(m.url)}" target="_blank" rel="noopener">`), `clip ${m.id}`);
});

test('a fish-ID species: the SpeciesLive island, visible-loaded, with its id and the snapshot\'s numbers in its tiles', () => {
  const needlefish = bySlug.get(NEEDLEFISH);
  assert.ok(needlefish && needlefish.species_id === 'Ablennes hians' && needlefish.latest_crop, 'the fixture: a fish-ID species with a crop');
  const html = read(pageOf(NEEDLEFISH));
  const islands = islandsOf(html);
  assert.equal(islands.length, 1);
  assert.match(islands[0], /\bcomponent-url="\/_astro\/SpeciesLive\.[\w-]+\.js"/);
  assert.match(islands[0], /\bclient="visible"/);
  const props = propsOf(islands[0]);
  assert.deepEqual(props.speciesId, [0, 'Ablennes hians']);
  // Server-rendered from the snapshot until the island loads.
  const island = html.match(/<astro-island\b[^>]*>([\s\S]*?)<\/astro-island>/)?.[1] ?? '';
  assert.match(island, /<div class="site-species-live">/);
  assert.ok(island.includes(`<p class="wb-tile__k">Seen in total</p><p class="wb-tile__v" data-impeccable-ignore="low-contrast">${needlefish.sightings_total.toLocaleString('en-US')}</p>`));
  assert.ok(island.includes(`<p class="wb-tile__k">This week</p><p class="wb-tile__v" data-impeccable-ignore="low-contrast">${needlefish.sightings_7d.toLocaleString('en-US')}</p>`));
  assert.match(island, /<p class="wb-tile__k">Last seen<\/p><p class="wb-tile__v" data-impeccable-ignore="low-contrast">[A-Z][a-z]{2} \d{1,2}<\/p>/, 'a date until the island knows the time');
  assert.doesNotMatch(island, /wb-notice|wb-chart/, 'no notice and no chart before it loads');
  // Every species with a fish-ID id has the island with its own id; every other has none.
  for (const s of list) {
    const found = islandsOf(read(pageOf(s.slug)));
    if (s.species_id === null) assert.equal(found.length, 0, s.slug);
    else assert.deepEqual(found.map((a) => propsOf(a).speciesId), [[0, s.species_id]], s.slug);
  }
});

test('a page: family and order, "Also listed as" for a merged pair, the conservation status when the Java list has one', () => {
  const ruber = bySlug.get('caranx-ruber');
  assert.equal(ruber.also_listed_as, 'Carangoides ruber', 'the fixture: one of Ruling 36\'s four pairs');
  const main = mainOf(read(pageOf('caranx-ruber')));
  assert.match(main, /<p class="wb-caption site-species-page__also">Also listed as <i>Carangoides ruber<\/i><\/p>/);
  assert.ok(main.includes(`<dt>Family</dt><dd>${esc(ruber.family)}</dd>`));
  assert.ok(main.includes(`<dt>Order</dt><dd>${esc(ruber.order)}</dd>`));
  for (const s of list) {
    const page = mainOf(read(pageOf(s.slug)));
    assert.equal(page.includes('Also listed as'), s.also_listed_as !== null, s.slug);
    assert.equal(page.includes('<dt>Conservation status</dt>'), s.conservation_status !== null, s.slug);
    if (s.conservation_status) assert.ok(page.includes(`<dt>Conservation status</dt><dd>${esc(s.conservation_status)}</dd>`), s.slug);
    if (!s.order) assert.ok(!page.includes('<dt>Order</dt>'), s.slug);
  }
  assert.ok(list.some((s) => s.conservation_status), 'one species has a status');
});

test('a page\'s picture: the same as its card\'s; a species without one has none; the meta description names it', () => {
  for (const s of list) {
    const html = read(pageOf(s.slug));
    const main = mainOf(html);
    const picture = pictureOf(s);
    const figure = main.match(/<figure class="site-species-page__picture">([\s\S]*?)<\/figure>/)?.[1];
    if (picture) {
      assert.ok(figure?.includes(`src="${attr(picture.src)}"`), `${s.slug}: its picture`);
      assert.equal(/\bonerror=/.test(figure), picture.sameOrigin, s.slug);
    } else assert.equal(figure, undefined, `${s.slug}: words only`);
    const name = s.common ? `${s.common} (${s.latin})` : s.latin;
    assert.ok(html.includes(`<meta name="description" content="${attr(`${name} at Wahoo Bay: sightings from the reef camera and photographs from volunteers.`)}">`), s.slug);
    assert.doesNotMatch(html, /<html\b[^>]*data-theme="dark"/, `${s.slug}: a light page`);
  }
});

test('no species page carries Mapbox; every one has the Live nav above its h1, Species current', () => {
  for (const file of ['dist/live/species/index.html', ...list.map((s) => pageOf(s.slug))]) {
    const html = read(file);
    assert.doesNotMatch(html, /mapbox/i, file);
    const main = mainOf(html);
    const nav = main.match(/<nav class="site-subnav" aria-label="Live reef">[\s\S]*?<\/nav>/)?.[0] ?? '';
    assert.ok(nav && main.indexOf(nav) < main.indexOf('<h1'), `${file}: the Live nav above the h1`);
    assert.match(nav, /<a class="wb-nav__link wb-nav__link--on" href="\/live\/species\/" aria-current="page">Species<\/a>/, file);
  }
});

// The attribution line: no photo has one on staging yet (Ruling 17), so the snapshot cannot show it; the card and the
// page render pictureOf's credit, whose own test is in tests/explorer.test.mjs.
test('the card and the page print a reference photo\'s credit under it, as a caption', () => {
  for (const file of ['src/components/SpeciesCard.astro', 'src/pages/live/species/[slug].astro']) {
    const source = read(file);
    assert.match(source, /pictureOf\(/, `${file}: the picture is pictureOf's`);
    assert.match(source, /picture\.credit && <(p|figcaption) class="wb-caption[^"]*">\{picture\.credit\}<\/\1>/, `${file}: the credit line`);
  }
});

test('the new words on the explorer\'s pages are marked for Katie', () => {
  const lib = read('src/lib/explorer.mjs');
  for (const words of ["'Seen once'", 'times`']) {
    const at = lib.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(lib.slice(Math.max(0, at - 300), at), /katie: review/, `${words} is marked`);
  }
  const page = read('src/pages/live/species/[slug].astro');
  for (const words of ['Also listed as', '<dt>Family</dt>', '<dt>Order</dt>', '<dt>Conservation status</dt>', 'Photographs and clips from volunteers', 'Back to species', 'at Wahoo Bay: sightings', 'KIND_LABEL']) {
    const at = page.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(page.slice(Math.max(0, at - 300), at), /katie: review/, `${words} is marked`);
  }
  const index = read('src/pages/live/species/index.astro');
  for (const words of ['<h1', 'wb-lead', '<h2']) {
    const at = index.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(index.slice(Math.max(0, at - 300), at), /katie: review/, `${words} is marked`);
  }
});
