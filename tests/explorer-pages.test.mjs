// The species explorer's pages (plan 7 step 2b, Task 8), read from the built site in dist/ (run `npm run build` first):
// /live/species/, every species of both lists (unionSpecies over the committed snapshots) as a card in its category,
// each card linking to the species' own page, /live/species/<slug>/, built from the same snapshot; a species with a
// fish-ID id carries the SpeciesLive island for its live numbers, one without carries none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { clipCaption, galleryOf, pictureOf, seenTimes, unionSpecies } from '../src/lib/explorer.mjs';
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

/** The meta description a page should have: it names only what the page shows (the camera's numbers, the clips). */
const descriptionOf = (s) => {
  const name = s.common ? `${s.common} (${s.latin})` : s.latin;
  const camera = s.species_id !== null;
  const clips = s.media.length > 0;
  if (camera && clips) return `${name} at Wahoo Bay: sightings from the reef camera and photographs and clips from volunteers.`;
  if (camera) return `${name} at Wahoo Bay: sightings from the reef camera.`;
  if (clips) return `${name} at Wahoo Bay: photographs and clips from volunteers.`;
  return `${name}, one of the species recorded at Wahoo Bay.`;
};

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
  // A reference photo's credit follows the card's link (never inside it, where it would start the link's name).
  const cards = [...main.matchAll(/<li class="site-species__item( site-species__item--text)?"><a class="wb-card site-species__card" href="\/live\/species\/([^"/]+)\/">([\s\S]*?)<\/a>(?:<p class="wb-caption site-species__credit">[^<]*<\/p>)?<\/li>/g)];
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
    const items = [...body.matchAll(/<li class="site-species__item( site-species__item--text)?"><a class="wb-card site-species__card" href="\/live\/species\/([^"/]+)\/">/g)];
    const kinds = items.map((m) => (m[1] ? 'text' : 'picture'));
    assert.deepEqual(kinds, [...kinds].sort((a, b) => (a === b ? 0 : a === 'picture' ? -1 : 1)), `${id}: pictures first`);
    // Each group in the union's name order (the 2a gallery's): the common name, else the Latin.
    const order = new Map(list.map((x, i) => [x.slug, i]));
    for (const kind of ['picture', 'text']) {
      const at = items.filter((_, i) => kinds[i] === kind).map((m) => order.get(m[2]));
      assert.deepEqual(at, [...at].sort((a, b) => a - b), `${id}: the ${kind} cards in name order`);
    }
  }
});

