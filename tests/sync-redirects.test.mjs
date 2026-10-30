import test from 'node:test';
import assert from 'node:assert/strict';
import { toKvsEntries, planKvsChanges } from '../scripts/sync-redirects.mjs';

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
