import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(pages) {
  const dir = mkdtempSync(join(tmpdir(), 'links-test-'));
  for (const [name, html] of Object.entries(pages)) {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, 'index.html'), html);
  }
  return spawnSync('node', ['scripts/check-links.mjs', dir], { encoding: 'utf8' });
}

test('a clean site exits 0', () => {
  const res = run({ '.': '<a href="/about/">a</a><img src="/about/index.html" alt="x">', about: '<a href="/">home</a>' });
  assert.equal(res.status, 0, res.stderr);
});

test('a broken internal link exits non-zero and names it', () => {
  const res = run({ '.': '<a href="/missing/">m</a>', about: '<p>hi</p>' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /broken link "\/missing\/"/);
});

test('an image without alt exits non-zero', () => {
  assert.equal(run({ '.': '<img src="/about/index.html">', about: '<p>hi</p>' }).status, 1);
});

// The site's distribution sends /api/public/ to the fish-ID app (spec §4.2): a picture there (a species' latest crop or
// reference photo) is the app's to serve, never a file in dist/. Any other path under /api/ is still checked.
test('a path under /api/public/ is the fish-ID app\'s, not a file in dist/; the rest of /api/ is still checked', () => {
  assert.equal(run({ '.': '<img src="/api/public/detections/1/crop.jpg" alt=""><img src="/api/public/species/Ablennes%20hians/photo.jpg" alt="">' }).status, 0);
  const res = run({ '.': '<img src="/api/private/x.jpg" alt=""><a href="/api/publicity/">p</a>' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /broken link "\/api\/private\/x\.jpg"/);
  assert.match(res.stderr, /broken link "\/api\/publicity\/"/);
});

// The downloads page links the public exports (Task 10): those links are skipped, and the summary says how many, so a
// run that skips more than it checks is visible. href, src and each srcset candidate count once each.
test('the summary counts the links under /api/public/ it skipped, beside the internal links it checked', () => {
  const res = run({
    '.': '<a href="/api/public/exports/events.csv?days=7">CSV</a><a href="/api/public/exports/README.md">README</a><a href="/about/">a</a>',
    about: '<img src="/api/public/detections/1/crop.jpg" srcset="/api/public/a.jpg 1x, /api/public/b.jpg 2x" alt=""><a href="https://example.org/">x</a>',
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^Checked 2 HTML files, 1 internal links; skipped 5 links under \/api\/public\/ \(the fish-ID app's\)\.$/m);
  assert.match(run({ '.': '<a href="/">home</a>' }).stdout, /; skipped 0 links under \/api\/public\//);
});
