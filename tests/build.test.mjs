// Run after `npm run build`: these tests read the built site in dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

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
  const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.equal(html.match(logo)?.length ?? 0, 1, 'one logo on the page');
  const inNav = nav.match(logo) ?? [];
  assert.equal(inNav.length, 1, 'the logo is in the nav');
  assert.doesNotMatch(inNav[0], /style="color/);
});
