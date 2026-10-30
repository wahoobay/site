// Run after `npm run build`: the migrated pages (src/content/pages/**) against the built site in dist/,
// and the styling rules against the sources in src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = 'src/content/pages';

/** Every file under `dir`, as paths relative to the repository root, '/'-separated. */
const filesUnder = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name).split('\\').join('/'))
        .sort()
    : [];

/** `about/index.md` → `/about/`; `about/mission.md` → `/about/mission/`. */
const urlOf = (file) => `/${file.slice(PAGES.length + 1).replace(/\.md$/, '').replace(/(^|\/)index$/, '')}/`.replace(/\/+/g, '/');
const distOf = (url) => join('dist', url, 'index.html');

const frontMatter = (md) => md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
const field = (md, name) => {
  const raw = frontMatter(md).match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  if (raw.startsWith('"')) return JSON.parse(raw);
  if (raw.startsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
  return raw;
};
const decode = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();

const markdownFiles = filesUnder(PAGES).filter((file) => file.endsWith('.md'));

// The brief's page table (Task 9): every old page has its new address.
const EXPECTED = [
  '/about/',
  '/about/mission/',
  '/about/board/',
  '/about/contact/',
  '/visit/',
  '/visit/field-experiences/',
  '/visit/field-experiences/video/',
  '/visit/field-experiences/guide/',
  '/visit/field-experiences/request/',
  '/learn/student-conservation/',
  '/learn/faq/',
  '/get-involved/',
  '/get-involved/ambassadors/',
  '/get-involved/support/',
  '/get-involved/partners/',
];

test('every page in the table is a Markdown file, and each one is built with its title as the h1', () => {
  const urls = markdownFiles.map(urlOf);
  for (const url of EXPECTED) assert.ok(urls.includes(url), `no Markdown file for ${url}`);
  for (const file of markdownFiles) {
    const out = distOf(urlOf(file));
    assert.ok(existsSync(out), `${file} → ${out} was not built`);
    const html = readFileSync(out, 'utf8');
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => decode(m[1]));
    assert.equal(h1s.length, 1, `${out} has exactly one h1`);
    assert.equal(h1s[0], field(readFileSync(file, 'utf8'), 'title'), out);
  }
});

