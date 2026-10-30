// Run after `npm run build`: redirects.json (old wahoobay.net URL -> new page) against dist/ and the content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const redirects = JSON.parse(readFileSync('redirects.json', 'utf8'));
const grades = JSON.parse(readFileSync('src/content/grades.json', 'utf8'));
// The old site's fifteen course addresses; a new lesson has no old address and needs no redirect.
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
const distOf = (url) => join('dist', url, 'index.html');
const bare = (from) => (from.length > 1 && from.endsWith('/') ? from.slice(0, -1) : from);
const to = (from) => redirects.find((r) => r.from === from)?.to;

test('every from is a plain encoded path the CloudFront function can look up', () => {
  for (const { from } of redirects) assert.match(from, /^\/[A-Za-z0-9%&\/-]+$/, from);
});

test('the six grade entries are the encoded old names', () => {
  const expected = ['Educator%20Resources', 'Art%20&%20Science', 'Collegiate', 'Prek', 'Fourth', 'Ninth'];
  assert.deepEqual(grades.map((g) => encodeURI(`/pages/education/${g.old}`)), expected.map((e) => `/pages/education/${e}`));
  for (const g of grades) assert.equal(to(encodeURI(`/pages/education/${g.old}`)), `/learn/${g.slug}/`);
});

test('every one of the 15 old course addresses redirects to its lesson', () => {
  for (const slug of OLD_COURSE_SLUGS) assert.equal(to(`/pages/courses/${slug}`), `/learn/courses/${slug}/`);
});

test('every to is / or ends in /, and is a built page', () => {
  for (const { from, to } of redirects) {
    assert.ok(to === '/' || to.endsWith('/'), `${from} -> ${to}`);
    assert.ok(existsSync(distOf(to)), `${from} -> ${to}: no ${distOf(to)}`);
  }
});

test('no from twice once the trailing slash is stripped, and no redirect chains', () => {
  const froms = redirects.map((r) => bare(r.from));
  assert.equal(new Set(froms).size, froms.length);
  for (const { from, to } of redirects) assert.ok(!froms.includes(bare(to)), `${from} -> ${to} is itself redirected`);
});

test('the old interactive URLs and /pages/about, /pages/donate land on their new pages; /pages/ai stays unmapped', () => {
  const required = {
    '/pages/powerbi/overview': '/live/data/',
    '/pages/dashpage': '/live/data/',
    '/pages/intake/report': '/live/log-a-sighting/',
    '/pages/fish-photos-videos': '/live/species/',
    '/pages/mapbox': '/visit/map/',
    '/pages/map': '/visit/map/',
    '/pages/best-of-video': '/live/highlights/',
    '/pages/underwater-camera': '/live/',
    '/pages/about': '/about/',
    '/pages/donate': '/get-involved/support/',
  };
  for (const [from, target] of Object.entries(required)) assert.equal(to(from), target, from);
  assert.equal(to('/pages/ai'), undefined, '/pages/ai awaits Katie');
});
