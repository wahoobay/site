// The main navigation's Fish ID link (Dan's staging review, 2026-10-30: "no AI dashboard"). The fish-ID app is its own
// site: https://staging-ai.wahoobay.net/ on staging, https://ai.wahoobay.net/ in production. The deploy workflow sets
// PUBLIC_AI_URL per environment; a build without it (local, CI) links staging. The last test reads dist/ (build first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_URL_DEFAULT, aiUrl, liveNav, mainNav } from '../src/lib/nav.mjs';

const STAGING = 'https://staging-ai.wahoobay.net/';
const PRODUCTION = 'https://ai.wahoobay.net/';

test('without PUBLIC_AI_URL the fish-ID app is the staging one; with it, the address it names', () => {
  assert.equal(AI_URL_DEFAULT, STAGING);
  assert.equal(aiUrl(undefined), STAGING);
  assert.equal(aiUrl(PRODUCTION), PRODUCTION);
});

test('Fish ID is the top-level item after Live reef, the one that leaves the site', () => {
  const items = mainNav(aiUrl(PRODUCTION));
  assert.deepEqual(items.map(({ label }) => label), ['Visit', 'Learn', 'Live reef', 'Fish ID', 'Get involved', 'About']);
  const [fishId] = items.filter(({ external }) => external);
  assert.deepEqual(fishId, { label: 'Fish ID', href: PRODUCTION, external: true });
  for (const { label, href } of items.filter((item) => item !== fishId)) assert.match(href, /^\/[a-z-]+\/$/, label);
});

test('Nav.astro hands the build\'s PUBLIC_AI_URL to the model', () => {
  assert.match(readFileSync('src/components/Nav.astro', 'utf8'), /\baiUrl\(import\.meta\.env\.PUBLIC_AI_URL\)/);
});

// The design's external icon, inlined as the back links inline arrow-left (Ruling Z: a visible mark that Fish ID leaves
// the site, after its label, as well as the words for a screen reader).
const EXTERNAL = readFileSync('node_modules/@wahoobay/design/dist/icons/external.svg', 'utf8').trim();
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OUT = `${escapeRe(EXTERNAL)}<span class="wb-sr-only"> \\(opens in a new tab\\)</span>`;