test('no hex colour literal and no style= attribute anywhere under src/', () => {
  for (const file of filesUnder('src')) {
    const text = readFileSync(file, 'utf8');
    // Markdown bodies may say "#1"; only the components, layouts, pages and styles are held to the hex rule.
    const isContent = file.startsWith('src/content/') && file.endsWith('.md');
    if (!isContent) assert.doesNotMatch(text, /#[0-9a-f]{3,8}\b/i, `${file}: hex colour literal`);
    assert.doesNotMatch(text, /style=/, `${file}: style= attribute`);
  }
});

test('every design token used under src/ exists in the design system', () => {
  const tokens = readFileSync('node_modules/@wahoobay/design/dist/tokens.css', 'utf8');
  const defined = new Set([...tokens.matchAll(/(--wb-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  for (const file of filesUnder('src')) {
    for (const [, name] of readFileSync(file, 'utf8').matchAll(/var\((--wb-[a-z0-9-]+)/g)) {
      assert.ok(defined.has(name), `${file}: ${name} is not a token of @wahoobay/design`);
    }
  }
});

test('no built page embeds an iframe except the two live pages, and none uses onclick=', () => {
  const allowed = new Set(['dist/live/index.html', 'dist/live/highlights/index.html']);
  const pages = filesUnder('dist').filter((file) => file.endsWith('.html'));
  assert.ok(pages.length > 0, 'dist/ has pages (build first)');
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    if (!allowed.has(file)) assert.doesNotMatch(html, /<iframe\b/i, `${file}: iframe`);
    assert.doesNotMatch(html, /\bonclick=/i, `${file}: onclick=`);
  }
});

const linkIn = (html, href) => html.match(new RegExp(`<a\\b[^>]*\\bhref="${href.replace(/[/.]/g, '\\$&')}"[^>]*>`))?.[0] ?? '';
const mainNav = (html) => html.match(/<nav\b[^>]*aria-label="Main"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
const sectionNav = (html) => html.match(/<nav\b[^>]*aria-label="In this section"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';

test('a page below a section marks the section "true" in the nav and itself "page" in the section navigation', () => {
  const mission = readFileSync('dist/about/mission/index.html', 'utf8');
  assert.match(linkIn(mainNav(mission), '/about/'), /\baria-current="true"/);
  const sub = sectionNav(mission);
  assert.ok(sub, 'the mission page has an "In this section" navigation');
  assert.match(linkIn(sub, '/about/mission/'), /\baria-current="page"/);
  assert.equal(sub.match(/aria-current=/g)?.length, 1, 'only the current page is marked');

  const about = readFileSync('dist/about/index.html', 'utf8');
  assert.match(linkIn(mainNav(about), '/about/'), /\baria-current="page"/);
  assert.match(linkIn(sectionNav(about), '/about/'), /\baria-current="page"/);
});

test('the section navigation lists the section\'s pages in their order', () => {
  const hrefs = (file) => [...sectionNav(readFileSync(file, 'utf8')).matchAll(/\bhref="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs('dist/about/contact/index.html'), ['/about/', '/about/mission/', '/about/board/', '/about/contact/']);
  assert.deepEqual(hrefs('dist/get-involved/index.html'), [
    '/get-involved/',
    '/get-involved/ambassadors/',
    '/get-involved/support/',
    '/get-involved/partners/',
  ]);
});

test('photos in the Markdown pages carry their size and load lazily; every one has alt text', () => {
  for (const file of markdownFiles) {
    const html = readFileSync(distOf(urlOf(file)), 'utf8');
    const body = html.match(/<div class="wb-prose[^"]*">([\s\S]*)<\/div>\s*<\/div>\s*<\/main>/)?.[1] ?? '';
    for (const [img] of body.matchAll(/<img\b[^>]*>/g)) {
      assert.match(img, /\bwidth="\d+"/, `${file}: ${img}`);
      assert.match(img, /\bheight="\d+"/, `${file}: ${img}`);
      assert.match(img, /\bloading="lazy"/, `${file}: ${img}`);
      assert.match(img, /\balt="[^"]+"/, `${file}: ${img} needs alt text`);
    }
  }
});

test('every site-relative link and image in the pages\' Markdown resolves to a built page or a file', () => {
  for (const file of markdownFiles) {
    const md = readFileSync(file, 'utf8');
    const targets = [...md.matchAll(/\]\((\/[^)\s]*)\)|\b(?:href|src)="(\/[^"]*)"/g)].map((m) => (m[1] ?? m[2]).split('#')[0]);
    for (const target of targets) {
      const ok = target.endsWith('/') ? existsSync(distOf(target)) : existsSync(join('dist', decodeURI(target)));
      assert.ok(ok, `${file}: ${target} does not resolve in dist/`);
    }
  }
});

// The buttons of a page: its `actions` row under the lead, and any .wb-btn link in the Markdown body.
const mainOf = (html) => html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
const actionsRow = (html) => html.match(/<div class="site-actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
const buttons = (html) =>
  [...html.matchAll(/<a\b([^>]*\bclass="wb-btn wb-btn--(action|accent|ghost)"[^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    attrs: m[1],
    variant: m[2],
    href: m[1].match(/\bhref="([^"]*)"/)?.[1] ?? '',
    label: decode(m[3]),
  }));

test('every button on a Markdown page resolves; at most three actions; the accent is only for giving', () => {
  for (const file of markdownFiles) {
    const html = readFileSync(distOf(urlOf(file)), 'utf8');
    const main = mainOf(html);
    assert.ok(buttons(actionsRow(main)).length <= 3, `${file}: more than three actions`);
    for (const { attrs, variant, href, label } of buttons(main)) {
      const where = `${file}: "${label}" → ${href}`;
      if (href.startsWith('#')) assert.match(main, new RegExp(`\\bid="${href.slice(1)}"`), where);
      else if (href.startsWith('/')) assert.ok(existsSync(href.endsWith('/') ? distOf(href) : join('dist', href)), where);
      else if (href.startsWith('mailto:') || href.startsWith('tel:')) assert.ok(href.length > 7, where);
      else {
        assert.match(href, /^https:\/\//, where);
        assert.match(attrs, /\btarget="_blank"/, `${where}: opens in a new tab`);
        assert.match(attrs, /\brel="noopener"/, where);
        assert.match(label, /\(opens in a new tab\)$/, `${where}: says it opens a new tab`);
      }
      if (variant === 'accent') assert.match(label, /Donate|Give/, `${where}: the accent is for Donate only`);
    }
  }
});

test('the pages whose old version led with a button lead with it again', () => {
  const first = (url) => buttons(actionsRow(mainOf(readFileSync(distOf(url), 'utf8'))))[0] ?? {};
  assert.deepEqual(
    (({ variant, label }) => ({ variant, label }))(first('/get-involved/support/')),
    { variant: 'accent', label: 'Donate Now (opens in a new tab)' },
  );
  assert.equal(first('/visit/field-experiences/').variant, 'action');
  assert.equal(first('/visit/field-experiences/request/').label, 'Open Request Form (opens in a new tab)');
});
