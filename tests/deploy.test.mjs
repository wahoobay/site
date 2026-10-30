import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// deploy.sh is exercised against a fake `aws` that records every invocation.
function runDeploy(envName) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-test-'));
  for (const d of ['scripts', 'dist', 'bin']) mkdirSync(join(dir, d));
  copyFileSync('scripts/deploy.sh', join(dir, 'scripts/deploy.sh'));
  copyFileSync('scripts/sync-redirects.mjs', join(dir, 'scripts/sync-redirects.mjs'));
  copyFileSync('redirects.json', join(dir, 'redirects.json'));
  writeFileSync(join(dir, 'dist/index.html'), '<title>x</title>');
  const log = join(dir, 'aws.log');
  writeFileSync(join(dir, 'bin/aws'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
case "$*" in
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
  assert.equal(res.status, 0, res.stderr);
  return readFileSync(log, 'utf8').trim().split('\n');
}

test('both sync passes delete what the build no longer produces', () => {
  const syncs = runDeploy('prod').filter((l) => l.startsWith('s3 sync '));
  assert.equal(syncs.length, 2);
  for (const s of syncs) assert.match(s, /--delete/, s);
  assert.match(syncs[1], /--include \*\.html/);
});

test('staging overrides robots.txt after the sync, production does not', () => {
  assert.ok(runDeploy('staging').some((l) => l.startsWith('s3 cp - s3://b/robots.txt')));
  assert.ok(!runDeploy('prod').some((l) => l.includes('robots.txt')));
});
