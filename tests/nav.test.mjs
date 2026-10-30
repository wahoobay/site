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

test('the built nav links Fish ID to this build\'s address, in a new tab, and never marks it current', () => {
  const expected = process.env.PUBLIC_AI_URL ?? STAGING;
  for (const file of ['dist/index.html', 'dist/live/index.html', 'dist/about/index.html']) {
    const nav = readFileSync(file, 'utf8').match(/<nav\b[^>]*aria-label="Main"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    const links = [...nav.matchAll(/<a\b([^>]*)>Fish ID<span class="wb-sr-only"> \(opens in a new tab\)<\/span><\/a>/g)].map((m) => m[1]);
    assert.equal(links.length, 1, `${file}: one Fish ID link`);
    assert.equal(links[0].match(/\bhref="([^"]*)"/)?.[1], expected, file);
    assert.match(links[0], /\bclass="wb-nav__link"/, file);
    assert.match(links[0], /\btarget="_blank"/, file);
    assert.match(links[0], /\brel="noopener"/, file);
    assert.doesNotMatch(links[0], /\baria-current=|wb-nav__link--on/, file);
  }
});

// Dan's staging review (2026-10-30): at 390px the nav's links row scrolled sideways and About started off-screen.
// @wahoobay/design 0.1.4 wraps the row onto as many rows as it needs up to 30rem (480px). The pin is 0.2.1 since the
// Deep Field home page (Task 2), which needs its stage, band, figures, doorways and feature.
test('on phones the nav\'s links wrap onto rows instead of scrolling (@wahoobay/design 0.1.4 or later; pinned 0.2.1)', () => {
  const design = readFileSync('node_modules/@wahoobay/design/dist/components.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const phone = design.match(/@media \(max-width: 30rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(phone, /\.wb-nav__links\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*visible/, '@wahoobay/design 0.1.4 or later');
  assert.match(readFileSync('package.json', 'utf8'), /"@wahoobay\/design": "github:wahoobay\/design#v0\.2\.1"/);
  assert.equal(JSON.parse(readFileSync('node_modules/@wahoobay/design/package.json', 'utf8')).version, '0.2.1', 'npm install after the bump');
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

test('every live page carries the Live reef navigation with Fish ID last, in a new tab, and its own page current', () => {
  const expected = process.env.PUBLIC_AI_URL ?? STAGING;
  const pages = { live: '/live/', 'live/highlights': '/live/highlights/', 'live/species': '/live/species/', 'live/data': '/live/data/', 'live/log-a-sighting': '/live/log-a-sighting/' };
  for (const [p, here] of Object.entries(pages)) {
    const html = readFileSync(`dist/${p}/index.html`, 'utf8');
    const nav = html.match(/<nav\b(?=[^>]*\bclass="site-subnav")(?=[^>]*\baria-label="Live reef")[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    assert.ok(nav, `${p}: the Live reef navigation`);
    const links = [...nav.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]);
    assert.equal(links.length, 6, p);
    assert.equal(links.at(-1).match(/\bhref="([^"]*)"/)?.[1], expected, p);
    assert.match(links.at(-1), /\btarget="_blank"/, p);
    assert.match(links.at(-1), /\brel="noopener"/, p);
    assert.doesNotMatch(links.at(-1), /aria-current/, p);
    assert.match(nav, /Fish ID<span class="wb-sr-only"> \(opens in a new tab\)<\/span>/, p);
    assert.equal(links.filter((a) => /aria-current="page"/.test(a)).length, 1, p);
    assert.match(links.find((a) => /aria-current="page"/.test(a)), new RegExp(`href="${here}"`), p);
  }
});
