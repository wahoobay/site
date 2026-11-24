import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Staging-only pages (README "Staging-only pages") are prototypes shown behind the staging password.
// They stay out of search results even if a copy leaks, and load nothing from another origin.
const root = 'staging-only';
const pages = existsSync(root)
  ? readdirSync(root, { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => join(root, f))
  : [];

test('every staging-only page asks not to be indexed', () => {
  for (const page of pages) {
    assert.match(readFileSync(page, 'utf8'), /<meta name="robots" content="noindex[^"]*">/, page);
  }
});

// The one exception (Dan, 2026-11-24): a YouTube embed from youtube-nocookie.com, the privacy-enhanced embed the site's
// live pages and home band use, so a prototype can show the SeaHIVE camera live.
const NOCOOKIE_EMBED = /<iframe\b[^>]*\ssrc="https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]+(?:\?[^"]*)?"[^>]*>/gi;

test('staging-only pages load no script, style, font or image from another origin; a nocookie YouTube embed is the one exception', () => {
  for (const page of pages) {
    const html = readFileSync(page, 'utf8').replace(NOCOOKIE_EMBED, '');
    assert.doesNotMatch(html, /<script[^>]*\ssrc=/i, `${page}: inline scripts only`);
    assert.doesNotMatch(html, /<link[^>]*\shref="(?:https?:)?\/\//i, `${page}: no remote stylesheet or font`);
    assert.doesNotMatch(html, /<(?:img|source|iframe|video|audio)[^>]*\ssrc="(?:https?:)?\/\//i, `${page}: no remote media`);
    assert.doesNotMatch(html, /url\(\s*['"]?(?:https?:)?\/\//i, `${page}: no remote CSS url()`);
    assert.doesNotMatch(html, /@import/i, `${page}: no CSS @import`);
  }
});

test('the Jump In prototype plays the SeaHIVE camera\'s YouTube live stream in its live band, its one embed', () => {
  const html = readFileSync(join(root, 'jump-in/index.html'), 'utf8');
  const frames = html.match(/<iframe\b[^>]*>/gi) ?? [];
  assert.equal(frames.length, 1, 'one embed');
  assert.match(frames[0], /\ssrc="https:\/\/www\.youtube-nocookie\.com\/embed\/oBTGY6Ax870\?autoplay=1&amp;mute=1&amp;playsinline=1"/);
  assert.match(html, /<div class="site-band__still">\s*<div class="wb-video site-video">\s*<iframe\b/);
});

test('the reef-logbook mockup is a staging-only page', () => {
  assert.ok(pages.includes(join(root, 'reef-logbook/index.html')), pages.join(', '));
});

test('each staging-only page sits in a top-level folder with a plain name, the only kind staging serves without the password', () => {
  const entries = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((e) => !e.name.startsWith('.')) : [];
  for (const e of entries) {
    assert.ok(e.isDirectory(), `${e.name}: put each page in a folder of its own`);
    assert.match(e.name, /^[A-Za-z0-9_-]+$/, `${e.name}: letters, digits, - and _ only`);
  }
});
