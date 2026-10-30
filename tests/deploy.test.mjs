import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, chmodSync } from 'node:fs';
import { robotsBlocksEverything } from '../scripts/check-robots.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// deploy.sh is exercised against a fake `aws` that records every invocation.
function runDeploy(envName, { authSeeded = true, expectFail = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-test-'));
  for (const d of ['scripts', 'dist', 'bin']) mkdirSync(join(dir, d));
  copyFileSync('scripts/deploy.sh', join(dir, 'scripts/deploy.sh'));
  copyFileSync('scripts/sync-redirects.mjs', join(dir, 'scripts/sync-redirects.mjs'));
  copyFileSync('redirects.json', join(dir, 'redirects.json'));
  writeFileSync(join(dir, 'dist/index.html'), '<title>x</title>');
  copyFileSync('public/robots.txt', join(dir, 'dist/robots.txt')); // what the build copies from public/
  const log = join(dir, 'aws.log');
  writeFileSync(join(dir, 'bin/aws'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
case "$*" in s3\\ sync*) echo "$(tr '\\n' ' ' < dist/robots.txt 2>/dev/null)" >> "${log}.robots";; esac
case "$*" in
  *"Key=='auth'"*) echo '${authSeeded ? 1 : 0}';;
  *list-keys*) echo '{"Items": []}';;
  *describe-key-value-store*) echo '{"ETag": "e1"}';;
  *) echo '{}';;
esac
`);
  chmodSync(join(dir, 'bin/aws'), 0o755);
  const res = spawnSync('bash', ['scripts/deploy.sh', envName], {
    cwd: dir,
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, BUCKET: 'b', DISTRIBUTION_ID: 'D1', KVS_ARN: 'arn:kvs' },
    encoding: 'utf8',
  });
  if (expectFail) return { res, lines: readFileSync(log, 'utf8').trim().split('\n') };
  assert.equal(res.status, 0, res.stderr);
  const lines = readFileSync(log, 'utf8').trim().split('\n');
  lines.robotsAtSync = readFileSync(`${log}.robots`, 'utf8').trim().split('\n');
  return lines;
}

test('both sync passes delete what the build no longer produces', () => {
  const syncs = runDeploy('prod').filter((l) => l.startsWith('s3 sync '));
  assert.equal(syncs.length, 2);
  for (const s of syncs) assert.match(s, /--delete/, s);
  assert.match(syncs[1], /--include \*\.html/);
});

test('staging disallows everything from the first sync on; production ships the built robots.txt', () => {
  const staging = runDeploy('staging');
  assert.equal(staging.robotsAtSync.length, 2);
  for (const r of staging.robotsAtSync) assert.equal(r.trim(), 'User-agent: * Disallow: /');
  assert.ok(!staging.some((l) => l.startsWith('s3 cp ')), 'no after-the-fact robots upload');
  for (const r of runDeploy('prod').robotsAtSync) assert.equal(r.replace(/\s+/g, ' ').trim(), 'User-agent: * Allow: / Sitemap: https://wahoobay.net/sitemap-index.xml');
});

test('public/robots.txt allows indexing and names the sitemap', () => {
  const text = readFileSync('public/robots.txt', 'utf8');
  assert.equal(robotsBlocksEverything(text), false);
  assert.match(text, /^User-agent: \*$/m);
  assert.match(text, /^Allow: \/$/m);
  assert.match(text, /^Sitemap: https:\/\/wahoobay\.net\/sitemap-index\.xml$/m);
});

test('staging refuses to sync when the KVS has no auth key', () => {
  const { res, lines } = runDeploy('staging', { authSeeded: false, expectFail: true });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Rotate the staging password/);
  assert.ok(!lines.some((l) => l.startsWith('s3 sync ')), 'nothing was published');
});

test('only the staging branch of deploy.sh checks the auth key, and before its first sync', () => {
  const src = readFileSync('scripts/deploy.sh', 'utf8');
  const stagingBlock = src.match(/if \[ "\$ENV_NAME" = "staging" \]; then[\s\S]*?\nfi\n/)[0];
  assert.match(stagingBlock, /cloudfront-keyvaluestore list-keys/);
  assert.match(stagingBlock, /Key=='auth'/);
  const before = src.slice(0, src.indexOf('aws s3 sync'));
  assert.ok(before.includes('list-keys'), 'the check precedes the first s3 sync');
  assert.equal(src.split('list-keys').length - 1, 1, 'one check, inside the staging branch');
});
