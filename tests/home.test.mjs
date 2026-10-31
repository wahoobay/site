// Run after `npm run build`: the home page, in the Deep Field presentation (@wahoobay/design 0.2.1, spec §4.3): the
// stage (the headline on a full-height photograph, the nav over its top), the dark live band, the four impact figures,
// the photo doorways, the map teaser on the manatee photograph, the news teaser, the Instagram strip and the dark footer.
// Ruling J (fix round 1): the clean aerial opens the page; the divers and the manatee, whose corners carry a watermark,
// a credit or a signature, sit where the frame crops those corners away (the Get involved doorway, the map band).
// The Instagram script runs against a small stand-in for the DOM (fix 5 and note 3): a picture that fails takes its card away, the strip goes when fewer than two cards
// are left, and a caption is cut at a word boundary, never inside a word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { unionSpecies } from '../src/lib/explorer.mjs';

const html = readFileSync('dist/index.html', 'utf8');
// The Instagram strip's script; Astro's island loader for the live band's islands is the page's other inline script.
const code = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes("getElementById('instagram')")) ?? '';

class Node {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.className = attrs.class ?? '';
    this.id = attrs.id ?? '';
    this.attributes = { ...attrs };
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.textContent = '';
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type) {
    for (const fn of this.listeners[type] ?? []) fn.call(this, { type, target: this, currentTarget: this });
  }
  all() {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  querySelectorAll(selector) {
    const match = selector.startsWith('.')
      ? (n) => n.className.split(/\s+/).includes(selector.slice(1))
      : (n) => n.tagName === selector.toUpperCase();
    return this.all().filter(match);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

/** Runs the script with `posts` as the API's answer; resolves once the fetch has been handled. */
async function run(posts) {
  const body = new Node('body');
  const section = body.appendChild(new Node('section', { id: 'instagram' }));
  const list = section.appendChild(new Node('ul', { 'aria-busy': 'true' }));
  for (let i = 0; i < 4; i++) list.appendChild(new Node('li', { class: 'wb-card site-instagram__post' }));
  const document = {
    getElementById: (id) => body.all().find((n) => n.id === id) ?? null,
    createElement: (tag) => new Node(tag),
  };
  const response = { ok: true, status: 200, json: async () => ({ status: 'Success', data: posts }) };
  const window = { fetch: async () => response };
  vm.runInNewContext(code, { window, document, setTimeout: () => 1, clearTimeout: () => {} });
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  const cards = () => list.querySelectorAll('.site-instagram__post');
  const present = () => body.children.includes(section);
  return { section, list, cards, present };
}

const post = (n, caption = `Post ${n}`) => ({
  permalink: `https://www.instagram.com/p/${n}/`,
  media_type: 'IMAGE',
  media_url: `https://cdn.example/${n}.jpg`,
  caption,
});

const home = () => html;
const STAGING_AI = 'https://staging-ai.wahoobay.net/';
const AI_URL = process.env.PUBLIC_AI_URL ?? STAGING_AI;
const frontMatterField = (file, name) => {
  const raw = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1].match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1].trim() ?? '';
  return raw.startsWith('"') ? JSON.parse(raw) : raw;
};
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll("'", '&#39;').replaceAll('"', '&quot;');
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('home opens on a full-height stage with the headline on the photograph', () => {
  const html = home();
  assert.match(html, /<section class="wb-stage[^"]*"/);
  assert.match(html, /<h1 class="wb-stage__title"[^>]*>Art\. Conservation\. Education<\/h1>/);
  // The nav is the site's <nav aria-label="Main"> (tests/build.test.mjs, tests/nav.test.mjs), laid over the stage.
  assert.match(html, /<nav class="wb-nav wb-nav--over"/);
  const stage = html.match(/<section class="wb-stage[^"]*"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(stage, /<img class="wb-stage__photo[^"]*" src="\/WB-1\.jpg" srcset="\/WB-1-800\.jpg 800w, \/WB-1\.jpg 1600w"/);
  assert.match(stage, /<img class="wb-stage__photo[^"]*"[^>]*\balt="The park from the air: palms along the seawall, the dock on the inlet and the bridge behind"/);
  assert.match(stage, /<div class="wb-stage__scrim"><\/div>/);
  assert.match(stage, /<p class="wb-stage__lead"[^>]*>Wahoo Bay is a public marine education park at the Hillsboro Inlet, inspiring ocean literacy through hands-on learning, immersive field experiences, and community conservation\.<\/p>/);
  const actions = stage.match(/<div class="wb-stage__actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const buttons = [...actions.matchAll(/<a class="(wb-btn [^"]*)" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => m.slice(1));
  assert.deepEqual(buttons.map(([, href, label]) => [href, label]), [['/visit/', 'Explore Wahoo Bay'], ['/live/', 'Underwater Camera']]);
  assert.match(buttons[0][0], /\bwb-btn--action\b/);
  assert.match(buttons[1][0], /\bwb-btn--ghost\b/);
});

test('the live band is the one dark surface and links to the camera, Fish ID and the reel', () => {
  const band = home().match(/<section class="wb-band[^"]*" data-theme="dark"[\s\S]*?<\/section>/)[0];
  // The badge is the LiveBadge island (tests/live.test.mjs): drawn once the camera's status is known.
  assert.match(band, /<astro-island\b[^>]*LiveBadge/);
  assert.match(band, /href="\/live\/"/);
  assert.match(band, new RegExp(`href="${escapeRe(AI_URL)}"`));
  assert.match(band, /href="\/live\/highlights\/"/);
  assert.doesNotMatch(band, /min ago|°C/); // no sample data in production
  // The badge sits on the still: .wb-video clips its children and, from @wahoobay/design 0.3.0, is their containing
  // block (position: relative); the badge's corner is layout CSS (.site-band__still).
  assert.match(band, /<div class="wb-video site-band__still">\s*<img\b[^>]*\bsrc="\/images\/learn\/wb-camera\.jpg"[^>]*>[\s\S]*?<astro-island\b[^>]*LiveBadge[\s\S]*?<\/astro-island>\s*<\/div>/);
  const design = readFileSync('node_modules/@wahoobay/design/dist/components.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(design, /\.wb-video\s*\{[^}]*position:\s*relative/, '@wahoobay/design 0.3.0 positions .wb-video');
  const css = readFileSync('src/styles/site.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.site-band__still \.wb-live\s*\{\s*position:\s*absolute;\s*inset:\s*var\(--wb-space-4\) auto auto var\(--wb-space-4\);\s*\}/, 'the badge on the top left corner');
  // The words are the camera page's own: its title and description.
  const camera = 'src/content/live/camera.md';
  assert.match(band, new RegExp(`<h2[^>]*>${escapeRe(escapeHtml(frontMatterField(camera, 'title')))}</h2>`));
  assert.match(band, new RegExp(`<p class="wb-lead">${escapeRe(escapeHtml(frontMatterField(camera, 'description')))}</p>`));
  const labels = [...band.matchAll(/<a class="wb-btn[^"]*"[^>]*>([^<]+)/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Watch live', 'Fish ID dashboard', 'Best of the reef']);
  // The one dark surface in the page's main content; the page itself stays light.
  const main = home().match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  assert.equal(main.match(/data-theme="dark"/g)?.length, 1);
  assert.doesNotMatch(home(), /<html\b[^>]*data-theme=/);
});

// Ruling 51: "Species Documented" is the explorer's count at build time (the species /live/species/ lists), not the
// old dashboard's 184; the other three are the old figures, as the Support page has them.
test('the four figures come from figures.json; species documented is the explorer\'s count; the rest match the Support page', () => {
  const figures = JSON.parse(readFileSync('src/content/figures.json', 'utf8'));
  assert.equal(figures.length, 4);
  const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const union = unionSpecies(json('src/data/fish.json'), json('src/data/species.json'), json('src/data/media.json')).length;
  assert.ok(union >= 200, `${union} species`);
  const species = figures.find((f) => f.id === 'species');
  assert.deepEqual(species, { id: 'species', from: 'explorer', label: 'Species Documented' });
  const values = figures.map((f) => (f.from === 'explorer' ? union : f.value));
  const support = readFileSync('src/content/pages/get-involved/support.md', 'utf8');
  for (const f of figures.filter((x) => x.from === undefined)) assert.match(support, new RegExp(`\\*\\*${f.value.toLocaleString('en-US')}\\*\\* ${f.label}`));
  const html = home();
  const block = html.match(/<div class="wb-figures">[\s\S]*?<\/div>\s*<\/section>/)?.[0] ?? '';
  const pairs = [...block.matchAll(/<div class="wb-figure"><b class="wb-figure__value"[^>]*>([^<]+)<\/b><span class="wb-figure__label">([^<]+)<\/span><\/div>/g)];
  assert.deepEqual(pairs.map((m) => [m[1], m[2]]), figures.map((f, i) => [values[i].toLocaleString('en-US'), f.label]));
  // The explorer's index shows as many cards.
  assert.equal((readFileSync('dist/live/species/index.html', 'utf8').match(/<a class="wb-card site-species__card"/g) ?? []).length, union);
  // The source is said where the figures are defined, and the label stays marked for Katie.
  const config = readFileSync('src/content.config.ts', 'utf8');
  assert.match(config, /Ruling 51/);
  assert.match(config, /katie: review: figures copied by hand[\s\S]*?species figure/);
});

// Ruling 58: the Support page's "Our Impact at a Glance" says the same species count, from the same source: its
// Markdown names the figure ({species-documented}), which the page fills in at build time.
test('the Support page\'s species documented is the explorer\'s count, filled in at build time, still marked for Katie', () => {
  const md = readFileSync('src/content/pages/get-involved/support.md', 'utf8');
  assert.match(md, /<!-- katie: review: these four figures[^\n]*-->\n(?:- \*\*[\d,]+\*\* [^\n]+\n){3}- \*\*\{species-documented\}\*\* Species Documented\n/);
  assert.doesNotMatch(md, /\*\*184\*\*/, 'the old dashboard\'s figure is no longer the page\'s');
  const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const union = unionSpecies(json('src/data/fish.json'), json('src/data/species.json'), json('src/data/media.json')).length;
  const html = readFileSync('dist/get-involved/support/index.html', 'utf8');
  assert.ok(html.includes(`<li><strong>${union.toLocaleString('en-US')}</strong> Species Documented</li>`), `${union} on the Support page`);
  assert.ok(home().includes(`>${union.toLocaleString('en-US')}</b><span class="wb-figure__label">Species Documented</span>`), 'the same on the home page');
  for (const file of ['dist/get-involved/support/index.html', 'dist/index.html']) assert.doesNotMatch(readFileSync(file, 'utf8'), /\{species-documented\}/);
});

test('three photo doorways, three news items, the map teaser on the manatee photograph, a dark footer', () => {
  const html = home();
  assert.equal((html.match(/<a class="wb-door"/g) || []).length, 3);
  assert.equal((html.match(/<a class="wb-feature"/g) || []).length, 1);
  // The design has no map-teaser component: the band is site layout on the design's raised panel and media.
  assert.match(html, /class="site-map-teaser[\s\S]*?\/images\/home\/manatee-wide\.jpg/);
  assert.match(html, /<footer class="wb-footer[^"]*" data-theme="dark"/);
});

test('the doorways keep their three sections, sentences and photos', () => {
  const doors = [...home().matchAll(/<a class="wb-door" href="([^"]+)">\s*<img class="wb-door__photo" src="([^"]+)"[^>]*>\s*<div class="wb-door__body"><h2 class="wb-door__title"[^>]*>([^<]+)<\/h2><p class="wb-door__text"[^>]*>([^<]+)<\/p><\/div>\s*<\/a>/g)];
  assert.deepEqual(doors.map((m) => m.slice(1)), [
    ['/visit/', '/images/home/diver.jpg', 'Visit', 'Wahoo Bay sits within the Hillsboro Inlet at Roy L. Rogers Family Park.'],
    ['/learn/', '/images/home/students.jpg', 'Learn', 'Explore the many educational resources available right here on our website.'],
    ['/get-involved/', '/images/about/2025-gd-wb-816-lwb-06.jpg', 'Get involved', 'Join our conservation mission and inspire others to protect marine ecosystems.'],
  ]);
});

// Final review, minor 9: the doorways' accessible name is new wording, heard and not seen, and is marked for Katie too.
test('the doorways\' accessible name, "Ways in", is marked for Katie', () => {
  const source = readFileSync('src/components/Doorways.astro', 'utf8');
  const at = source.indexOf('aria-label="Ways in"');
  assert.ok(at > 0);
  assert.match(source.slice(source.lastIndexOf('\n', source.lastIndexOf('\n', at) - 1), at), /katie: review/);
  assert.match(home(), /<section class="wb-container site-doors" aria-label="Ways in">/);
});

test('the map teaser is the map page\'s title and description on a raised panel, with its two actions and the map still', () => {
  const teaser = home().match(/<section class="site-map-teaser"[\s\S]*?<\/section>/)?.[0] ?? '';
  // The manatee's signature sits at its bottom right: the band keeps the top of the frame (wb-media--top).
  assert.match(teaser, /^<section class="site-map-teaser"[^>]*>\s*<img class="site-map-teaser__photo wb-media--top" src="\/images\/home\/manatee-wide\.jpg"[^>]*\balt=""/);
  const panel = teaser.match(/<div class="wb-panel wb-panel--raised[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const map = 'src/content/pages/visit/map.md';
  assert.match(panel, new RegExp(`<h2[^>]*>${escapeRe(escapeHtml(frontMatterField(map, 'title')))}</h2>`));
  assert.match(panel, new RegExp(`<p>${escapeRe(escapeHtml(frontMatterField(map, 'description')))}</p>`));
  // Ruling D: the sighting action arrived with its page (Task 7), the map page's ghost beside its action.
  const links = [...teaser.matchAll(/<a class="([^"]+)" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(links, [['wb-btn wb-btn--action', '/visit/map/', 'Open the map'], ['wb-btn wb-btn--ghost', '/live/log-a-sighting/', 'Log a sighting']]);
  assert.match(teaser, /<div class="site-page__actions">\s*<a class="wb-btn wb-btn--action" href="\/visit\/map\/">Open the map<\/a>\s*<a class="wb-btn wb-btn--ghost" href="\/live\/log-a-sighting\/">Log a sighting<\/a>\s*<\/div>/);
  assert.match(teaser, /<img class="wb-media[^"]*" src="\/images\/map\.jpg"[^>]*\balt="Map of Wahoo Bay"/);
});

// Ruling AB b (finish review, fix 5): "News" was an underlined blue link where "From Instagram" is an ink heading. It is
// a plain heading now, and a separate "All news" link follows the posts.
test('the news teaser is the three newest posts: one feature, then two cards, under a plain heading, then "All news"', async () => {
  const { readdirSync } = await import('node:fs');
  const posts = readdirSync('src/content/news')
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ slug: name.slice(0, -3), file: `src/content/news/${name}` }))
    .map((p) => ({ ...p, date: frontMatterField(p.file, 'date'), title: frontMatterField(p.file, 'title'), description: frontMatterField(p.file, 'description'), image: frontMatterField(p.file, 'image') }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const news = home().match(/<section\b[^>]*aria-labelledby="news-title"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(news, /<h2 id="news-title">News<\/h2>/);
  assert.doesNotMatch(news.match(/<h2[\s\S]*?<\/h2>/)[0], /<a\b/, 'the heading is not a link');
  assert.match(news.replace(/<!--[\s\S]*?-->/g, ''), /<\/ul>\s*<\/div><p class="site-news-teaser__more"><a href="\/news\/">All news<\/a><\/p><\/section>$/, 'the link to every post follows the grid');
  const source = readFileSync('src/components/NewsTeaser.astro', 'utf8');
  const label = source.indexOf('>All news<');
  assert.match(source.slice(source.lastIndexOf('\n', source.lastIndexOf('\n', label) - 1), label), /katie: review/, 'the new link label is marked');
  const feature = news.match(/<a class="wb-feature"[\s\S]*?<\/a>/)?.[0] ?? '';
  assert.match(feature, new RegExp(`^<a class="wb-feature" href="/news/${posts[0].slug}/">`));
  assert.match(feature, new RegExp(`<img class="wb-feature__photo" src="${escapeRe(posts[0].image)}"[^>]*\\balt=""`));
  assert.match(feature, new RegExp(`<h3 class="wb-feature__title"[^>]*>${escapeRe(escapeHtml(posts[0].title))}</h3>`));
  assert.match(feature, new RegExp(`<p class="wb-feature__text"[^>]*>${escapeRe(escapeHtml(posts[0].description))}</p>`));
  const cards = [...news.matchAll(/<a class="wb-card" href="([^"]+)">([\s\S]*?)<\/a>/g)];
  assert.deepEqual(cards.map((m) => m[1]), posts.slice(1).map((p) => `/news/${p.slug}/`));
  cards.forEach(([, , body], i) => {
    assert.match(body, new RegExp(`<h3>${escapeRe(escapeHtml(posts[i + 1].title))}</h3>`));
    assert.match(body, new RegExp(`<p>${escapeRe(escapeHtml(posts[i + 1].description))}</p>`));
    if (posts[i + 1].image) assert.match(body, /<img class="wb-card__media"[^>]*\balt=""/);
  });
});

test('the sections run stage, live band, figures, doorways, map teaser, news, Instagram', () => {
  const html = home();
  const at = (re) => html.search(re);
  const order = [/<section class="wb-stage/, /<section class="wb-band/, /<div class="wb-figures">/, /<a class="wb-door"/, /<section class="site-map-teaser"/, /aria-labelledby="news-title"/, /id="instagram"/, /<footer\b/];
  const positions = order.map(at);
  for (const [i, p] of positions.entries()) assert.ok(p >= 0, String(order[i]));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

// The 320-360px capture (Task 2): with an auto track, the news grid grew to the 16:9 feature's height-derived width
// and the page scrolled sideways. Every home grid that holds a photo link sets its tracks.
test('the home grids set minmax(0, 1fr) tracks, so no photo link widens a phone screen', () => {
  const css = readFileSync('src/styles/site.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const selector of ['.site-doors', '.site-news-teaser__grid', '.site-news-teaser__list']) {
    const body = css.match(new RegExp(`(?:^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    assert.match(body, /grid-template-columns:\s*minmax\(0, 1fr\);/, selector);
  }
});

// Ruling A: the detector cannot see a photograph or the scrim, so text set on one carries the low-contrast waiver right
// after its class; so do the brand-blue figures (large text, 3:1). Nowhere else.
const WAIVED = ['wb-stage__title', 'wb-stage__lead', 'wb-door__title', 'wb-door__text', 'wb-feature__title', 'wb-feature__text', 'wb-figure__value', 'wb-nav__link'];
test('the low-contrast waiver sits on text on a photograph and on the figures, right after the class, and nowhere else', () => {
  const html = home();
  const waived = [...html.matchAll(/<[a-z0-9]+\b([^>]*)\bdata-impeccable-ignore="low-contrast"/g)].map((m) => m[1]);
  assert.ok(waived.length > 0);
  for (const attrs of waived) {
    const cls = attrs.match(/^\s*class="([^"]+)"\s*$/)?.[1];
    assert.ok(cls, `the waiver follows the class attribute: ${attrs}`);
    assert.ok(cls.split(/\s+/).some((c) => WAIVED.includes(c)), `waiver on .${cls}`);
  }
  for (const cls of WAIVED.filter((c) => c !== 'wb-nav__link')) {
    const tags = [...html.matchAll(new RegExp(`<[a-z0-9]+ class="${cls}"[^>]*>`, 'g'))].map((m) => m[0]);
    assert.ok(tags.length > 0, cls);
    for (const tag of tags) assert.match(tag, new RegExp(`class="${cls}" data-impeccable-ignore="low-contrast"`), tag);
  }
  assert.equal(html.match(/class="wb-figure__value" data-impeccable-ignore="low-contrast"/g)?.length, 4);
  const nav = html.match(/<nav\b[^>]*aria-label="Main"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
  const links = [...nav.matchAll(/<a class="(wb-nav__link[^"]*)"([^>]*)>/g)];
  assert.equal(links.length, 7, 'six section links and Sign in');
  for (const [tag, , rest] of links) assert.match(rest, /^ data-impeccable-ignore="low-contrast"/, tag);
  for (const file of ['dist/about/index.html', 'dist/live/index.html', 'dist/404.html']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /low-contrast/, `${file}: no waiver off the home page`);
  }
});

test('the script listens for a failed picture with addEventListener, not an onerror attribute', () => {
  assert.match(code, /addEventListener\(\s*['"]error['"]/);
  assert.doesNotMatch(html, /\bonerror=/i);
});

test('four posts fill four cards, each a caption link around its picture', async () => {
  const { cards, present } = await run([1, 2, 3, 4].map((n) => post(n)));
  assert.ok(present());
  assert.equal(cards().length, 4);
  for (const card of cards()) {
    const link = card.querySelector('a');
    assert.equal(link.className, 'site-instagram__link wb-caption');
    assert.equal(link.target, '_blank');
    assert.equal(card.querySelector('img').className, 'wb-card__media');
  }
});

test('a picture that fails takes its card away; the strip goes when fewer than two cards are left', async () => {
  const { cards, present } = await run([1, 2, 3, 4].map((n) => post(n)));
  cards()[1].querySelector('img').fire('error');
  assert.equal(cards().length, 3, 'the failed card is gone');
  assert.ok(present(), 'three cards: the strip stays');
  cards()[0].querySelector('img').fire('error');
  assert.equal(cards().length, 2);
  assert.ok(present(), 'two cards: the strip stays');
  cards()[0].querySelector('img').fire('error');
  assert.ok(!present(), 'one card: the strip goes');
});

test('one post is not a strip: the section goes', async () => {
  const { present } = await run([post(1)]);
  assert.ok(!present());
});

test('a long caption is cut at the last word boundary within 90 characters, then "…"; a short one is whole', async () => {
  const long =
    'Wahoo Bay welcomed the fourth graders of Pompano Beach Elementary for a morning on the reef, snorkelling the modules.';
  const exact = `${'a'.repeat(44)} ${'b'.repeat(45)} tail`; // the 91st character is the space before "tail"
  const oneWord = 'x'.repeat(120);
  const { cards } = await run([post(1, long), post(2, 'A short caption.'), post(3, exact), post(4, oneWord)]);
  const caption = (i) => cards()[i].querySelector('a').children.find((c) => c.tagName === 'SPAN' && !c.className).textContent;
  const first = caption(0);
  assert.ok(first.endsWith('…'), first);
  const kept = first.slice(0, -1);
  assert.ok(Array.from(kept).length <= 90, `${Array.from(kept).length} characters`);
  assert.ok(long.startsWith(kept), 'a prefix of the caption');
  assert.match(long.slice(kept.length), /^[\s,;:.!?]/, `"${kept}" ends at a word boundary`);
  // Ninety characters end inside "reef", so the cut falls before it.
  assert.equal(kept, 'Wahoo Bay welcomed the fourth graders of Pompano Beach Elementary for a morning on the');
  assert.equal(caption(1), 'A short caption.');
  assert.equal(caption(2), `${'a'.repeat(44)} ${'b'.repeat(45)}…`);
  assert.equal(caption(3), 'Instagram post', 'a caption with no word boundary is not cut inside its word');
});
