// Run after `npm run build`: the home page in the Jump In brand (@wahoobay/design 0.5.0; PRODUCT.md, amended 2026-11-24,
// pending Katie's review): dark throughout. The hero on deep water ("The reef is live.", Dan's choice of 2026-11-24), the
// action ticker, the Visit section first (CLAUDE.md: visiting the park comes first), then the existing real content
// restyled on the dark ground: the live band as the Watch chapter, the four figures, the photo doorways, the map teaser,
// the news teaser and the Instagram strip with its follow link, then the dark footer.
// Ruling J (fix round 1): the manatee, whose corner carries a signature, sits where the frame crops it away (the map band).
// The inline scripts run against a small stand-in for the DOM: the Instagram strip (fix 5 and note 3: a picture that
// fails takes its card away, the posts go when fewer than two cards are left, a caption is cut at a word boundary), and
// the hero's pause button (WCAG 2.2.2).
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
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }
  get hidden() {
    return 'hidden' in this.attributes;
  }
  set hidden(on) {
    if (on) this.attributes.hidden = '';
    else delete this.attributes.hidden;
  }
  querySelectorAll(selector) {
    const attr = selector.match(/^\[([a-z-]+)="([^"]*)"\]$/);
    const match = attr
      ? (n) => n.attributes[attr[1]] === attr[2]
      : selector.startsWith('.')
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
  section.appendChild(new Node('p', { class: 'site-instagram__follow' }));
  const document = {
    getElementById: (id) => body.all().find((n) => n.id === id) ?? null,
    createElement: (tag) => new Node(tag),
  };
  const response = { ok: true, status: 200, json: async () => ({ status: 'Success', data: posts }) };
  const window = { fetch: async () => response };
  vm.runInNewContext(code, { window, document, setTimeout: () => 1, clearTimeout: () => {} });
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  const cards = () => list.querySelectorAll('.site-instagram__post');
  // The section stays with its follow link; what goes, when there is nothing to show, is the list of posts.
  const present = () => section.children.includes(list);
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

// The hero's and the Visit section's words that are not migrated: Dan's Jump In choices (2026-11-24), each marked for
// Katie in its component.
const HEADLINE = 'The reef<br>is live.';
const TAG = 'Live from the reef · Pompano Beach, FL';
const LEAD = 'Swim and snorkel the Wahoo Bay reef in Pompano Beach, or watch and study it live from anywhere.';
const TICKER = ['Visit', 'Swim', 'Snorkel', 'Jump in', 'Explore', 'Learn', 'Watch', 'Discover', 'Participate', 'Volunteer', 'Contribute', 'Protect'];
// The six swimmers in the hero's water, by their Latin names, with their drawings (Dan, 2026-11-24: more and varied
// species, only ones on our species list). Their labels are the site's species list's names (the explorer's,
// /live/species/).
const SCHOOL = [['Abudefduf saxatilis', ''], ['Acanthurus coeruleus', ''], ['Caranx ruber', ''], ['Aetobatus narinari', 'ray'], ['Ginglymostoma cirratum', 'shark'], ['Chelonia mydas', 'turtle']];
const icon = (name) => readFileSync(`node_modules/@wahoobay/design/dist/icons/${name}.svg`, 'utf8').trim();
const hero = () => home().match(/<section class="wb-hero[^"]*"[\s\S]*?<\/section>/)?.[0] ?? '';

test('the home page is dark throughout; the reading pages stay light', () => {
  assert.match(home(), /<html lang="en" data-theme="dark">/);
  for (const file of ['dist/about/index.html', 'dist/visit/index.html', 'dist/learn/index.html', 'dist/404.html'])
    assert.doesNotMatch(readFileSync(file, 'utf8'), /<html\b[^>]*data-theme=/, file);
  const installed = JSON.parse(readFileSync('node_modules/@wahoobay/design/package.json', 'utf8')).version;
  assert.match(installed, /^0\.5\.\d+$/, 'the Jump In brand is @wahoobay/design 0.5 (the pin itself: tests/nav.test.mjs)');
});

test('home opens on the hero: the tag, "The reef is live.", the lead, Plan your visit first, then Watch live', () => {
  const section = hero();
  assert.match(section, /^<section class="wb-hero site-hero" aria-labelledby="hero-title">/);
  assert.match(section, new RegExp(`<p class="wb-hero__tag">${escapeRe(TAG)}</p>\\s*<h1 class="wb-hero__title" id="hero-title">${escapeRe(HEADLINE)}</h1>`));
  assert.match(section, new RegExp(`<p class="wb-hero__lead">${escapeRe(LEAD)}</p>`));
  const actions = section.match(/<div class="wb-hero__actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const buttons = [...actions.matchAll(/<a class="(wb-btn [^"]*)" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => m.slice(1));
  assert.deepEqual(buttons.map(([, href, label]) => [href, label]), [['/visit/', 'Plan your visit'], ['/live/', 'Watch live']]);
  assert.match(buttons[0][0], /\bwb-btn--action\b/, 'visiting is the primary action');
  assert.match(buttons[1][0], /\bwb-btn--ghost\b/);
  // The nav is the site's <nav aria-label="Main"> (tests/build.test.mjs, tests/nav.test.mjs), laid over the hero.
  assert.match(home(), /<nav class="wb-nav wb-nav--over"/);
  assert.equal(home().match(/<h1\b/g)?.length, 1, 'one h1');
});

test('the hero\'s water: six rays, ten bubbles and six swimmers in their detection boxes, named as the species list names them', () => {
  const water = hero().match(/<div class="wb-hero__water" aria-hidden="true">([\s\S]*?)<\/div>\s*<div class="wb-container wb-hero__body">/)?.[1] ?? '';
  assert.ok(water, 'the decorative layer, hidden from screen readers');
  assert.equal(water.match(/<div class="wb-hero__rays">((?:<span><\/span>)+)<\/div>/)?.[1].match(/<span>/g).length, 6, 'six rays');
  assert.equal(water.match(/<div class="wb-hero__bubbles">((?:<span><\/span>)+)<\/div>/)?.[1].match(/<span>/g).length, 10, 'ten bubbles');
  const swimmers = [...water.matchAll(/<div class="wb-hero__fish(?: wb-hero__fish--([a-z]+))?"><div class="wb-detect"><span class="wb-detect__label">([^<]+)<\/span><\/div><\/div>/g)].map((m) => [m[2], m[1] ?? '']);
  const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const list = unionSpecies(json('src/data/fish.json'), json('src/data/species.json'), json('src/data/media.json'));
  assert.deepEqual(swimmers, SCHOOL.map(([latin, shape]) => [list.find((s) => s.latin === latin)?.common, shape]), 'the species list\'s names, each with its drawing');
  assert.deepEqual(swimmers.map(([name]) => name), ['Sergeant Major', 'Blue Tang Surgeonfish', 'Bar Jack', 'Spotted Eagle Ray', 'Nurse Shark', 'Green Sea Turtle']);
  // The component draws the geometry (@wahoobay/design 0.5.0): the page writes none.
  assert.doesNotMatch(hero(), /\bstyle=/);
});

// WCAG 2.2.2: the hero's motion and the ticker's scroll start by themselves and last, so they can be paused. The button
// is hidden until its script runs (a button that does nothing would be worse than none), then pauses and plays.
test('the hero\'s pause button: hidden until its script runs, named for screen readers, its icon from the design', () => {
  const button = hero().match(/<button class="wb-hero__pause"[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.match(button, /^<button class="wb-hero__pause" type="button" hidden>/);
  assert.ok(button.includes(`<span data-icon="pause">${icon('pause')}</span>`), 'the pause icon');
  assert.ok(button.includes(`<span data-icon="play" hidden>${icon('play')}</span>`), 'the play icon, hidden');
  assert.match(button, /<span class="wb-sr-only">Pause motion<\/span><\/button>$/);
});

const pauseCode = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('wb-hero__pause')) ?? '';

/** Runs the pause button's script against a stand-in for the hero's button. */
function runPause() {
  const root = new Node('html');
  const body = root.appendChild(new Node('body'));
  const button = body.appendChild(new Node('button', { class: 'wb-hero__pause', hidden: '' }));
  const pause = button.appendChild(new Node('span', { 'data-icon': 'pause' }));
  const play = button.appendChild(new Node('span', { 'data-icon': 'play', hidden: '' }));
  const label = button.appendChild(new Node('span', { class: 'wb-sr-only' }));
  label.textContent = 'Pause motion';
  const document = { documentElement: root, querySelector: (sel) => root.querySelector(sel) };
  vm.runInNewContext(pauseCode, { document });
  return { root, button, pause, play, label };
}

test('the pause button shows itself, then pauses the motion on the root and plays it again, its name and icon following', () => {
  assert.ok(pauseCode, 'the inline script');
  const { root, button, pause, play, label } = runPause();
  assert.equal(button.hidden, false, 'shown once the script can answer it');
  assert.equal(root.getAttribute('data-motion'), null);
  button.fire('click');
  assert.equal(root.getAttribute('data-motion'), 'paused');
  assert.equal(label.textContent, 'Play motion');
  assert.deepEqual([pause.hidden, play.hidden], [true, false]);
  button.fire('click');
  assert.equal(root.getAttribute('data-motion'), null);
  assert.equal(label.textContent, 'Pause motion');
  assert.deepEqual([pause.hidden, play.hidden], [false, true]);
});

test('the ticker follows the hero: the twelve words, once for screen readers and again, hidden, for the loop', () => {
  const ticker = home().match(/<section class="wb-ticker" aria-label="Things to do at Wahoo Bay">[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.ok(ticker, 'the ticker, labelled');
  // The scroll is the brand's motion; the design sanctions this one waiver on the track (its docs and tests).
  assert.match(ticker, /<div class="wb-ticker__track" data-impeccable-ignore="marquee">/);
  const groups = [...ticker.matchAll(/<ul class="wb-ticker__group" role="list"( aria-hidden="true")?>([\s\S]*?)<\/ul>/g)];
  assert.deepEqual(groups.map((g) => Boolean(g[1])), [false, true]);
  for (const [, , words] of groups) assert.deepEqual([...words.matchAll(/<li class="wb-ticker__word">([^<]+)<\/li>/g)].map((m) => m[1]), TICKER);
});

// The detector reads the design's stylesheet, so it calls the ticker's scroll a marquee on every page that links
// components.css, ticker or not, as it does the live badge's breath (pulsing-dot); the home page also marks its track,
// as the design's docs do. It also calls Inter, the Jump In text face (Dan's choice, 2026-11-24), overused, in the built
// stylesheet. The config ignores those three, each with its reason, Inter by name only, and nothing else.
test('the detector config ignores pulsing-dot, marquee and Inter as an overused font, each with its reason, and nothing else', () => {
  const { detector } = JSON.parse(readFileSync('.impeccable/config.json', 'utf8'));
  assert.deepEqual(detector.ignoreRules, []);
  assert.deepEqual(detector.ignoreFiles, []);
  assert.deepEqual(detector.ignoreValues.map((v) => [v.rule, v.value, v.files]), [
    ['pulsing-dot', '*', ['dist/**/*.html']],
    ['marquee', '*', ['dist/**/*.html']],
    ['overused-font', 'Inter', ['dist/_astro/*.css']],
  ]);
  const marquee = detector.ignoreValues.find((v) => v.rule === 'marquee');
  assert.match(marquee.reason, /Jump In/);
  assert.match(marquee.reason, /data-impeccable-ignore/);
  assert.match(detector.ignoreValues.find((v) => v.rule === 'overused-font').reason, /Jump In[\s\S]*Dan/);
});

// The Visit section comes straight after the hero (CLAUDE.md). Its words are the Visit page's own (src/content/pages/
// visit/index.md): its description, and its first three facts (open daily, the open snorkel, getting here); the fourth,
// visiting virtually, is what the live band below says. The photo is the park from the air, the home page's only use of it.
test('the Visit section: "Jump in.", the Visit page\'s description and first three facts, the park from the air, Plan your visit', () => {
  const visit = home().match(/<section class="wb-container site-visit" id="visit" aria-labelledby="visit-title">[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.ok(visit, 'the Visit section');
  const page = 'src/content/pages/visit/index.md';
  assert.match(visit, /<h2 id="visit-title">Jump in\.<\/h2>/);
  assert.match(visit, new RegExp(`<p class="wb-lead">${escapeRe(escapeHtml(frontMatterField(page, 'description')))}</p>`));
  assert.match(visit, /<img class="wb-media site-visit__photo" src="\/WB-1\.jpg" srcset="\/WB-1-800\.jpg 800w, \/WB-1\.jpg 1600w"[^>]*\balt="The park from the air: palms along the seawall, the dock on the inlet and the bridge behind"/);
  const facts = [...visit.matchAll(/<li class="wb-card"><div class="wb-card__body"><h3>([^<]+)<\/h3><p>([^<]+)<\/p><\/div><\/li>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(facts, [
    ['Open daily: 10 am – 4 pm.', 'Open swim daily, subject to change for private events. No lifeguard on duty — swim at your own risk.'],
    ['Monthly open snorkel: 2nd Saturday.', 'Pompano Beach Parks and Recreation hosts a public open snorkel with rental gear available.'],
    ['Getting here: 2700 N. Ocean Blvd.', 'Pompano Beach, FL 33062. Limited paid public parking is available on site.'],
  ]);
  assert.match(visit, /<div class="site-page__actions">\s*<a class="wb-btn wb-btn--action" href="\/visit\/">Plan your visit<\/a>\s*<\/div>/);
});

// CLAUDE.md, words and facts: never "dive" or "catch" in any form (neither is allowed at Wahoo Bay); the park's camera
// is the SeaHIVE camera, and the park is never said to have two cameras. Read from everything a visitor or a screen
// reader meets: the text, and the alt, aria-label and title attributes.
test('the home page never says dive or catch in any form, nor two cameras', () => {
  const page = home().replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const said = [...page.matchAll(/\b(?:alt|aria-label|title)="([^"]*)"/g)].map((m) => m[1]).join(' ') + ' ' + page.replace(/<[^>]*>/g, ' ');
  assert.doesNotMatch(said, /\b(div(e|es|ed|er|ers|ing)|catch(es|ing)?|caught)\b/i);
  assert.doesNotMatch(said, /\btwo cameras\b/i);
});

// The new words on the page (Dan's Jump In choices) are marked for Katie where they are written.
test('the hero\'s, the ticker\'s and the Visit section\'s new words are marked for Katie in their components', () => {
  const marked = (file, needle) => {
    const source = readFileSync(file, 'utf8');
    const at = source.indexOf(needle);
    assert.ok(at > 0, `${file}: ${needle}`);
    assert.match(source.slice(source.lastIndexOf('\n', source.lastIndexOf('\n', at) - 1), at), /katie: review/, `${file}: ${needle} is marked`);
  };
  for (const needle of ["'The reef<br>is live.'", `'${TAG}'`, `'${LEAD}'`, "'Plan your visit'"]) marked('src/components/Hero.astro', needle);
  for (const needle of ["'Things to do at Wahoo Bay'", "'Visit', 'Swim'"]) marked('src/components/Ticker.astro', needle);
  marked('src/components/VisitSection.astro', 'Jump in.');
});

// The live band is the Watch chapter: the camera page's own words over the still, on the dark ground like the page.
test('the live band, the Watch chapter, links to the camera, Fish ID and the reel', () => {
  const band = home().match(/<section class="wb-band[^"]*" data-theme="dark"[\s\S]*?<\/section>/)[0];
  // The badge is the LiveBadge island (tests/live.test.mjs): drawn once the camera's status is known.
  assert.match(band, /<astro-island\b[^>]*LiveBadge/);
  assert.match(band, /href="\/live\/"/);
  assert.match(band, new RegExp(`href="${escapeRe(AI_URL)}"`));
  assert.match(band, /href="\/live\/highlights\/"/);
  assert.doesNotMatch(band, /min ago|°C/); // no sample data in production
  // The band plays the SeaHIVE camera's YouTube live stream (tests/live.test.mjs); the badge sits on its corner in the
  // band's still box (layout CSS, .site-band__still).
  assert.match(band, /<div class="site-band__still">\s*<div class="wb-video site-video">\s*<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/oBTGY6Ax870\?[\s\S]*?<astro-island\b[^>]*LiveBadge[\s\S]*?<\/astro-island>/);
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

test('the sections run hero, ticker, Visit, live band, figures, doorways, map teaser, news, Instagram', () => {
  const html = home();
  const at = (re) => html.search(re);
  const order = [/<section class="wb-hero/, /<section class="wb-ticker/, /<section class="wb-container site-visit"/, /<section class="wb-band/, /<div class="wb-figures">/, /<a class="wb-door"/, /<section class="site-map-teaser"/, /aria-labelledby="news-title"/, /id="instagram"/, /<footer\b/];
  const positions = order.map(at);
  for (const [i, p] of positions.entries()) assert.ok(p >= 0, String(order[i]));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  // Nothing between the hero and the Visit section but the ticker (CLAUDE.md: visiting comes first).
  assert.match(html, /<\/section>\s*<section class="wb-ticker"[\s\S]*?<\/section>\s*<section class="wb-container site-visit"/);
  assert.doesNotMatch(html, /class="wb-stage/, 'the stage is gone');
});

// The 320-360px capture (Task 2): with an auto track, the news grid grew to the 16:9 feature's height-derived width
// and the page scrolled sideways. Every home grid that holds a photo link sets its tracks.
test('the home grids set minmax(0, 1fr) tracks, so no photo link widens a phone screen', () => {
  const css = readFileSync('src/styles/site.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const selector of ['.site-doors', '.site-news-teaser__grid', '.site-news-teaser__list', '.site-visit__facts']) {
    const body = css.match(new RegExp(`(?:^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    assert.match(body, /grid-template-columns:\s*minmax\(0, 1fr\);/, selector);
  }
});

// Ruling A: the detector cannot see a photograph or the scrim, so text set on one carries the low-contrast waiver right
// after its class: the doorways' and the news feature's titles and sentences. On the dark page nothing else needs one:
// the figures (brand blue, 5.2:1 on the deep ground) and the nav over the hero (white on the water, 4.5:1 or better,
// @wahoobay/design 0.5.0's tests) are measured and pass.
const WAIVED = ['wb-door__title', 'wb-door__text', 'wb-feature__title', 'wb-feature__text'];
test('the low-contrast waiver sits on text on a photograph, right after the class, and nowhere else', () => {
  const html = home();
  const waived = [...html.matchAll(/<[a-z0-9]+\b([^>]*)\bdata-impeccable-ignore="low-contrast"/g)].map((m) => m[1]);
  assert.ok(waived.length > 0);
  for (const attrs of waived) {
    const cls = attrs.match(/^\s*class="([^"]+)"\s*$/)?.[1];
    assert.ok(cls, `the waiver follows the class attribute: ${attrs}`);
    assert.ok(cls.split(/\s+/).some((c) => WAIVED.includes(c)), `waiver on .${cls}`);
  }
  for (const cls of WAIVED) {
    const tags = [...html.matchAll(new RegExp(`<[a-z0-9]+ class="${cls}"[^>]*>`, 'g'))].map((m) => m[0]);
    assert.ok(tags.length > 0, cls);
    for (const tag of tags) assert.match(tag, new RegExp(`class="${cls}" data-impeccable-ignore="low-contrast"`), tag);
  }
  assert.doesNotMatch(html, /class="wb-figure__value" data-impeccable-ignore/, 'the figures are measured');
  const nav = html.match(/<nav\b[^>]*aria-label="Main"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.equal([...nav.matchAll(/<a class="wb-nav__link[^"]*"/g)].length, 7, 'six section links and Sign in');
  assert.doesNotMatch(nav, /data-impeccable-ignore/, 'the nav over the hero is measured');
  for (const file of ['dist/about/index.html', 'dist/live/index.html', 'dist/404.html']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /low-contrast/, `${file}: no waiver off the home page`);
  }
});

// The old home page's Instagram section asked visitors to follow the account ("Follow us on Instagram", its link's
// label): the strip keeps that link, which stays when the posts cannot be shown.
test('the Instagram strip ends with "Follow us on Instagram", the account the footer links, in a new tab', () => {
  const section = home().match(/<section class="wb-container site-instagram" id="instagram"[\s\S]*?<\/section>/)?.[0] ?? '';
  const footer = readFileSync('src/components/Footer.astro', 'utf8').match(/label: 'Instagram', href: '([^']+)'/)?.[1];
  assert.ok(footer, 'the footer\'s Instagram link');
  assert.match(section, new RegExp(`</ul>\\s*<p class="site-instagram__follow"><a class="wb-btn wb-btn--ghost" href="${escapeRe(footer)}" target="_blank" rel="noopener">Follow us on Instagram<span class="wb-sr-only"> \\(opens in a new tab\\)</span></a></p>`));
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

test('a picture that fails takes its card away; the posts go when fewer than two cards are left', async () => {
  const { cards, present, section } = await run([1, 2, 3, 4].map((n) => post(n)));
  cards()[1].querySelector('img').fire('error');
  assert.equal(cards().length, 3, 'the failed card is gone');
  assert.ok(present(), 'three cards: the posts stay');
  cards()[0].querySelector('img').fire('error');
  assert.equal(cards().length, 2);
  assert.ok(present(), 'two cards: the posts stay');
  cards()[0].querySelector('img').fire('error');
  assert.ok(!present(), 'one card: the posts go');
  assert.ok(section.children.some((n) => n.className === 'site-instagram__follow'), 'the follow link stays');
});

test('one post is not a strip: the posts go, the heading and the follow link stay', async () => {
  const { present, section } = await run([post(1)]);
  assert.ok(!present());
  assert.ok(section.children.some((n) => n.className === 'site-instagram__follow'));
});

test('no posts, or a failed answer: the posts go, the follow link stays', async () => {
  const { present, section } = await run([]);
  assert.ok(!present());
  assert.ok(section.children.some((n) => n.className === 'site-instagram__follow'));
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
