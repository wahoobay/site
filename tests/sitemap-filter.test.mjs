// The sitemap leaves out the sighting review (src/lib/sitemap-filter.mjs, given to @astrojs/sitemap in
// astro.config.mjs). The last test reads the built sitemap in dist/ (run `npm run build` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sitemapFilter } from '../src/lib/sitemap-filter.mjs';

const SITE = 'https://wahoobay.net';

test('the filter leaves out every page under /admin/', () => {
  for (const path of ['/admin/', '/admin/anything/', '/admin/a/b/', '/admin']) {
    assert.equal(sitemapFilter(`${SITE}${path}`), false, path);
  }
});

test('the filter keeps every other page, even one whose address only looks like it', () => {
  for (const path of ['/', '/live/', '/sign-in/', '/administration/', '/admins/', '/live/admin/', '/news/admin-tips/']) {
    assert.equal(sitemapFilter(`${SITE}${path}`), true, path);
  }
});

test('astro.config.mjs gives the filter to the sitemap', () => {
  const config = readFileSync('astro.config.mjs', 'utf8');
  assert.match(config, /^import \{ sitemapFilter \} from '\.\/src\/lib\/sitemap-filter\.mjs';$/m);
  assert.match(config, /sitemap\(\{ filter: sitemapFilter \}\)/);
});

test('dist: the built sitemap names no /admin/ page and still names the others', () => {
  const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
  assert.equal(xml.match(/\/admin\//g)?.length ?? 0, 0);
  assert.match(xml, /<loc>https:\/\/wahoobay\.net\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/wahoobay\.net\/sign-in\/<\/loc>/);
  assert.ok((xml.match(/<loc>/g)?.length ?? 0) > 200, 'the other pages are all still there');
});
