// The Visit page's facts (src/content/pages/visit/index.md), which the home page's Visit section shows (src/lib/visit.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visitFacts } from '../src/lib/visit.mjs';

const body = readFileSync('src/content/pages/visit/index.md', 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

test('visitFacts reads the bold title and the sentence of each item of the page\'s first list', () => {
  const facts = visitFacts(body);
  assert.deepEqual(facts.map((f) => f.title), ['Open daily: 10 am – 4 pm.', 'Monthly open snorkel: 2nd Saturday.', 'Getting here: 2700 N. Ocean Blvd.', 'Can\'t make it? Visit virtually.']);
  assert.equal(facts[2].text, 'Pompano Beach, FL 33062. Limited paid public parking is available on site.');
});

test('a link in a fact keeps its words and drops its address; a list after a heading is not read', () => {
  const facts = visitFacts('- **One.** See the [underwater camera](https://example.org/live).\n- **Two.** Plain.\n\n## Later\n\n- **Three.** Not a fact.\n');
  assert.deepEqual(facts, [{ title: 'One.', text: 'See the underwater camera.' }, { title: 'Two.', text: 'Plain.' }]);
});

test('a body without the list gives no facts, so the page fails its build rather than show an empty section', () => {
  assert.deepEqual(visitFacts('Just a paragraph.\n'), []);
});