// Ruling 49: the category row is a second section navigation, of anchor links, named "Categories"; each category
// ends with the way back up to it. Not sticky, no chips.
test('the index: the categories as a second section navigation of anchor links, and each category\'s way back to it', () => {
  const main = mainOf(index);
  const navs = [...main.matchAll(/<nav class="([^"]+)"([^>]*)>([\s\S]*?)<\/nav>/g)];
  assert.deepEqual(navs.map((n) => n[1]), ['site-subnav', 'site-subnav site-species__jump']);
  const [, , attrs, row] = navs[1];
  assert.equal(attrs, ' id="categories" aria-label="Categories"');
  const shown = [...groupByCategory(list)].filter(([, l]) => l.length).map(([c]) => c);
  const links = [...row.matchAll(/<li><a class="wb-nav__link" href="#([^"]+)">([^<]+)<\/a><\/li>/g)].map((m) => [m[1], m[2].replaceAll('&amp;', '&')]);
  assert.match(row, /^<ul class="wb-subnav">/);
  assert.deepEqual(links, shown.map((c) => [categoryId(c), c]));
  const sections = [...main.matchAll(/<section class="site-species__group" aria-labelledby="([^"]+)">([\s\S]*?)<\/section>/g)];
  assert.equal(sections.length, shown.length);
  for (const [, id, body] of sections) assert.match(body, /<\/ul>\s*(?:<!--[\s\S]*?-->\s*)*<p class="site-species__top"><a href="#categories">Back to categories<\/a><\/p>\s*$/, id);
  assert.doesNotMatch(read('src/styles/site.css').replace(/\/\*[\s\S]*?\*\//g, ''), /position:\s*sticky/, 'no sticky row');
});

// A species on the Java list only. The brief's was the manatee: the fish-ID catalogue gained it, a wrong label (Ruling
// 42), and the site reads it as Java-only again (its test below); the banded coral shrimp stands for the rest.
test('a species on the Java list only (the banded coral shrimp): a page with its picture, which links to its clip, no island, no numbers', () => {
  const shrimp = bySlug.get(SHRIMP);
  assert.ok(shrimp && shrimp.species_id === null && shrimp.media.length > 0, 'the fixture: Java only, with clips');
  const html = read(pageOf(SHRIMP));
  assert.doesNotMatch(html, /<astro-island\b|<script\b|SpeciesLive/, 'no island');
  assert.doesNotMatch(html, /wb-tile|wb-chart/, 'no tiles and no charts without a fish-ID id');
  const main = mainOf(html);
  assert.match(main, new RegExp(`<h1>${esc(shrimp.common)}</h1>\\s*(?:<!--[\\s\\S]*?-->\\s*)*<p class="wb-lead"><i>${shrimp.latin}</i></p>`));
  // Its one clip is its picture (Ruling 48): the picture links to it, and there is no gallery to repeat it in.
  assert.equal(galleryOf(shrimp).clips.length, 0, 'the fixture: one clip, the picture');
  assert.doesNotMatch(main, /Photographs and clips from volunteers/);
  for (const m of shrimp.media) assert.ok(main.includes(`<a href="${attr(m.url)}" target="_blank" rel="noopener"><img class="wb-media" src="${attr(m.thumb)}" alt="${esc(shrimp.common)}"`), `clip ${m.id}: the picture's link`);
  assert.ok(main.includes(`src="${attr(pictureOf(shrimp).src)}"`), 'its picture, the first volunteer photo');
  assert.match(main, /<p class="site-species-page__back"><a class="wb-back" href="\/live\/species\/"><svg class="wb-icon"[\s\S]*?<\/svg> Back to species<\/a><\/p>/);
  for (const s of list.filter((x) => x.species_id === null)) assert.doesNotMatch(read(pageOf(s.slug)), /<astro-island\b/, `${s.slug}: no island`);
});

/** The volunteers' clips on a species page: each link of its clip list, in order. */
const clipLinks = (main) => {
  const lists = main.match(/<ul class="site-species-page__clip-list" role="list">[\s\S]*?<\/ul>/g) ?? [];
  assert.ok(lists.length <= 1, 'one clip list');
  return [...(lists[0] ?? '').matchAll(/<li><a href="([^"]+)" target="_blank" rel="noopener">([\s\S]*?)<\/a><\/li>/g)].map((m) => ({ href: m[1], body: m[2] }));
};

// The 2a gallery's guarantee, moved to the species pages: a link per clip, in the snapshot's order, labelled as it
// was; Ruling 48: but the clip that is the page's picture, which the picture links to instead, and each with its date
// (or what it is).
test('every species page with clips: one link per clip but the picture\'s, in order, each with its caption, what it is and that it opens a new tab', () => {
  let pages = 0;
  let heroes = 0;
  for (const s of list) {
    const main = mainOf(read(pageOf(s.slug)));
    const links = clipLinks(main);
    const { pictureClip, clips } = galleryOf(s);
    assert.deepEqual(links.map((l) => l.href), clips.map((m) => attr(m.url)), `${s.slug}: a link per clip`);
    const figure = main.match(/<figure class="site-species-page__picture">([\s\S]*?)<\/figure>/)?.[1] ?? '';
    if (pictureClip) {
      heroes += 1;
      assert.ok(figure.startsWith(`<a href="${attr(pictureClip.url)}" target="_blank" rel="noopener"><img class="wb-media" src="${attr(pictureClip.thumb)}"`), `${s.slug}: the picture links to its clip`);
      assert.ok(figure.includes(`<figcaption class="wb-caption">${esc(clipCaption(pictureClip))}</figcaption>`), `${s.slug}: the picture's caption`);
      assert.ok(!links.some((l) => l.body.includes(`src="${attr(pictureClip.thumb)}"`)), `${s.slug}: the picture is not repeated`);
    }
    if (clips.length === 0) {
      assert.doesNotMatch(main, /Photographs and clips from volunteers/, `${s.slug}: no other clips, no section`);
      continue;
    }
    pages += 1;
    for (const [i, { body }] of links.entries()) {
      const m = clips[i];
      const same = clips.filter((x) => x.kind === m.kind);
      const word = m.kind === 'video' ? 'Video' : 'Photo';
      const label = same.length > 1 ? `${word} ${same.indexOf(m) + 1}` : word;
      assert.ok(body.endsWith(`<span class="wb-caption">${esc(clipCaption(m))}</span><span class="wb-sr-only">: ${label}, ${esc(s.common ?? s.latin)} (opens in a new tab)</span>`), `${s.slug}: ${label}`);
      assert.equal(/<img\b/.test(body), Boolean(m.thumb), `${s.slug}: a thumbnail when the clip has one`);
    }
  }
  // Most species have one clip (some listed twice), which is their picture: few pages have a gallery left.
  assert.ok(pages >= 1, `${pages} pages with other clips`);
  assert.ok(heroes > 100, `${heroes} pages whose picture is a volunteer photo`);
  // Every clip is reachable: in the gallery, or as the picture's link.
  for (const s of list) {
    const main = mainOf(read(pageOf(s.slug)));
    for (const m of s.media) assert.ok(main.includes(`<a href="${attr(m.url)}" target="_blank" rel="noopener">`), `${s.slug}: clip ${m.id}`);
  }
});

// Ruling 42: the fish-ID catalogue's manatee is a wrong classifier label (every crop is a fish), so its page and card
// show the Java list's manatee alone.
test('the manatee (Ruling 42): no fish-ID numbers anywhere, its page the Java-only shape with the volunteers\' clips', () => {
  const manatee = bySlug.get(MANATEE);
  assert.ok(json('src/data/fish.json').some((f) => f.latin === 'Trichechus manatus'), 'the snapshot still carries the row');
  assert.deepEqual([manatee.species_id, manatee.sightings_total, manatee.latest_crop, manatee.photo], [null, 0, null, null]);
  assert.ok(manatee.java_id !== null && manatee.media.length > 0 && manatee.category === 'Mammal');
  const html = read(pageOf(MANATEE));
  assert.doesNotMatch(html, /<astro-island\b|<script\b|SpeciesLive|wb-tile|wb-chart|\/api\/public\//, 'no island, no numbers, no crop');
  const main = mainOf(html);
  assert.ok(main.includes(`src="${attr(pictureOf(manatee).src)}"`), 'its picture, the first volunteer photo');
  assert.deepEqual(clipLinks(main).map((l) => l.href), galleryOf(manatee).clips.map((m) => attr(m.url)));
  assert.ok(html.includes('<meta name="description" content="West Indian Manatee (Trichechus manatus) at Wahoo Bay: photographs and clips from volunteers.">'));
  const card = mainOf(index).match(/<a class="wb-card site-species__card" href="\/live\/species\/trichechus-manatus\/">([\s\S]*?)<\/a>/)?.[1] ?? '';
  assert.ok(card.includes('<h3>West Indian Manatee</h3>'));
  assert.doesNotMatch(card, /Seen |\/api\/public\//, 'no "Seen N times" and no crop on its card');
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
  // The island knows the page's picture, so a recent crop that is it is not shown again (Ruling 48).
  assert.deepEqual(props.hero, [0, pictureOf(needlefish).src]);
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
      if (picture.sameOrigin) assert.ok(figure.includes(`onerror="this.closest('figure').remove()"`), `${s.slug}: the figure goes`);
    } else assert.equal(figure, undefined, `${s.slug}: words only`);
    assert.ok(html.includes(`<meta name="description" content="${attr(descriptionOf(s))}">`), `${s.slug}: ${descriptionOf(s)}`);
    assert.doesNotMatch(html, /<html\b[^>]*data-theme="dark"/, `${s.slug}: a light page`);
  }
});

test('the meta description says only what the page has: the camera\'s sightings, the volunteers\' clips, both, or neither', () => {
  const shapes = new Map();
  for (const s of list) {
    const key = `${s.species_id !== null ? 'camera' : ''}${s.media.length > 0 ? '+clips' : ''}` || 'neither';
    if (!shapes.has(key)) shapes.set(key, s);
  }
  assert.deepEqual([...shapes.keys()].sort(), ['+clips', 'camera', 'camera+clips', 'neither'], 'the snapshot has all four');
  for (const [key, s] of shapes) {
    const content = read(pageOf(s.slug)).match(/<meta name="description" content="([^"]*)">/)?.[1] ?? '';
    assert.equal(content, attr(descriptionOf(s)), `${key}: ${s.slug}`);
    assert.equal(content.includes('reef camera'), key.startsWith('camera'), `${key}: the camera named only with its numbers`);
    assert.equal(content.includes('volunteers'), key.endsWith('clips'), `${key}: the volunteers named only with their clips`);
  }
});

// Species is current on the index ("page") and on every species' page below it ("true": the page is under Species,
// not Species itself; SectionNav's `under`).
test('no species page carries Mapbox or a chip; every one has the Live nav above its h1, Species current', () => {
  const index = 'dist/live/species/index.html';
  for (const file of [index, ...list.map((s) => pageOf(s.slug))]) {
    const html = read(file);
    assert.doesNotMatch(html, /mapbox/i, file);
    // Ruling O: the accent's chip is for what is alive right now; a status or a count here is caption text.
    assert.doesNotMatch(html, /\bwb-chip\b/, `${file}: no chip`);
    const main = mainOf(html);
    const nav = main.match(/<nav class="site-subnav" aria-label="Live reef">[\s\S]*?<\/nav>/)?.[0] ?? '';
    assert.ok(nav && main.indexOf(nav) < main.indexOf('<h1'), `${file}: the Live nav above the h1`);
    const current = file === index ? 'page' : 'true';
    assert.match(nav, new RegExp(`<a class="wb-nav__link wb-nav__link--on" href="/live/species/" aria-current="${current}">Species</a>`), file);
    assert.equal(nav.match(/aria-current=/g)?.length, 1, `${file}: Species alone is marked`);
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
  // On the card the credit follows the link, so the link's name is the species', not the licence's.
  const card = read('src/components/SpeciesCard.astro');
  const template = card.slice(card.lastIndexOf('---'));
  const credit = template.indexOf('picture.credit && <p class="wb-caption site-species__credit">');
  assert.ok(credit > template.indexOf('</a>') && template.indexOf('</a>') > 0, 'the credit is after the card\'s </a>');
  assert.ok(credit < template.indexOf('</li>'), 'and inside its list item');
});

test('the new words on the explorer\'s pages are marked for Katie', () => {
  const lib = read('src/lib/explorer.mjs');
  for (const words of ["'Seen once'", 'times`']) {
    const at = lib.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(lib.slice(Math.max(0, at - 300), at), /katie: review/, `${words} is marked`);
  }
  const page = read('src/pages/live/species/[slug].astro');
  for (const words of ['Also listed as', '<dt>Family</dt>', '<dt>Order</dt>', '<dt>Conservation status</dt>', 'Photographs and clips from volunteers', 'Back to species', 'sightings from the reef camera', 'photographs and clips from volunteers', 'one of the species recorded', 'KIND_LABEL']) {
    const at = page.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(page.slice(Math.max(0, at - 300), at), /katie: review/, `${words} is marked`);
  }
  const index = read('src/pages/live/species/index.astro');
  for (const words of ['<h1', 'wb-lead', '<h2', 'aria-label="Categories"', 'Back to categories']) {
    const at = index.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(index.slice(Math.max(0, at - 300), at), /katie: review/, `${words} is marked`);
  }
});
