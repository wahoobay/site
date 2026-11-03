// Run after `npm run build`: these tests read the built site in dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const navOf = (html) => html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? '';
const DONATE = 'https://www.zeffy.com/en-US/donation-form/together-for-tomorrow-2';
// The fish-ID app: the deploy workflow sets PUBLIC_AI_URL per environment; a build without it links staging.
const AI_URL = process.env.PUBLIC_AI_URL ?? 'https://staging-ai.wahoobay.net/';

test('home page has the navigation and no page-local colours', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  for (const label of ['Visit', 'Learn', 'Live reef', 'Get involved', 'About', 'Donate']) assert.ok(html.includes(`>${label}<`), label);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{20,}"/);
  assert.doesNotMatch(html, /style="/);
  // Astro emits the 404 route as dist/404.html whatever build.format says; the CloudFront stack serves /404.html.
  assert.ok(existsSync('dist/404.html'));
  assert.ok(existsSync('dist/sitemap-index.xml'));
});

test('the nav inlines the logo once, following currentColor', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const logo = /<svg\b[^>]*\baria-label="Wahoo Bay"[^>]*>/g;
  assert.equal(html.match(logo)?.length ?? 0, 1, 'one logo on the page');
  const inNav = navOf(html).match(logo) ?? [];
  assert.equal(inNav.length, 1, 'the logo is in the nav');
  assert.doesNotMatch(inNav[0], /style="color/);
  assert.match(inNav[0], /\bfill="currentColor"/);
});

test('the nav links the eight destinations in order; Donate opens the Zeffy form in a new tab and says so', () => {
  const nav = navOf(readFileSync('dist/index.html', 'utf8'));
  const hrefs = [...nav.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['/', '/visit/', '/learn/', '/live/', AI_URL, '/get-involved/', '/about/', DONATE, '/sign-in/']);
  const donate = nav.match(/<a\b[^>]*\bhref="https:\/\/www\.zeffy\.com[^"]*"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
  assert.match(donate, /\btarget="_blank"/);
  assert.match(donate, /\brel="noopener"/);
  assert.match(donate, /<span class="wb-sr-only">\s*\(opens in a new tab\)<\/span>/);
  assert.doesNotMatch(nav, /aria-current=/, 'the home page marks no section');
});

test('every page starts with a skip link to the main content', () => {
  for (const file of ['dist/index.html', 'dist/404.html']) {
    const html = readFileSync(file, 'utf8');
    assert.match(html, /<body>\s*<a class="wb-skip" href="#main">Skip to content<\/a>/, file);
    assert.match(html, /<main id="main">/, file);
  }
});

test('the home page has a canonical URL; the 404 page is noindex and names none', () => {
  const home = readFileSync('dist/index.html', 'utf8');
  assert.match(home, /<link rel="canonical" href="https:\/\/wahoobay\.org\/">/);
  assert.match(home, /<meta property="og:url" content="https:\/\/wahoobay\.org\/">/);
  assert.doesNotMatch(home, /name="robots"/);
  const notFound = readFileSync('dist/404.html', 'utf8');
  assert.match(notFound, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(notFound, /rel="canonical"/);
  assert.doesNotMatch(notFound, /og:url/);
});

test('photos inside the doorway, feature and news links are decorative, so each link is named by its text', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const doors = [...html.matchAll(/<a class="wb-door"[\s\S]*?<\/a>/g)].map((m) => m[0]);
  assert.equal(doors.length, 3);
  for (const door of doors) assert.match(door, /<img class="wb-door__photo"[^>]*\balt=""/, door.slice(0, 60));
  const links = [...html.matchAll(/<a class="wb-(?:feature|card)"[\s\S]*?<\/a>/g)].map((m) => m[0]);
  assert.equal(links.length, 3, 'the news teaser\'s feature and two cards');
  for (const link of links) {
    for (const [img] of link.matchAll(/<img\b[^>]*>/g)) assert.match(img, /\balt=""/, img);
  }
});

test('dist/robots.txt is the allow version, naming the sitemap', () => {
  const text = readFileSync('dist/robots.txt', 'utf8');
  assert.doesNotMatch(text, /^Disallow:\s*\/\s*$/m);
  assert.match(text, /^Allow: \/$/m);
  assert.match(text, /^Sitemap: https:\/\/wahoobay\.org\/sitemap-index\.xml$/m);
});

test('the site\'s address is wahoobay.org: the sitemap, and wahoobay.net only for the hosts that stay there', () => {
  // Spec amendment 2026-11-02: wahoobay.net redirects to wahoobay.org from the cutover; the Java API (api.), the fish-ID
  // app (ai., staging-ai.) stay on wahoobay.net, and the sighting page's no-script line names the old form's address.
  // Lower case only: "WahooBay.net portal" in the About page's timeline is the old portal's name, history, not an address.
  assert.match(readFileSync('dist/sitemap-0.xml', 'utf8'), /<loc>https:\/\/wahoobay\.org\/<\/loc>/);
  assert.doesNotMatch(readFileSync('dist/sitemap-0.xml', 'utf8'), /wahoobay\.net/);
  const stay = new Set(['api.wahoobay.net', 'ai.wahoobay.net', 'staging-ai.wahoobay.net']);
  const OLD = 'https://wahoobay.net/pages/intake/report';
  const stray = [];
  for (const file of readdirSync('dist', { recursive: true }).filter((f) => /\.(html|xml|txt|js|json)$/.test(f))) {
    const text = readFileSync(`dist/${file}`, 'utf8').replaceAll(OLD, '');
    for (const [host] of text.matchAll(/[a-z0-9.-]*wahoobay\.net/g)) if (!stay.has(host)) stray.push(`${file}: ${host}`);
  }
  assert.deepEqual(stray, []);
});
