import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';

test('a commit on origin/main passes', () => {
  // CI checks out a single commit; make origin/main exist the same way the script does.
  spawnSync('git', ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main'], { encoding: 'utf8' });
  const sha = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  const res = spawnSync('bash', ['scripts/assert-on-main.sh', sha], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
});

test('an unknown commit is refused with a clear error', () => {
  const res = spawnSync('bash', ['scripts/assert-on-main.sh', '0123456789abcdef0123456789abcdef01234567'], { encoding: 'utf8' });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /not on origin\/main/);
});
