// Run after `npm run build`: the data dashboards page frames the Power BI report and the two Grafana dashboards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DASHBOARDS, onlineDashboards } from '../src/lib/dashboards.mjs';

test('three dashboards, https only, on the two known hosts', () => {
  assert.equal(DASHBOARDS.length, 1, 'Power BI alone: the Grafana dashboards were retired on 2026-10-31');
  for (const d of DASHBOARDS) {
    assert.match(d.src, /^https:\/\/app\.powerbi\.com\//);
    assert.ok(d.open.startsWith('https://'));
  }
});

test('the page frames each dashboard with a title and an always-visible full-size link', () => {
  const html = readFileSync('dist/live/data/index.html', 'utf8');
  assert.equal((html.match(/<iframe /g) || []).length, onlineDashboards().length);
  // The built HTML writes & in a URL as &amp;, so the expected addresses are escaped the same way.
  for (const d of onlineDashboards()) {
    assert.match(html, new RegExp(`<iframe[^>]+title="${d.title}"[^>]+loading="lazy"`));
    assert.match(html, new RegExp(`<a class="wb-btn wb-btn--action"[^>]+href="${d.open.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]+target="_blank"`));
  }
  assert.doesNotMatch(html, /data-theme="dark"/);
});

// Ruling AA (finish review, fix 4): at 390px the framed report is drawn at a sixth of its size and cannot be read, and
// the panel's sentence repeated the H1. Each panel: its heading, one line saying the report reads best at full size,
// the full-size link as the primary action, then the frame, at every width.
test('each dashboard: its heading, the one line, the full-size action, then the frame', () => {
  const html = readFileSync('dist/live/data/index.html', 'utf8');
  const panels = [...html.matchAll(/<section class="wb-panel site-dashboard"[^>]*>([\s\S]*?)<\/section>/g)].map((m) => m[1].replace(/<!--[\s\S]*?-->/g, ''));
  assert.equal(panels.length, onlineDashboards().length);
  const esc = (text) => text.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  onlineDashboards().forEach((d, i) => {
    assert.match(panels[i], new RegExp(`^<h2 id="dash-${d.id}">${esc(d.title)}</h2>` +
      '<p>The report reads best at full size\\.</p>' +
      `<a class="wb-btn wb-btn--action" href="${esc(d.open)}" target="_blank" rel="noopener">Open full size<span class="wb-sr-only"> \\(opens in a new tab\\)</span></a>` +
      `<div class="wb-video"><iframe src="${esc(d.src)}" title="${esc(d.title)}"`), d.id);
  });
  assert.doesNotMatch(html, /with its data and charts/, 'the old sentence is gone');
  const source = readFileSync('src/pages/live/data/index.astro', 'utf8');
  const at = source.indexOf('The report reads best at full size.');
  assert.ok(at > 0, 'the line is the page\'s own');
  assert.match(source.slice(source.lastIndexOf('\n', source.lastIndexOf('\n', at) - 1), at), /katie: review/, 'the new line is marked for Katie');
});

test('no offline dashboard is rendered, and the retired Grafana host (2026-10-31) is named nowhere on the page', () => {
  const html = readFileSync('dist/live/data/index.html', 'utf8');
  for (const d of DASHBOARDS.filter((x) => x.offline)) assert.ok(!html.includes(new URL(d.src).host), `${d.id} is offline`);
  assert.ok(!html.includes('grafana.wahoobay.net'));
  assert.ok(onlineDashboards().length >= 1);
});

test('the meta description names each online dashboard and no offline one', () => {
  const html = readFileSync('dist/live/data/index.html', 'utf8');
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  for (const d of onlineDashboards()) assert.ok(desc.includes(d.title), `${d.id} in description`);
  for (const d of DASHBOARDS.filter((x) => x.offline)) assert.ok(!desc.includes(d.title), `${d.id} not in description`);
});
