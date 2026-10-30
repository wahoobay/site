// site.css is layout only (CLAUDE.md; finish review, fix 2): colour, type, borders, corners, shadows and filters come
// from @wahoobay/design's components. Some of these tests read the built site in dist/ (run `npm run build` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync('src/styles/site.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
// Innermost rule bodies (an @media block's rules are found inside it), then each declaration's property.
const declarations = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selector, body]) =>
  body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => ({ selector: selector.trim(), property: d.slice(0, d.indexOf(':')).trim().toLowerCase() })),
);

const NOT_LAYOUT = [
  /^color$/, /^background/, /^border/, /^box-shadow$/, /^font/, /^line-height$/, /^white-space$/, /^filter$/, /^text-decoration/,
  /^letter-spacing$/, /^text-transform$/, /^text-align$/, /^overflow-wrap$/, /^outline/, /^opacity$/, /^fill$/, /^stroke/,
];

test('site.css is layout only: no colour, type, border, corner, shadow or filter declarations', () => {
  assert.ok(declarations.length > 50, `${declarations.length} declarations read`);
  for (const { selector, property } of declarations) {
    assert.ok(!NOT_LAYOUT.some((re) => re.test(property)), `${selector} { ${property}: … } belongs in @wahoobay/design`);
  }
});

test('site.css no longer carries the components the design system now has', () => {
  for (const gone of ['.site-person__initials', '.site-logo__link', '.site-course__links small', '.site-actions .wb-btn', '.site-course__links .wb-btn', 'brightness(']) {
    assert.ok(!css.includes(gone), gone);
  }
});

test('the board grid lets each card be as tall as its own copy (review note 5)', () => {
  const person = [...css.matchAll(/\.site-person\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
  assert.match(person, /align-self:\s*start/);
});

const read = (file) => readFileSync(file, 'utf8');

test('the board: a photo is the card\'s media; a member without one gets the design\'s initials square', () => {
  const html = read('dist/about/board/index.html');
  const people = JSON.parse(`[${readFileSync('src/content/board/troy-gapczynski.json', 'utf8')}]`);
  assert.ok(!people[0].photo, 'Troy Gapczynski has no photo (the fixture for the initials)');
  assert.match(html, /<span class="wb-initials site-person__photo" aria-hidden="true">TG<\/span>/);
  const photos = html.match(/<img class="[^"]*site-person__photo[^"]*"/g) ?? [];
  assert.ok(photos.length >= 12, `${photos.length} photos`);
  for (const img of photos) assert.match(img, /class="wb-card__media site-person__photo"/);
});

test('partner logos sit on the design\'s logo tile; a logo drawn in white is on the dark tile, not recoloured', () => {
  const html = read('dist/get-involved/partners/index.html');
  const tiles = [...html.matchAll(/<(a|span) class="(wb-logo-tile[^"]*)"[^>]*>\s*<img\b[^>]*\bsrc="([^"]+)"/g)];
  const partners = readFileSync('src/content.config.ts', 'utf8');
  assert.match(partners, /tone: z\.enum\(\['dark', 'light'\]\)\.optional\(\)/, 'the partners schema has `tone`');
  assert.ok(tiles.length >= 24, `${tiles.length} tiles`);
  for (const [, , cls, src] of tiles) {
    const light = src.includes('bergeron-everglades-foundation-logo');
    assert.equal(cls, light ? 'wb-logo-tile wb-logo-tile--dark' : 'wb-logo-tile', src);
  }
  assert.doesNotMatch(html, /site-logo__link/);
});

test('the live pages frame the video with the design\'s video frame', () => {
  for (const file of ['dist/live/index.html', 'dist/live/highlights/index.html']) {
    assert.match(read(file), /<div class="wb-video site-video">\s*<iframe\b/, file);
  }
});

const builtPages = readdirSync('dist', { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
  .map((entry) => join(entry.parentPath, entry.name));

test('the page actions and the course documents are wrapping buttons; a document\'s kind is the button\'s meta label', () => {
  let count = 0;
  for (const file of builtPages) {
    for (const [, row] of read(file).matchAll(/<div class="site-actions">([\s\S]*?)<\/div>/g)) {
      for (const [a] of row.matchAll(/<a class="wb-btn [^"]*"/g)) {
        count += 1;
        assert.match(a, /\bwb-btn--wrap\b/, `${file}: ${a}`);
      }
    }
  }
  assert.ok(count >= 10, `${count} action buttons`);
  const course = read('dist/learn/courses/coral-reefs/index.html');
  const links = course.match(/<ul class="site-course__links"[\s\S]*?<\/ul>/)?.[0] ?? '';
  for (const [a] of links.matchAll(/<a class="wb-btn[^>]*>[\s\S]*?<\/a>/g)) {
    assert.match(a, /^<a class="wb-btn wb-btn--(action|ghost) wb-btn--wrap"/, a.slice(0, 80));
    assert.match(a, /<span class="wb-btn__meta">(PDF|Document|Slides|Form|Website)<\/span>/, a.slice(0, 80));
    assert.doesNotMatch(a, /<small>/);
  }
});

test('the Instagram cards use the design\'s caption for their link and the card\'s media corners for their picture', () => {
  const script = read('dist/index.html').match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.match(script, /link\.className = 'site-instagram__link wb-caption';/);
  assert.match(script, /img\.className = 'wb-card__media';/);
});

// Dan's staging review (2026-10-30): the photos on these two pages were square beside the 12px cards and tiles.
// The corners come from @wahoobay/design 0.1.3, `.wb-prose :where(img, video, iframe)`, so every photo in a page's
// body must sit inside .wb-prose. The banner above the heading is not one of them: it runs edge to edge.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** Each <img> tag in `html`, with the class attributes of the elements it sits in, outermost first. */
const imagesIn = (html) => {
  const open = [];
  const images = [];
  for (const [tag, close, name, attrs] of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const el = name.toLowerCase();
    if (el === 'img') images.push({ tag, around: open.map((o) => o.cls) });
    if (VOID.has(el) || attrs.endsWith('/')) continue;
    if (close) {
      const at = open.map((o) => o.el).lastIndexOf(el);
      if (at >= 0) open.length = at;
    } else open.push({ el, cls: attrs.match(/\bclass="([^"]*)"/)?.[1] ?? '' });
  }
  return images;
};

test('the photos on /get-involved/ambassadors/ and /get-involved/support/ sit in .wb-prose, which has the 12px corners', () => {
  const design = read('node_modules/@wahoobay/design/dist/components.css');
  assert.match(design, /\.wb-prose :where\(img, video, iframe\)\s*\{\s*border-radius:\s*var\(--wb-radius\);/, '@wahoobay/design 0.1.3 or later');
  for (const [file, least] of [['dist/get-involved/ambassadors/index.html', 1], ['dist/get-involved/support/index.html', 8]]) {
    const main = read(file).match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
    const images = imagesIn(main);
    const photos = images.filter(({ tag }) => !/\bclass="site-article__hero"/.test(tag));
    for (const { tag, around } of images.filter((image) => !photos.includes(image))) assert.equal(around.length, 1, `${file}: the banner ${tag} is a child of <main>`);
    assert.ok(photos.length >= least, `${file}: ${photos.length} photos`);
    for (const { tag, around } of photos) assert.ok(around.some((cls) => /(^|\s)wb-prose(\s|$)/.test(cls)), `${file}: ${tag} is outside .wb-prose`);
  }
});
