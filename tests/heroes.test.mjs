// Run after `npm run build`: the banner photos. Dan's staging review (2026-10-30): the park aerial, /WB-1.jpg, was the
// home page's photo and the banner of /visit/ and /get-involved/support/ ("used far too much"). It stays on the home
// page, where it says "this is the park"; each section page opens on a photograph of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { heroPosition, mediaClass } from '../src/lib/media.mjs';

const PAGES = 'src/content/pages';
const markdownFiles = readdirSync(PAGES, { recursive: true })
  .filter((name) => name.endsWith('.md'))
  .map((name) => join(PAGES, name).split('\\').join('/'))
  .sort();
const heroOf = (file) => readFileSync(file, 'utf8').match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0].match(/^hero:\s*(\S+)\s*$/m)?.[1];
/** `about/index.md` → `dist/about/index.html`; `about/mission.md` → `dist/about/mission/index.html`. */
const builtOf = (file) => join('dist', file.slice(PAGES.length + 1).replace(/\.md$/, '').replace(/(^|\/)index$/, ''), 'index.html');

const home = readFileSync('dist/index.html', 'utf8');
const HOME_HERO = home.match(/<img\b[^>]*\bclass="site-hero__photo"[^>]*\bsrc="([^"]+)"/)?.[1];
// The home page's three doorway cards: their photos are not banners anywhere.
const DOORWAYS = [...home.matchAll(/<img class="wb-card__media" src="([^"]+)"/g)].map((m) => m[1]);
const heroes = markdownFiles.filter(heroOf).map((file) => ({ file, src: heroOf(file) }));

// The section pages that open on a photo. /learn/ is an Astro page whose layout has no banner, so it has none.
const SECTION_PAGES = ['visit/index.md', 'get-involved/index.md', 'get-involved/support.md', 'about/index.md'].map((f) => `${PAGES}/${f}`);

test('the park aerial is the home page\'s photo and no other page\'s banner', () => {
  assert.equal(HOME_HERO, '/WB-1.jpg');
  for (const { file, src } of heroes) assert.doesNotMatch(src, /\/WB-1\b/, `${file}: hero ${src}`);
  for (const { file } of heroes) {
    assert.match(readFileSync(builtOf(file), 'utf8'), new RegExp(`<img class="wb-media[^"]* site-article__hero" src="${heroOf(file).replace(/[.]/g, '\\.')}"`), `${file}: its banner is built`);
  }
});

test('each section page opens on its own photo; no two pages share one, and none is a home doorway photo', () => {
  for (const file of SECTION_PAGES) assert.ok(heroOf(file), `${file} has a hero`);
  const all = [HOME_HERO, ...heroes.map(({ src }) => src)];
  const twice = all.filter((src, i) => all.indexOf(src) !== i);
  assert.deepEqual(twice, [], 'a photo is the banner of two pages');
  assert.equal(DOORWAYS.length, 3, 'the home page has its three doorway photos');
  for (const { file, src } of heroes) assert.ok(!DOORWAYS.includes(src), `${file}: ${src} is a home doorway photo`);
});

