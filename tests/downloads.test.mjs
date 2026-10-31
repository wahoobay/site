// The open-data page (/live/downloads/, plan 7 step 2b, Task 10): the fish-ID app's nine public exports, a card each
// with its line, its CSV and Parquet links over its default window and the windows it offers; the README, the licence
// ("see the README": the API's `license` is null, Ruling 24) and what the files leave out. The list is copied once from
// GET /api/public/exports (PUBLIC_EXPORTS in the ai repository) into the page's content file; the page does not fetch.
// Run after `npm run build`: the built page in dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** GET /api/public/exports, 2026-10-31: name, description, default_days, allowed_days, in the API's order. */
const EXPORTS = [
  ['events', "One row per detection per frame: the box, the classifier's candidates, provenance.", 7, [7, 30]],
  ['species_counts', 'Detections per species with confidence statistics (prefer sightings).', 90, [7, 30, 90, 365]],
  ['sightings', 'One row per tracked fish seen in at least three frames: species and duration.', 90, [7, 30, 90, 365]],
  ['hourly_summary', "Detections and sightings per species per hour, beside the water's means.", 90, [7, 30, 90, 365]],
  ['water_quality', 'The sonde: temperature, pH, oxygen, chlorophyll, turbidity, conductivity.', 90, [7, 30, 90, 365]],
  ['weather', "The weather station's readings and the forecast layer, merged per reading.", 90, [7, 30, 90, 365]],
  ['frame_stats', 'About one row per second of video: brightness, colour and detection rate.', 7, [7, 30]],
  ['tracks_timeline', "Each tracked fish's detections in order, with the box's centre and size.", 7, [7, 30]],
  ['topk_long', 'One row per detection and classifier candidate, ranked, for calibration.', 7, [7, 30]],
].map(([name, description, days, allowed]) => ({ name, description, days, allowed }));

const read = (file) => readFileSync(file, 'utf8');
const decode = (s) => s.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const text = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const MD = 'src/content/pages/live/downloads.md';
const page = () => read('dist/live/downloads/index.html');
const mainOf = (html) => html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
/** "7 or 30 days", "7, 30, 90 or 365 days". */
const windows = (days) => `${days.slice(0, -1).join(', ')} or ${days.at(-1)} days`;

