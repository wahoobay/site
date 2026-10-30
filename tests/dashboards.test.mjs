// Run after `npm run build`: the data dashboards page frames the Power BI report and the two Grafana dashboards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DASHBOARDS, onlineDashboards } from '../src/lib/dashboards.mjs';

test('three dashboards, https only, on the two known hosts', () => {
  assert.equal(DASHBOARDS.length, 3);
  for (const d of DASHBOARDS) {
    assert.match(d.src, /^https:\/\/(app\.powerbi\.com|grafana\.wahoobay\.net)\//);
    assert.ok(d.open.startsWith('https://'));
  }
});

test('the page frames each dashboard with a title and an always-visible full-size link', () => {
  const html = readFileSync('dist/live/data/index.html', 'utf8');
  assert.equal((html.match(/<iframe /g) || []).length, onlineDashboards().length);
  // The built HTML writes & in a URL as &amp;, so the expected addresses are escaped the same way.
  for (const d of onlineDashboards()) {
    assert.match(html, new RegExp(`<iframe[^>]+title="${d.title}"[^>]+loading="lazy"`));
    assert.match(html, new RegExp(`<a class="wb-btn wb-btn--ghost"[^>]+href="${d.open.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]+target="_blank"`));
  }
  assert.doesNotMatch(html, /data-theme="dark"/);
});

test('no offline dashboard is rendered: no grafana.wahoobay.net URL in the page while those entries are offline', () => {
  const html = readFileSync('dist/live/data/index.html', 'utf8');
  for (const d of DASHBOARDS.filter((x) => x.offline)) assert.ok(!html.includes(new URL(d.src).host), `${d.id} is offline`);
  assert.ok(onlineDashboards().length >= 1);
});
