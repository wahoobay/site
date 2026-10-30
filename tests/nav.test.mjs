// The main navigation's Fish ID link (Dan's staging review, 2026-10-30: "no AI dashboard"). The fish-ID app is its own
// site: https://staging-ai.wahoobay.net/ on staging, https://ai.wahoobay.net/ in production. The deploy workflow sets
// PUBLIC_AI_URL per environment; a build without it (local, CI) links staging. The last test reads dist/ (build first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_URL_DEFAULT, aiUrl, mainNav } from '../src/lib/nav.mjs';

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

test('the built nav links Fish ID to this build\'s address, in the same tab, and never marks it current', () => {
  const expected = process.env.PUBLIC_AI_URL ?? STAGING;
  for (const file of ['dist/index.html', 'dist/live/index.html', 'dist/about/index.html']) {
    const nav = readFileSync(file, 'utf8').match(/<nav\b[^>]*aria-label="Main"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    const links = [...nav.matchAll(/<a\b([^>]*)>Fish ID<\/a>/g)].map((m) => m[1]);
    assert.equal(links.length, 1, `${file}: one Fish ID link`);
    assert.equal(links[0].match(/\bhref="([^"]*)"/)?.[1], expected, file);
    assert.match(links[0], /\bclass="wb-nav__link"/, file);
    assert.doesNotMatch(links[0], /\btarget=|\baria-current=|wb-nav__link--on/, file);
  }
});

// Dan's staging review (2026-10-30): at 390px the nav's links row scrolled sideways and About started off-screen.
// @wahoobay/design 0.1.4 wraps the row onto as many rows as it needs up to 30rem (480px).
test('on phones the nav\'s links wrap onto rows instead of scrolling (@wahoobay/design 0.1.4)', () => {
  const design = readFileSync('node_modules/@wahoobay/design/dist/components.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const phone = design.match(/@media \(max-width: 30rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(phone, /\.wb-nav__links\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*visible/, '@wahoobay/design 0.1.4 or later');
  assert.match(readFileSync('package.json', 'utf8'), /"@wahoobay\/design": "github:wahoobay\/design#v0\.1\.4"/);
});