test('the content file: title "Open data", a description, section live, and the nine exports in the API\'s order, each its line and windows', () => {
  const md = read(MD);
  const front = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  assert.match(front, /^title: Open data$/m);
  assert.match(front, /^description: .{40,}$/m);
  assert.match(front, /^section: live$/m);
  const names = [...front.matchAll(/^ {2}- name: (\S+)$/gm)].map((m) => m[1]);
  assert.deepEqual(names, EXPORTS.map((e) => e.name));
  for (const { name, description, days, allowed } of EXPORTS) {
    const entry = front.slice(front.indexOf(`- name: ${name}\n`)).split(/\n {2}- /)[0];
    assert.match(entry, new RegExp(`\\n {4}description: ${JSON.stringify(description).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`), name);
    assert.match(entry, new RegExp(`\\n {4}default_days: ${days}\\n`), name);
    assert.match(entry, new RegExp(`\\n {4}allowed_days: \\[${allowed.join(', ')}\\]$`), name);
  }
  // New words are marked: the page (title, description), the nine lines, and each sentence of the body.
  assert.match(front, /# katie: review: a new page/);
  assert.match(front, /# katie: review: [^\n]*\nexports:/, 'the nine lines are marked');
  const body = md.slice(md.indexOf('\n---', 4) + 4).trim();
  const paragraphs = body.split(/\n\n+/);
  assert.ok(paragraphs.length >= 3);
  for (let i = 0; i < paragraphs.length; i += 1) {
    if (paragraphs[i].startsWith('<!--')) assert.match(paragraphs[i], /^<!-- katie: review/, paragraphs[i]);
    else assert.match(paragraphs[i - 1] ?? '', /^<!-- katie: review/, `${paragraphs[i]}: marked`);
  }
});

test('/live/downloads/: a light page, the nav, the h1, the lead, the copy, then the nine cards; no script, no style', () => {
  const html = page();
  assert.doesNotMatch(html.match(/<html\b[^>]*>/)[0], /data-theme/, 'light');
  assert.match(html, /<title>Open data/);
  const main = mainOf(html);
  const description = read(MD).match(/^description: (.+)$/m)[1];
  const order = {
    nav: main.indexOf('<nav class="site-subnav" aria-label="Live reef">'),
    h1: main.indexOf('<h1>Open data</h1>'),
    lead: main.indexOf(`<p class="wb-lead">${description.replaceAll("'", '&#39;')}</p>`),
    body: main.indexOf('<div class="wb-prose site-article__body">'),
    list: main.indexOf('<ul class="site-downloads" role="list">'),
  };
  for (const [name, p] of Object.entries(order)) assert.ok(p >= 0, name);
  assert.deepEqual(Object.keys(order).sort((a, b) => order[a] - order[b]), Object.keys(order));
  assert.equal((main.match(/<h1\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<script\b|<astro-island\b|<iframe\b/);
  assert.doesNotMatch(html, /\bstyle=/);
});

test('/live/downloads/: exactly the nine exports, each a card with its line, CSV and Parquet over its default window, and its windows', () => {
  const main = mainOf(page());
  const list = main.match(/<ul class="site-downloads" role="list">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const cards = [...list.matchAll(/<li class="wb-card site-downloads__item">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(cards.length, 9);
  cards.forEach((card, i) => {
    const { name, description, days, allowed } = EXPORTS[i];
    assert.match(card, /^<div class="wb-card__body">/, name);
    assert.equal(text(card.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? ''), name);
    assert.ok(text(card).includes(description), `${name}: its line`);
    const links = [...card.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], label: text(m[2]) }));
    assert.deepEqual(links.map((a) => a.attrs.match(/\bhref="([^"]*)"/)?.[1]), [
      `/api/public/exports/${name}.csv?days=${days}`,
      `/api/public/exports/${name}.parquet?days=${days}`,
    ]);
    assert.ok(links.every((a) => /\bclass="wb-btn wb-btn--ghost"/.test(a.attrs)), `${name}: the design's buttons`);
    // Its name for a screen reader: the format, which file, and the window it downloads.
    assert.deepEqual(links.map((a) => a.label), [`CSV of ${name}, ${days} days`, `Parquet of ${name}, ${days} days`]);
    // The window the buttons download, once for both (as a button's meta it pushed a 90-day card's pair onto two rows
    // at 390px), and the windows the file offers.
    assert.match(card, new RegExp(`<p class="wb-caption">The last ${days} days\\. Windows: ${windows(allowed)}\\.</p>`), `${name}: its windows`);
    assert.doesNotMatch(card, /wb-btn__meta/, `${name}: the buttons are their format alone`);
  });
  // Nothing else in the page reaches the exports but the README.
  const exportLinks = [...main.matchAll(/href="(\/api\/public\/exports\/[^"]*)"/g)].map((m) => m[1]);
  assert.equal(exportLinks.length, 19);
  assert.deepEqual(exportLinks.filter((href) => !/^\/api\/public\/exports\/[a-z_]+\.(csv|parquet)\?days=\d+$/.test(href)), ['/api/public/exports/README.md']);
});

test('/live/downloads/: the README for the licence, how to ask for another window, and what the files leave out', () => {
  const main = mainOf(page());
  const body = main.match(/<div class="wb-prose site-article__body">([\s\S]*?)<\/div>/)?.[1] ?? '';
  // The Markdown's typographer curls its apostrophes.
  const words = text(body).replaceAll('\u2019', "'");
  assert.match(body, /Licence: see the <a href="\/api\/public\/exports\/README\.md">README<\/a>, /);
  assert.match(words, /Licence: see the README, which also explains each file's columns and caveats\./);
  assert.match(words, /Each button downloads the last 7 or 90 days, as its card says\. For another of a file's windows, change the number after days= at the end of the link's address\./);
  assert.match(words, /The files carry no reviewer data and name each camera by its id only\./);
});

test('the page renders its content file and fetches nothing', () => {
  const source = read('src/pages/live/downloads/index.astro');
  assert.match(source, /getEntry\('pages', 'live\/downloads'\)/);
  assert.doesNotMatch(source, /\bfetch\(|fetchJson|client:/);
  assert.match(source, /import \{ API_BASE \} from '\.\.\/\.\.\/\.\.\/lib\/public-api\.mjs';/, 'the files\' address is the islands\' API_BASE');
  assert.match(source, /<SectionNav section="live" here=\{'\/live\/downloads\/'\} items=\{liveNav\(ai\)\} label="Live reef" \/>/);
});
