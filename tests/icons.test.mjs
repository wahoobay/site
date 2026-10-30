// Run after `npm run build`. Spec §4.3 refuses emoji and glyphs as icons: the one icon set is @wahoobay/design's
// SVGs, inlined at build time (finish review, fix 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pages = readdirSync('dist', { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
  .map((entry) => join(entry.parentPath, entry.name));

test('no built page draws an arrow with a character: no &larr;, ←, &rarr; or → outside an <svg>', () => {
  assert.ok(pages.length > 0, 'dist/ has pages (build first)');
  for (const file of pages) {
    const html = readFileSync(file, 'utf8').replace(/<svg\b[\s\S]*?<\/svg>/g, '');
    for (const glyph of ['&larr;', '←', '&rarr;', '→']) assert.ok(!html.includes(glyph), `${file}: ${glyph}`);
  }
});

const backPages = () => {
  const under = (dir) => readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(dir, e.name, 'index.html'));
  const grades = JSON.parse(readFileSync('src/content/grades.json', 'utf8')).map((g) => join('dist/learn', g.slug, 'index.html'));
  return [...grades, ...under('dist/learn/courses'), ...under('dist/news')];
};

test('every grade, course and news page starts with the design\'s back link, the arrow-left icon inlined before its text', () => {
  const arrow = readFileSync('node_modules/@wahoobay/design/dist/icons/arrow-left.svg', 'utf8').trim();
  const files = backPages();
  assert.ok(files.length >= 6 + 15 + 4, `${files.length} pages`);
  for (const file of files) {
    assert.ok(existsSync(file), file);
    const html = readFileSync(file, 'utf8');
    const back = html.match(/<a class="wb-back" href="([^"]+)">([\s\S]*?)<\/a>\s*<h1\b/);
    assert.ok(back, `${file}: a wb-back link right before the h1`);
    assert.match(back[1], /^\/(learn|news)\/$/, `${file}: back to its section`);
    assert.ok(back[2].trim().startsWith(arrow), `${file}: the design's arrow-left.svg, inlined first`);
    assert.match(back[2], /<svg class="wb-icon"/, file);
  }
});
