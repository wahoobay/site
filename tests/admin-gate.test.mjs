// The double-submit guard (src/lib/admin/gate.mjs): one action at a time. useOneAtATime (src/islands/admin/shared.tsx)
// takes the gate before it sends and releases it when the request is done, so a second press while one is in flight,
// even inside the same frame, sends nothing. Pure, no build needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { oneAtATime } from '../src/lib/admin/gate.mjs';

test('the gate: the first take wins, every take after it loses until the release', () => {
  const gate = oneAtATime();
  assert.equal(gate.held, false);
  assert.equal(gate.take(), true);
  assert.equal(gate.held, true);
  assert.equal(gate.take(), false, 'a double click');
  assert.equal(gate.take(), false);
  gate.release();
  assert.equal(gate.held, false);
  assert.equal(gate.take(), true, 'open again once the request is done');
});

test('the gate: a release without a take, or twice, leaves it open; each gate is its own', () => {
  const a = oneAtATime();
  const b = oneAtATime();
  a.release();
  a.release();
  assert.equal(a.take(), true);
  assert.equal(b.take(), true, 'another screen\'s gate is not this one');
  assert.equal(a.take(), false);
});

test('useOneAtATime decides with the gate, and releases it however the work ends', () => {
  const shared = readFileSync('src/islands/admin/shared.tsx', 'utf8');
  assert.match(shared, /import \{ oneAtATime \} from '\.\.\/\.\.\/lib\/admin\/gate\.mjs';/);
  assert.match(shared, /if \(!gate\.take\(\)\) return;/);
  assert.match(shared, /finally \{\s*gate\.release\(\);/);
  assert.doesNotMatch(shared, /flying/, 'no second guard of its own');
});
