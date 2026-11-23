// The donors' thank-you page (src/content/pages/get-involved/support/thank-you.md), after Katie's ask of 2026-11-23:
// it carries the Support page's "Explore Our Impact" button and its "Our Impact at a Glance" figures, and the receipt
// note answers "Questions About Your Gift?". The dist: tests read the built site (run `npm run build` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const md = (page) => readFileSync(`src/content/pages/get-involved/${page}.md`, 'utf8');
const built = (page) => readFileSync(`dist/get-involved/${page}/index.html`, 'utf8');
/** The Markdown from `## heading` to the next h2 (or the end). */
const section = (text, heading) => text.split(`\n## ${heading}\n`)[1]?.split(/\n## /)[0] ?? '';
/** The figures list of a built page: the first <ul> after the h2 "Our Impact at a Glance". */
const builtFigures = (html) => html.split(/<h2 id="our-impact-at-a-glance">Our Impact at a Glance<\/h2>/)[1]?.match(/<ul>[\s\S]*?<\/ul>/)?.[0] ?? '';

const RECEIPT =
  'Zeffy, our giving platform, will email your receipt. Please keep it for your records. The Shipwreck Park, Inc. is a ' +
  '501(c)(3) nonprofit (EIN 47-4500874), and your gift is tax-deductible to the extent permitted by law.';

test('its Our Impact at a Glance lists the Support page\'s four figures, word for word', () => {
  const figures = (text) => section(text, 'Our Impact at a Glance').split('\n').filter((line) => line.startsWith('- '));
  assert.equal(figures(md('support')).length, 4);
  assert.deepEqual(figures(md('support/thank-you')), figures(md('support')));
});

test('the receipt note sits under Questions About Your Gift?, and nowhere else', () => {
  const page = md('support/thank-you');
  assert.ok(section(page, 'Questions About Your Gift?').includes(RECEIPT));
  assert.equal(page.split(RECEIPT).length, 2, 'said once');
});

test('dist: Explore Our Impact jumps to the figures, which read as on the Support page', () => {
  const html = built('support/thank-you');
  const actions = html.match(/<div class="site-actions">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(actions, /<a class="wb-btn wb-btn--ghost wb-btn--wrap" href="#our-impact-at-a-glance">Explore Our Impact<\/a>/);
  assert.doesNotMatch(actions, /zeffy\.com/, 'no donate button: the visitor has just given');
  assert.notEqual(builtFigures(html), '');
  assert.equal(builtFigures(html), builtFigures(built('support')));
  assert.doesNotMatch(html, /\{species-documented\}/);
});
