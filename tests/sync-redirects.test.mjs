import test from 'node:test';
import assert from 'node:assert/strict';
import { toKvsEntries, toPublicEntries, parseFolders, planKvsChanges, applyPlan } from '../scripts/sync-redirects.mjs';

test('entries derive keys from paths and queries', () => {
  assert.deepEqual(
    toKvsEntries([{ from: '/lady-luck/', to: '/projects/lady-luck/' }, { from: '/?p=1660', to: '/gallery/' }]),
    { 'redirect:/lady-luck': '/projects/lady-luck/', 'redirect:?p=1660': '/gallery/' },
  );
});

test('root-level query redirect and nested path both normalise', () => {
  assert.deepEqual(
    toKvsEntries([{ from: '/donations/2555/', to: '/donate/' }, { from: '/?give-embed=donor-dashboard', to: '/donate/' }]),
    { 'redirect:/donations/2555': '/donate/', 'redirect:?give-embed=donor-dashboard': '/donate/' },
  );
});

test('plan puts new and changed, deletes stale, never touches auth', () => {
  const plan = planKvsChanges(
    { 'redirect:/a': '/x/', 'redirect:/b': '/y2/' },
    { 'redirect:/b': '/y/', 'redirect:/c': '/z/', auth: 'Basic xyz' },
  );
  assert.deepEqual(plan.puts, [{ key: 'redirect:/a', value: '/x/' }, { key: 'redirect:/b', value: '/y2/' }]);
  assert.deepEqual(plan.deletes, [{ key: 'redirect:/c' }]);
});

test('plan is empty when nothing changed', () => {
  const plan = planKvsChanges({ 'redirect:/a': '/x/' }, { 'redirect:/a': '/x/', auth: 'Basic q' });
  assert.deepEqual(plan, { puts: [], deletes: [] });
});

test('apply writes in batches of 50 operations, re-reading the ETag before each', () => {
  const plan = {
    puts: Array.from({ length: 53 }, (_, i) => ({ key: `redirect:/p${i}`, value: '/x/' })),
    deletes: [{ key: 'redirect:/d0' }, { key: 'redirect:/d1' }],
  };
  const calls = [];
  let etags = 0;
  const run = (args) => {
    calls.push(args);
    return args[0] === 'describe-key-value-store' ? { ETag: `e${++etags}` } : {};
  };
  applyPlan('arn:kvs', plan, run);
  assert.deepEqual(calls.map((c) => c[0]), ['describe-key-value-store', 'update-keys', 'describe-key-value-store', 'update-keys']);
  const [, first, , second] = calls;
  assert.equal(first[first.indexOf('--if-match') + 1], 'e1');
  assert.equal(second[second.indexOf('--if-match') + 1], 'e2');
  const count = (c, flag) => (c.includes(flag) ? JSON.parse(c[c.indexOf(flag) + 1]).length : 0);
  assert.equal(count(first, '--puts') + count(first, '--deletes'), 50);
  assert.equal(count(second, '--puts') + count(second, '--deletes'), 5);
  assert.equal(count(first, '--puts') + count(second, '--puts'), 53);
  assert.equal(count(first, '--deletes') + count(second, '--deletes'), 2);
});

test('each staging-only folder becomes a public key, which the staging router serves without the password', () => {
  assert.deepEqual(toPublicEntries(['reef-logbook', 'tide_chart-2']), { 'public:/reef-logbook': '1', 'public:/tide_chart-2': '1' });
  assert.deepEqual(toPublicEntries([]), {});
});

test('a folder name the router would not open stops the sync', () => {
  for (const bad of ['a b', 'x.y', '..', 'a/b', '%2e', '']) assert.throws(() => toPublicEntries([bad]), /staging-only/, bad);
});

test('the folder list is a space-separated variable, empty in production', () => {
  assert.deepEqual(parseFolders(' reef-logbook  other \n'), ['reef-logbook', 'other']);
  assert.deepEqual(parseFolders(''), []);
  assert.deepEqual(parseFolders(undefined), []);
});

test('plan deletes the public key of a folder that is gone, and never touches auth', () => {
  const plan = planKvsChanges({ 'public:/a': '1' }, { 'public:/a': '1', 'public:/old': '1', auth: 'Basic q' });
  assert.deepEqual(plan, { puts: [], deletes: [{ key: 'public:/old' }] });
});
