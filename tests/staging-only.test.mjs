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

test('staging-only pages load no script, style, font or image from another origin', () => {
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.doesNotMatch(html, /<script[^>]*\ssrc=/i, `${page}: inline scripts only`);
    assert.doesNotMatch(html, /<link[^>]*\shref="(?:https?:)?\/\//i, `${page}: no remote stylesheet or font`);
    assert.doesNotMatch(html, /<(?:img|source|iframe|video|audio)[^>]*\ssrc="(?:https?:)?\/\//i, `${page}: no remote media`);
    assert.doesNotMatch(html, /url\(\s*['"]?(?:https?:)?\/\//i, `${page}: no remote CSS url()`);
    assert.doesNotMatch(html, /@import/i, `${page}: no CSS @import`);
  }
});

test('the reef-logbook mockup is a staging-only page', () => {
  assert.ok(pages.includes(join(root, 'reef-logbook/index.html')), pages.join(', '));
});