// The size of a JPEG (its first start-of-frame marker) or a PNG (its IHDR chunk).
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const imageSize = (buf) => {
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  assert.equal(buf.readUInt16BE(0), 0xffd8, 'a JPEG or a PNG');
  for (let i = 2; i + 9 < buf.length; ) {
    assert.equal(buf[i], 0xff, `a JPEG marker at byte ${i}`);
    const marker = buf[i + 1];
    if (marker === 0xff) i += 1;
    else if (SOF.has(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    else i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no start-of-frame marker');
};

test('every banner is a file under public/, at most 1600 px wide and 400 KB', () => {
  for (const src of [HOME_HERO, ...heroes.map(({ src }) => src)]) {
    const path = join('public', decodeURI(src));
    assert.ok(existsSync(path), `${src} is under public/`);
    const { width } = imageSize(readFileSync(path));
    assert.ok(width <= 1600, `${src} is ${width} px wide`);
    assert.ok(statSync(path).size <= 400_000, `${src} is ${statSync(path).size} bytes`);
  }
});

// Dan's staging review (2026-10-30): every large photo is rounded like the tiles. A page's banner and a post's photo
// are the design's .wb-media (12px corners), inset in the article's column; the home photo stays edge to edge, the one
// stage its panel sits on. `heroPosition` keeps a subject in frame where the band crops the photo.
const positionOf = (file) => readFileSync(file, 'utf8').match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0].match(/^heroPosition:\s*(\S+)\s*$/m)?.[1];

test('heroPosition is top, center or bottom, or absent, on pages and news posts; anything else fails the build', () => {
  for (const value of ['top', 'center', 'bottom', undefined]) assert.ok(heroPosition.safeParse(value).success, String(value));
  for (const value of ['left', 'Top', '', 50]) assert.ok(!heroPosition.safeParse(value).success, String(value));
  const config = readFileSync('src/content.config.ts', 'utf8');
  assert.match(config, /^import \{ heroPosition \} from '\.\/lib\/media\.mjs';$/m);
  for (const name of ['pages', 'news']) {
    const schema = config.match(new RegExp(`const ${name} = defineCollection\\(\\{[\\s\\S]*?\\n\\}\\);`))?.[0] ?? '';
    assert.match(schema, /^\s+heroPosition,$/m, `the ${name} schema has heroPosition`);
  }
});

test('a banner is .wb-media, with --top or --bottom from its heroPosition (centre adds nothing)', () => {
  assert.equal(mediaClass(undefined), 'wb-media');
  assert.equal(mediaClass('center'), 'wb-media');
  assert.equal(mediaClass('top'), 'wb-media wb-media--top');
  assert.equal(mediaClass('bottom'), 'wb-media wb-media--bottom');
  for (const { file, src } of heroes) {
    const html = readFileSync(builtOf(file), 'utf8');
    assert.match(html, /<div class="wb-container site-article">\s*<img class="wb-media[^"]* site-article__hero"/, `${file}: the banner opens the article's column`);
    const tag = html.match(/<img class="[^"]*site-article__hero"[^>]*>/)?.[0] ?? '';
    assert.match(tag, new RegExp(`^<img class="${mediaClass(positionOf(file))} site-article__hero" src="${src.replace(/[.]/g, '\\.')}"`), file);
  }
  assert.equal(positionOf(`${PAGES}/get-involved/support.md`), 'top', 'support keeps the float\'s sign in frame');
  const support = readFileSync('dist/get-involved/support/index.html', 'utf8');
  assert.match(support, /<img class="wb-media wb-media--top site-article__hero"/);
});

test('a news post\'s photo is .wb-media too, with its heroPosition', () => {
  const NEWS = 'src/content/news';
  const posts = readdirSync(NEWS).filter((name) => name.endsWith('.md'));
  let photos = 0;
  for (const name of posts) {
    const md = readFileSync(join(NEWS, name), 'utf8');
    if (!/^image:/m.test(md)) continue;
    photos += 1;
    const html = readFileSync(join('dist/news', name.replace(/\.md$/, ''), 'index.html'), 'utf8');
    assert.match(html, new RegExp(`<img class="${mediaClass(positionOf(join(NEWS, name)))} site-post__image"`), name);
  }
  assert.ok(photos >= 3, `${photos} posts with a photo`);
});

test('the banner band is 16:9, and 21:9 from 48rem; the home photo stays edge to edge and is not .wb-media', () => {
  const css = readFileSync('src/styles/site.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const base = css.match(/(?:^|\})\s*\.site-article__hero\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(base, /aspect-ratio:\s*16 \/ 9/);
  assert.match(css, /@media \(min-width: 48rem\)\s*\{\s*\.site-article__hero\s*\{\s*aspect-ratio:\s*21 \/ 9;\s*\}/);
  const photo = home.match(/<img\b[^>]*\bclass="site-hero__photo"/)?.[0] ?? '';
  assert.ok(photo, 'the home photo');
  assert.doesNotMatch(photo, /wb-media/);
});

// Photos with a logo or words drawn in; a banner is cropped differently at every width, so none of them is one.
const MARKED = [
  '/images/about/2025-gd-wb-816-lwb-06.jpg', // the Wahoo Bay and Grateful Divers watermarks, in two corners
  '/images/about/2016-lady-luck-1a.jpg', // a logo
  '/images/get-involved/carousel-3.jpg', // a quotation
];
test('no banner has a watermark or words drawn into it', () => {
  for (const { file, src } of heroes) assert.ok(!MARKED.includes(src), `${file}: ${src}`);
});
