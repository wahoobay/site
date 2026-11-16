import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, chmodSync } from 'node:fs';
import { robotsBlocksEverything } from '../scripts/check-robots.mjs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// deploy.sh is exercised against a fake `aws` that records every invocation.
function runDeploy(envName, { authSeeded = true, expectFail = false, stagingOnly = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-test-'));
  for (const d of ['scripts', 'dist', 'bin']) mkdirSync(join(dir, d));
  copyFileSync('scripts/deploy.sh', join(dir, 'scripts/deploy.sh'));
  copyFileSync('scripts/sync-redirects.mjs', join(dir, 'scripts/sync-redirects.mjs'));
  copyFileSync('redirects.json', join(dir, 'redirects.json'));
  writeFileSync(join(dir, 'dist/index.html'), '<title>x</title>');
  copyFileSync('public/robots.txt', join(dir, 'dist/robots.txt')); // what the build copies from public/
  for (const [path, body] of Object.entries(stagingOnly)) {
    mkdirSync(dirname(join(dir, 'staging-only', path)), { recursive: true });
    writeFileSync(join(dir, 'staging-only', path), body);
  }
  const log = join(dir, 'aws.log');
  writeFileSync(join(dir, 'bin/aws'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
case "$*" in s3\\ sync*) echo "$(tr '\\n' ' ' < dist/robots.txt 2>/dev/null)" >> "${log}.robots"; echo "$(cd dist && find . -type f | sort | tr '\\n' ' ')" >> "${log}.files";; esac
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
  lines.filesAtSync = readFileSync(`${log}.files`, 'utf8').trim().split('\n').map((l) => l.trim().split(' '));
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
  for (const r of runDeploy('prod').robotsAtSync) assert.equal(r.replace(/\s+/g, ' ').trim(), 'User-agent: * Allow: / Disallow: /admin/ Sitemap: https://wahoobay.net/sitemap-index.xml');
});

test('public/robots.txt allows indexing but not the sighting review, and names the sitemap', () => {
  const text = readFileSync('public/robots.txt', 'utf8');
  assert.equal(robotsBlocksEverything(text), false);
  assert.match(text, /^User-agent: \*$/m);
  assert.match(text, /^Allow: \/$/m);
  assert.match(text, /^Disallow: \/admin\/$/m);
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

test('staging publishes staging-only/ beside the build from the first sync on; production never does', () => {
  const page = { 'reef-logbook/index.html': '<title>mockup</title>' };
  const staging = runDeploy('staging', { stagingOnly: page });
  assert.equal(staging.filesAtSync.length, 2);
  for (const files of staging.filesAtSync) {
    assert.ok(files.includes('./reef-logbook/index.html'), files.join(' '));
    assert.ok(files.includes('./index.html'), 'the built site is still there');
  }
  for (const files of runDeploy('prod', { stagingOnly: page }).filesAtSync) {
    assert.ok(!files.some((f) => f.startsWith('./reef-logbook/')), files.join(' '));
  }
});

test('staging deploys without a staging-only/ folder', () => {
  for (const files of runDeploy('staging').filesAtSync) assert.deepEqual(files, ['./index.html', './robots.txt']);
});

test('a staging-only file with the path of a built file stops the deploy before any sync', () => {
  for (const path of ['robots.txt', 'index.html']) {
    const { res, lines } = runDeploy('staging', { stagingOnly: { [path]: 'x' }, expectFail: true });
    assert.equal(res.status, 1, path);
    assert.match(res.stderr, new RegExp(`staging-only/${path.replace('.', '\\.')}`), res.stderr);
    assert.ok(!lines.some((l) => l.startsWith('s3 sync ')), `nothing was published (${path})`);
  }
});

test('the staging-only copy happens inside the staging branch, after the robots override', () => {
  const src = readFileSync('scripts/deploy.sh', 'utf8');
  const stagingBlock = src.match(/if \[ "\$ENV_NAME" = "staging" \]; then[\s\S]*?\nfi\n/)[0];
  assert.match(stagingBlock, /cp -R staging-only\/\. dist\//);
  assert.ok(stagingBlock.indexOf('robots.txt') < stagingBlock.indexOf('cp -R staging-only'));
  assert.equal(src.split('cp -R staging-only').length - 1, 1, 'one copy, inside the staging branch');
});

// The public keys deploy.sh asked the key-value store to put, in order.
const publicKeys = (lines) => lines.filter((l) => l.includes('update-keys')).flatMap((l) => [...l.matchAll(/"Key":"(public:[^"]*)"/g)].map((m) => m[1]));

test('staging opens each staging-only folder to visitors without the password; production opens nothing', () => {
  const pages = { 'reef-logbook/index.html': '<title>mockup</title>', 'tide-chart/index.html': '<title>t</title>' };
  assert.deepEqual(publicKeys(runDeploy('staging', { stagingOnly: pages })), ['public:/reef-logbook', 'public:/tide-chart']);
  assert.deepEqual(publicKeys(runDeploy('prod', { stagingOnly: pages })), []);
  assert.deepEqual(publicKeys(runDeploy('staging')), []);
});
