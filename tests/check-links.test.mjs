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
