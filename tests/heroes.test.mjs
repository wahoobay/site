// Run after `npm run build`: the banner photos. Dan's staging review (2026-10-30): the park aerial, /WB-1.jpg, was the
// home page's photo and the banner of /visit/ and /get-involved/support/ ("used far too much"). It stays on the home
// page, where it says "this is the park"; each section page opens on a photograph of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
    assert.match(readFileSync(builtOf(file), 'utf8'), new RegExp(`<img class="site-article__hero" src="${heroOf(file).replace(/[.]/g, '\\.')}"`), `${file}: its banner is built`);
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
