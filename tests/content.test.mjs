// Run after `npm run build`: the migrated pages (src/content/pages/**) against the built site in dist/,
// and the styling rules against the sources in src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { aiUrl } from '../src/lib/nav.mjs';

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

test('no built page embeds an iframe except the live pages and the data dashboards, and none uses onclick=', () => {
  const allowed = new Set(['dist/live/index.html', 'dist/live/highlights/index.html', 'dist/live/data/index.html']);
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

  // /learn/ is an Astro page, not a Markdown one; its section's navigation still starts with it.
  const learn = sectionNav(readFileSync('dist/learn/index.html', 'utf8'));
  assert.match(linkIn(learn, '/learn/'), /\baria-current="page"/);
  assert.equal(learn.match(/aria-current=/g)?.length, 1, 'only /learn/ is marked on /learn/');
  const faq = sectionNav(readFileSync('dist/learn/faq/index.html', 'utf8'));
  assert.ok(linkIn(faq, '/learn/'), 'the FAQ links back to /learn/');
  assert.doesNotMatch(linkIn(faq, '/learn/'), /aria-current=/);
  assert.match(linkIn(faq, '/learn/faq/'), /\baria-current="page"/);
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
  [...html.matchAll(/<a\b([^>]*\bclass="wb-btn wb-btn--(action|accent|ghost)(?: wb-btn--wrap)?"[^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
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

// Task 10: news, board and partners are data (src/content/news, board, partners).
const jsonIn = (dir) => filesUnder(dir).filter((file) => file.endsWith('.json')).map((file) => JSON.parse(readFileSync(file, 'utf8')));
const NEWS = 'src/content/news';
const newsPosts = filesUnder(NEWS)
  .filter((file) => file.endsWith('.md'))
  .map((file) => ({ file, title: field(readFileSync(file, 'utf8'), 'title'), date: field(readFileSync(file, 'utf8'), 'date') }));

test('/news/ lists every post, newest first, each date in a <time datetime>', () => {
  assert.ok(newsPosts.length > 0, 'there are news posts');
  const html = readFileSync('dist/news/index.html', 'utf8');
  const listed = [...html.matchAll(/<time\b[^>]*datetime="([^"]+)"[^>]*>[\s\S]*?<\/time>/g)].map((m) => m[1].slice(0, 10));
  const expected = newsPosts.map((post) => post.date.slice(0, 10)).sort().reverse();
  assert.deepEqual(listed, expected, 'dates newest first');
  const text = decode(html);
  let last = -1;
  for (const post of [...newsPosts].sort((a, b) => b.date.localeCompare(a.date))) {
    const at = text.indexOf(post.title, last + 1);
    assert.ok(at > last, `${post.title} is listed after the newer posts`);
    last = at;
  }
  for (const post of newsPosts) {
    const slug = post.file.slice(NEWS.length + 1).replace(/\.md$/, '');
    const page = readFileSync(distOf(`/news/${slug}/`), 'utf8');
    assert.match(page, /href="\/news\/"/, `${slug}: a link back to /news/`);
  }
});

test('every board photo and partner logo exists under public/', () => {
  for (const member of jsonIn('src/content/board')) {
    if (member.photo) assert.ok(existsSync(join('public', member.photo)), `${member.name}: ${member.photo}`);
  }
  for (const partner of jsonIn('src/content/partners')) {
    assert.ok(existsSync(join('public', partner.logo)), `${partner.name}: ${partner.logo}`);
  }
});

test('the board page names every member and the partners page every partner; partner links are http(s)', () => {
  const board = decode(readFileSync('dist/about/board/index.html', 'utf8'));
  for (const member of jsonIn('src/content/board')) assert.ok(board.includes(member.name), `board page lacks ${member.name}`);
  const raw = readFileSync('dist/get-involved/partners/index.html', 'utf8');
  const partners = decode(raw);
  const alts = [...raw.matchAll(/<img\b[^>]*\balt="([^"]*)"/g)].map((m) => decode(m[1]).replaceAll('&#34;', '"').replaceAll('&#38;', '&'));
  for (const partner of jsonIn('src/content/partners')) {
    assert.ok(alts.includes(partner.name) || partners.includes(partner.name), `partners page lacks ${partner.name}`);
    if (partner.url) assert.match(partner.url, /^https?:\/\//, partner.name);
  }
});

// Task 11: the lessons (src/content/lessons/*.yaml, src/content/grades.json), the live pages, the map placeholder,
// sign-in and the Instagram strip. The lesson files keep one key per line and `grades` as a [flow, list], so a
// few regular expressions read them, as `field` reads front matter.
const LESSONS = 'src/content/lessons';
const yamlValue = (raw) => {
  const value = raw.trim();
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
};
const lessons = filesUnder(LESSONS)
  .filter((file) => file.endsWith('.yaml'))
  .map((file) => {
    const text = readFileSync(file, 'utf8');
    const top = (name) => yamlValue(text.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1] ?? '');
    return {
      file,
      title: top('title'),
      slug: top('slug'),
      grades: (text.match(/^grades:\s*\[(.*)\]\s*$/m)?.[1] ?? '').split(',').map((g) => g.trim()).filter(Boolean),
      urls: [...text.matchAll(/^\s+(?:- )?url:(.*)$/gm)].map((m) => yamlValue(m[1])),
    };
  });
const grades = existsSync('src/content/grades.json') ? JSON.parse(readFileSync('src/content/grades.json', 'utf8')) : [];
const attr = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const hrefIn = (html, href) => html.includes(`href="${attr(href)}"`);

// lodash 4.17.21's kebabCase, the function the old site made its course addresses with (Category.js). A title of
// ASCII letters, digits and spaces with no case change inside a word does not match lodash's reHasUnicodeWord,
// so lodash splits it with its asciiWords pattern; every lesson title must be of that kind.
const reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;
const reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;
const kebabCase = (title) => (title.match(reAsciiWord) ?? []).map((word) => word.toLowerCase()).join('-');

// The old site's fifteen course addresses (/pages/courses/<slug>), computed with lodash itself from course-data.js.
// Pinned here, so a changed title cannot move its address and break a redirect without this test noticing.
const OLD_COURSE_SLUGS = [
  'build-a-backbone',
  'coral-reefs',
  'crustacean-creations',
  'field-based-activities',
  'field-experience-guide',
  'intertidal-zone',
  'mangrove-trees',
  'microplastic-beach-protocol',
  'rapid-oyster-community-assessment-datasheet',
  'sampling-for-microplastics',
  'teaching-climate-change-through-art-s-fl-habitats',
  'teaching-climate-change-through-art-wahoo-bay',
  'the-great-plankton-race',
  'traveling-trunk-program',
  'university-partner-opportunities',
];

test('the old site\'s fifteen courses and six grades are data; each slug is lodash\'s kebabCase of the title', () => {
  const names = filesUnder(LESSONS).filter((f) => f.endsWith('.yaml')).map((f) => f.slice(LESSONS.length + 1, -'.yaml'.length));
  for (const slug of OLD_COURSE_SLUGS) assert.ok(names.includes(slug), `${slug}.yaml: the old course address needs its lesson`);
  for (const name of names) assert.match(name, /^[a-z0-9-]+$/, `${name}: lesson file name`);
  assert.equal(new Set(names).size, names.length, 'lesson file names are unique');
  assert.deepEqual(grades.map((g) => g.slug), ['educators', 'art-and-science', 'collegiate', 'prek', 'fourth-grade', 'ninth-grade']);
  const slugs = new Set();
  for (const lesson of lessons) {
    assert.doesNotMatch(lesson.title, reHasUnicodeWord, `${lesson.file}: the title takes lodash's other word pattern`);
    assert.equal(lesson.slug, kebabCase(lesson.title), `${lesson.file}: slug`);
    assert.match(lesson.slug, /^[a-z0-9-]+$/);
    assert.equal(lesson.file, `${LESSONS}/${lesson.slug}.yaml`, 'the file is named by its slug');
    assert.ok(!slugs.has(lesson.slug), `${lesson.slug} twice`);
    slugs.add(lesson.slug);
    assert.ok(lesson.grades.length > 0, `${lesson.slug}: in a grade`);
    for (const grade of lesson.grades) assert.ok(grades.some((g) => g.slug === grade), `${lesson.slug}: no grade ${grade}`);
    assert.ok(lesson.urls.length > 0, `${lesson.slug}: has links`);
    for (const url of lesson.urls) assert.match(url, /^(https:\/\/|\/docs\/)/, `${lesson.slug}: ${url}`);
  }
  for (const grade of grades) assert.ok(existsSync(join('public', grade.image)), `${grade.slug}: ${grade.image}`);
});

test('/learn/ shows the six grades, each a card linking to its page, with the section navigation', () => {
  const html = readFileSync('dist/learn/index.html', 'utf8');
  const text = decode(html);
  let last = -1;
  for (const grade of grades) {
    assert.ok(text.indexOf(grade.title) > last, `/learn/ names ${grade.title}, in the order of grades.json`);
    last = text.indexOf(grade.title);
    const card = html.match(new RegExp(`<a class="wb-card"[^>]*href="/learn/${grade.slug}/"[^>]*>[\\s\\S]*?</a>`))?.[0] ?? '';
    assert.ok(card, `/learn/ has a card for ${grade.slug}`);
    assert.match(card, /<img\b[^>]*\balt=""/, `${grade.slug}: the tile is decorative inside the link`);
  }
  const hrefs = [...sectionNav(html).matchAll(/\bhref="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['/learn/', '/learn/student-conservation/', '/learn/faq/']);
});

test('every grade page lists its courses; every course page has its links and links back to its grades', () => {
  assert.ok(grades.length > 0 && lessons.length > 0, 'there are grades and lessons');
  for (const grade of grades) {
    const html = readFileSync(distOf(`/learn/${grade.slug}/`), 'utf8');
    const listed = [...mainOf(html).matchAll(/href="\/learn\/courses\/([^"/]+)\/"/g)].map((m) => m[1]).sort();
    const expected = lessons.filter((l) => l.grades.includes(grade.slug)).map((l) => l.slug).sort();
    assert.deepEqual(listed, expected, `${grade.slug} lists its courses`);
  }
  for (const lesson of lessons) {
    const out = distOf(`/learn/courses/${lesson.slug}/`);
    assert.ok(existsSync(out), `${out} was not built`);
    const html = readFileSync(out, 'utf8');
    assert.equal(decode(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''), lesson.title, out);
    for (const url of lesson.urls) assert.ok(hrefIn(html, url), `${lesson.slug}: no link to ${url}`);
    for (const grade of lesson.grades) assert.ok(hrefIn(html, `/learn/${grade}/`), `${lesson.slug}: no link back to ${grade}`);
    assert.doesNotMatch(html, /\bwb-chip\b/, `${lesson.slug}: chips carry the accent, which is for "alive right now"`);
  }
});

test('a course page\'s first document is its primary action; any others are ghosts (finish review, fix 4)', () => {
  assert.ok(lessons.length > 0, 'there are lessons');
  for (const lesson of lessons) {
    const html = readFileSync(distOf(`/learn/courses/${lesson.slug}/`), 'utf8');
    const links = html.match(/<ul class="site-course__links"[\s\S]*?<\/ul>/)?.[0] ?? '';
    const variants = [...links.matchAll(/<a class="wb-btn wb-btn--(\w+)\b/g)].map((m) => m[1]);
    assert.equal(variants.length, lesson.urls.length, `${lesson.slug}: one button per document`);
    assert.deepEqual(variants, variants.map((_, i) => (i === 0 ? 'action' : 'ghost')), lesson.slug);
  }
});

test('the live pages embed YouTube without cookies or autoplay, and they alone are dark', () => {
  const live = readFileSync('dist/live/index.html', 'utf8');
  const highlights = readFileSync('dist/live/highlights/index.html', 'utf8');
  assert.ok(live.includes('https://www.youtube-nocookie.com/embed/oBTGY6Ax870"'), '/live/ embeds the SeaHIVE stream');
  assert.ok(highlights.includes('https://www.youtube-nocookie.com/embed/videoseries?list=PLDuZ7tdc3LUCZh0F45bTNuC-LkgCVjyTG&amp;rel=0"'));
  for (const html of [live, highlights]) {
    const frames = html.match(/<iframe\b[^>]*>/g) ?? [];
    assert.equal(frames.length, 1, 'one embed');
    assert.match(frames[0], /\btitle="[^"]+"/);
    assert.match(frames[0], /\bloading="lazy"/);
    assert.doesNotMatch(frames[0], /autoplay/);
  }
  assert.ok(hrefIn(mainOf(live), '/live/highlights/'), '/live/ links the highlights from its body');
  assert.ok(hrefIn(mainOf(highlights), '/live/'), '/live/highlights/ links back to /live/ from its body');
  assert.match(live, /<span class="wb-live"[^>]*>Live<\/span>/, '/live/ has the live badge');
  assert.doesNotMatch(highlights, /class="wb-live"/, 'the highlights are not live');
  // CLAUDE.md: the dark theme is for the live-camera pages and, on the home page only, the live band and the footer.
  const dark = new Set(['dist/live/index.html', 'dist/live/highlights/index.html']);
  for (const file of filesUnder('dist').filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    const isDark = /<html\b[^>]*\bdata-theme="dark"/.test(html);
    assert.equal(isDark, dark.has(file), `${file}: a dark page is a live page`);
    const darkParts = [...html.matchAll(/<([a-z]+)\b[^>]*\bdata-theme="dark"[^>]*>/g)]
      .map(([tag, name]) => (name === 'html' ? null : `${name}.${tag.match(/\bclass="([^" ]+)/)?.[1]}`))
      .filter(Boolean);
    assert.deepEqual(darkParts, file === 'dist/index.html' ? ['section.wb-band', 'footer.wb-footer'] : [], `${file}: dark sections`);
  }
});

test('the home page has one script, the Instagram strip\'s; no other page has any', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'exactly one <script');
  const code = scripts[0]?.[1] ?? '';
  assert.ok(code.includes('https://api.wahoobay.net/api/v1/instagram/posts/latest'), 'it fetches the Instagram posts');
  assert.ok(code.includes('textContent'), 'it writes the caption as text');
  assert.doesNotMatch(code, /innerHTML|insertAdjacentHTML|document\.write/, 'it never parses API data as HTML');
  assert.match(code, /\.remove\(\)/, 'it removes the section when there is nothing to show');
  const strip = html.match(/<section\b[^>]*id="instagram"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.equal(strip.match(/class="wb-card site-instagram__post"/g)?.length, 4, 'four empty cards');
  // The exceptions are the islands' pages, which have Astro's loader for their island: the park map
  // (tests/map.test.mjs) in a build with PUBLIC_MAPBOX_TOKEN (without the token that page has no script either), and
  // the sighting form (tests/sighting.test.mjs).
  for (const file of filesUnder('dist').filter((f) => f.endsWith('.html') && f !== 'dist/index.html')) {
    const page = readFileSync(file, 'utf8');
    if (file === 'dist/visit/map/index.html' && process.env.PUBLIC_MAPBOX_TOKEN) {
      assert.match(page, /<astro-island\b[^>]*\bclient="visible"/, `${file}: the map's island`);
      continue;
    }
    if (file === 'dist/live/log-a-sighting/index.html') {
      assert.match(page, /<astro-island\b[^>]*\bclient="load"/, `${file}: the form's island`);
      continue;
    }
    assert.doesNotMatch(page, /<script\b/, `${file}: no client script in this step`);
  }
});

// The fish-ID sign-in is on the same per-environment address as the nav's Fish ID (src/lib/nav.mjs): staging's on a
// build without PUBLIC_AI_URL, production's when the production deploy sets it (2026-10-30: it was always production's).
test('/sign-in/ links the fish-ID sign-in at this build\'s AI address: staging by default, production under PUBLIC_AI_URL', () => {
  assert.equal(`${aiUrl(undefined)}login`, 'https://staging-ai.wahoobay.net/login');
  assert.equal(`${aiUrl('https://ai.wahoobay.net/')}login`, 'https://ai.wahoobay.net/login');
  const source = readFileSync('src/pages/sign-in/index.astro', 'utf8');
  assert.match(source, /^import \{ aiUrl \} from '\.\.\/\.\.\/lib\/nav\.mjs';$/m);
  assert.match(source, /\$\{aiUrl\(import\.meta\.env\.PUBLIC_AI_URL\)\}login/);
  assert.doesNotMatch(source, /https:\/\/(staging-)?ai\.wahoobay\.net/, 'no address written into the page');
  const html = readFileSync('dist/sign-in/index.html', 'utf8');
  const login = `${aiUrl(process.env.PUBLIC_AI_URL)}login`;
  const links = [...html.matchAll(/href="(https:\/\/[a-z-]*ai\.wahoobay\.net\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(links.includes(login), `the fish-ID sign-in, ${login}`);
  assert.deepEqual(links.filter((href) => href.endsWith('/login') && href !== login), [], 'no other environment\'s sign-in');
});

test('/sign-in/ has its heading and prints no review address', () => {
  const html = readFileSync('dist/sign-in/index.html', 'utf8');
  assert.equal(decode(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''), 'Sign in to Wahoo Bay');
  assert.ok(!html.includes('review-'), 'no review address on the page');
  assert.doesNotMatch(html, /<form\b/, 'no form');
});

test('/visit/map/ is a page of the Visit section, with the map image and the sites as text', () => {
  const html = readFileSync('dist/visit/map/index.html', 'utf8');
  assert.match(mainOf(html), /<img\b[^>]*\bsrc="\/images\/map\.png"[^>]*\balt="[^"]{20,}"/);
  const text = decode(mainOf(html));
  for (const site of ['Wahoo Bay Camera', 'Pompano Pier Camera', 'Wahoo Bay Weather Station', 'Wahoo Bay Water Quality']) {
    assert.ok(text.includes(site), `the map page names ${site}`);
  }
  assert.match(linkIn(sectionNav(html), '/visit/map/'), /\baria-current="page"/);
});

// Task 2: the home page's four impact figures are data, src/content/figures.json (the Support page keeps its own list
// for Katie; tests/home.test.mjs holds the two to the same numbers).
test('the figures are a collection read from src/content/figures.json, with Katie\'s note beside it', () => {
  const config = readFileSync('src/content.config.ts', 'utf8');
  const figures = config.match(/(?:\/\/[^\n]*\n)*const figures = defineCollection\(\{[\s\S]*?\n\}\);/)?.[0] ?? '';
  assert.match(figures, /loader: file\('src\/content\/figures\.json'\)/);
  assert.match(figures, /id: z\.string\(\)/);
  assert.match(figures, /value: z\.number\(\)/);
  assert.match(figures, /label: z\.string\(\)/);
  assert.match(figures, /katie: review: figures copied by hand from the old dashboard; check before launch/);
  assert.match(config, /export const collections = \{[^}]*\bfigures\b[^}]*\}/);
  const data = JSON.parse(readFileSync('src/content/figures.json', 'utf8'));
  assert.deepEqual(data.map(({ id }) => id), ['community', 'students', 'educators', 'species']);
  for (const f of data) assert.ok(Number.isInteger(f.value) && f.value > 0, f.id);
});
