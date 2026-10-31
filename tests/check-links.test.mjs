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
