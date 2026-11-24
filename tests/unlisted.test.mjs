// Unlisted pages (src/lib/unlisted.mjs): built and reachable at their address, but in no "In this section" list, not
// in the sitemap, and noindex. The one today is the thank-you page Zeffy sends donors to after a gift. The dist:
// tests read the built site (run `npm run build` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { UNLISTED, isUnlisted, parentOf } from '../src/lib/unlisted.mjs';

const THANKS = '/get-involved/support/thank-you/';

test('the thank-you page is unlisted, with or without its trailing slash', () => {
  assert.equal(isUnlisted(THANKS), true);
  assert.equal(isUnlisted('/get-involved/support/thank-you'), true);
});

test('its parent, the home page and a page below it are not', () => {
  for (const path of ['/get-involved/support/', '/', '/get-involved/support/thank-you/x/', '/get-involved/']) {
    assert.equal(isUnlisted(path), false, path);
  }
});

test('parentOf names the page an unlisted page sits under', () => {
  assert.equal(parentOf(THANKS), '/get-involved/support/');
  assert.equal(parentOf('/about/mission/'), '/about/');
});

test('every unlisted address is a page of the pages collection', () => {
  for (const path of UNLISTED) {
    const file = `src/content/pages/${path.replace(/^\/|\/$/g, '')}.md`;
    assert.ok(existsSync(file), `${path}: no ${file}`);
  }
});

/** The "In this section" navigation of a built page. */
const sectionNav = (html) => html.match(/<nav class="site-subnav" aria-label="In this section">[\s\S]*?<\/nav>/)?.[0] ?? '';
/** The <a> in `html` whose href is `href`. */
const linkIn = (html, href) => html.match(new RegExp(`<a\\b[^>]*href="${href}"[^>]*>`))?.[0] ?? '';

test('dist: the thank-you page is noindex, names no canonical address, and sits under Support us', () => {
  const html = readFileSync(`dist${THANKS}index.html`, 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html, /rel="canonical"/);
  const nav = sectionNav(html);
  assert.match(linkIn(nav, '/get-involved/support/'), /\baria-current="true"/);
  assert.equal(nav.match(/aria-current=/g)?.length, 1, 'only Support us is marked');
});

test('dist: Support us lists no thank-you page in its section navigation', () => {
  const html = readFileSync('dist/get-involved/support/index.html', 'utf8');
  const nav = sectionNav(html);
  assert.notEqual(nav, '', 'Support us has its section navigation');
  assert.doesNotMatch(nav, /thank-you/);
});

test('dist: the sitemap does not name the thank-you page', () => {
  assert.doesNotMatch(readFileSync('dist/sitemap-0.xml', 'utf8'), /thank-you/);
});
