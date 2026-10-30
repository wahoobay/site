import test from 'node:test';
import assert from 'node:assert/strict';
import { robotsBlocksEverything } from '../scripts/check-robots.mjs';

test('the staging robots file blocks everything', () => {
  assert.equal(robotsBlocksEverything('User-agent: *\nDisallow: /\n'), true);
});

test('the real robots file does not, even with a partial Disallow', () => {
  assert.equal(robotsBlocksEverything('User-agent: *\nAllow: /\nSitemap: https://wahoobay.net/sitemap.xml\n'), false);
  assert.equal(robotsBlocksEverything('User-agent: *\nDisallow: /wp-admin/\n'), false);
});