test('the built nav links Fish ID to this build\'s address, in a new tab with the external icon, and never marks it current', () => {
  const expected = process.env.PUBLIC_AI_URL ?? STAGING;
  for (const file of ['dist/index.html', 'dist/live/index.html', 'dist/about/index.html']) {
    const nav = readFileSync(file, 'utf8').match(/<nav\b[^>]*aria-label="Main"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    const links = [...nav.matchAll(new RegExp(`<a\\b([^>]*)>Fish ID${OUT}</a>`, 'g'))].map((m) => m[1]);
    assert.equal(links.length, 1, `${file}: one Fish ID link, the icon after its label`);
    assert.equal(links[0].match(/\bhref="([^"]*)"/)?.[1], expected, file);
    assert.match(links[0], /\bclass="wb-nav__link"/, file);
    assert.match(links[0], /\btarget="_blank"/, file);
    assert.match(links[0], /\brel="noopener"/, file);
    assert.doesNotMatch(links[0], /\baria-current=|wb-nav__link--on/, file);
  }
});

// Dan's staging review (2026-10-30): at 390px the nav's links row scrolled sideways and About started off-screen.
// @wahoobay/design 0.1.4 wraps the row onto as many rows as it needs up to 30rem (480px). The pin is 0.3.0 since step
// 2b of the rebuild, which needs its chart series, axes and bars, the offline live badge and the segmented control
// (0.2.2 brought the section navigation, map markers, file button and button states, and the deeper scrims).
test('on phones the nav\'s links wrap onto rows instead of scrolling (@wahoobay/design 0.1.4 or later; pinned 0.3.0)', () => {
  const design = readFileSync('node_modules/@wahoobay/design/dist/components.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const phone = design.match(/@media \(max-width: 30rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(phone, /\.wb-nav__links\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*visible/, '@wahoobay/design 0.1.4 or later');
  assert.match(readFileSync('package.json', 'utf8'), /"@wahoobay\/design": "github:wahoobay\/design#v0\.3\.0"/);
  assert.equal(JSON.parse(readFileSync('node_modules/@wahoobay/design/package.json', 'utf8')).version, '0.3.0', 'npm install after the bump');
});

// The home page's stage (Task 2): the nav lies over the top of the photograph, transparent, its links white
// (wb-nav--over). Only there; every other page keeps the nav on its own ground.
test('the nav lies over the photograph on the home page only', () => {
  const navTag = (file) => readFileSync(file, 'utf8').match(/<nav\b[^>]*aria-label="Main"[^>]*>/)?.[0] ?? '';
  assert.match(navTag('dist/index.html'), /^<nav class="wb-nav wb-nav--over" aria-label="Main">$/);
  for (const file of ['dist/about/index.html', 'dist/live/index.html', 'dist/news/index.html', 'dist/404.html']) {
    assert.match(navTag(file), /^<nav class="wb-nav" aria-label="Main">$/, file);
  }
});

test('liveNav lists the six live items with Fish ID last and external', () => {
  const items = liveNav(PRODUCTION);
  assert.deepEqual(items.map((i) => i.label), ['Camera', 'Reef highlights', 'Species', 'Data dashboards', 'Log a sighting', 'Fish ID']);
  assert.deepEqual(items.map((i) => i.href), ['/live/', '/live/highlights/', '/live/species/', '/live/data/', '/live/log-a-sighting/', PRODUCTION]);
  assert.equal(items.at(-1).external, true);
  assert.equal(items.filter((i) => i.external).length, 1);
});

test('every live page carries the Live reef navigation above its H1, Fish ID last, in a new tab, and its own page current', () => {
  const expected = process.env.PUBLIC_AI_URL ?? STAGING;
  const pages = { live: '/live/', 'live/highlights': '/live/highlights/', 'live/species': '/live/species/', 'live/data': '/live/data/', 'live/log-a-sighting': '/live/log-a-sighting/' };
  for (const [p, here] of Object.entries(pages)) {
    const html = readFileSync(`dist/${p}/index.html`, 'utf8');
    const nav = html.match(/<nav\b(?=[^>]*\bclass="site-subnav")(?=[^>]*\baria-label="Live reef")[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    assert.ok(nav, `${p}: the Live reef navigation`);
    // Ruling Z: one order on every page, as Page.astro has it: the section navigation first in the article, then the H1.
    const main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/)?.[1] ?? '';
    assert.ok(main.indexOf(nav) >= 0 && main.indexOf(nav) < main.indexOf('<h1'), `${p}: the navigation is above the H1`);
    assert.match(main, new RegExp(`^<div class="wb-container site-article[^"]*">${escapeRe(nav)}`), `${p}: first in the article`);
    assert.match(nav, /^<nav class="site-subnav" aria-label="Live reef"><ul class="wb-subnav">/, `${p}: the design's section navigation`);
    assert.match(nav, new RegExp(`>Fish ID${OUT}</a>`), `${p}: Fish ID carries the external icon`);
    const links = [...nav.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]);
    assert.equal(links.length, 6, p);
    assert.equal(links.at(-1).match(/\bhref="([^"]*)"/)?.[1], expected, p);
    assert.match(links.at(-1), /\btarget="_blank"/, p);
    assert.match(links.at(-1), /\brel="noopener"/, p);
    assert.doesNotMatch(links.at(-1), /aria-current/, p);
    assert.equal(links.filter((a) => /aria-current="page"/.test(a)).length, 1, p);
    assert.match(links.find((a) => /aria-current="page"/.test(a)), new RegExp(`href="${here}"`), p);
  }
});

// Ruling Z: every section navigation is the design's .wb-subnav (site-subnav keeps only the margin under it), and every
// link in one that leaves the site carries the external icon after its label.
test('every section navigation is the design\'s wb-subnav; every external link in one has the external icon', async () => {
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = readdirSync('dist', { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.html')).map((e) => join(e.parentPath, e.name));
  let navs = 0;
  let external = 0;
  for (const file of files) {
    for (const [nav] of readFileSync(file, 'utf8').matchAll(/<nav class="site-subnav[^"]*"[^>]*>[\s\S]*?<\/nav>/g)) {
      navs += 1;
      assert.match(nav, /^<nav class="site-subnav[^"]*"[^>]*><ul class="wb-subnav">/, `${file}: ${nav.slice(0, 80)}`);
      for (const [a] of nav.matchAll(/<a\b[^>]*target="_blank"[^>]*>[\s\S]*?<\/a>/g)) {
        external += 1;
        assert.match(a, new RegExp(`${OUT}</a>$`), `${file}: ${a.slice(0, 80)}`);
      }
    }
  }
  assert.ok(navs >= 20, `${navs} section navigations`);
  assert.ok(external >= 5, `${external} external links, one on each live page`);
  const css = readFileSync('src/styles/site.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /\.site-subnav (ul|li)\b/, 'the row is the design\'s, not site layout');
});
