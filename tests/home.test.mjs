// Run after `npm run build`: the home page. The hero panel is raised over its photograph (finish review, fix 3).
// The Instagram script runs against a small stand-in for the DOM (fix 5 and note 3): a picture that fails takes its card away, the strip goes when fewer than two cards
// are left, and a caption is cut at a word boundary, never inside a word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('dist/index.html', 'utf8');
const code = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';

class Node {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.className = attrs.class ?? '';
    this.id = attrs.id ?? '';
    this.attributes = { ...attrs };
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.textContent = '';
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type) {
    for (const fn of this.listeners[type] ?? []) fn.call(this, { type, target: this, currentTarget: this });
  }
  all() {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  querySelectorAll(selector) {
    const match = selector.startsWith('.')
      ? (n) => n.className.split(/\s+/).includes(selector.slice(1))
      : (n) => n.tagName === selector.toUpperCase();
    return this.all().filter(match);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

/** Runs the script with `posts` as the API's answer; resolves once the fetch has been handled. */
async function run(posts) {
  const body = new Node('body');
  const section = body.appendChild(new Node('section', { id: 'instagram' }));
  const list = section.appendChild(new Node('ul', { 'aria-busy': 'true' }));
  for (let i = 0; i < 4; i++) list.appendChild(new Node('li', { class: 'wb-card site-instagram__post' }));
  const document = {
    getElementById: (id) => body.all().find((n) => n.id === id) ?? null,
    createElement: (tag) => new Node(tag),
  };
  const response = { ok: true, status: 200, json: async () => ({ status: 'Success', data: posts }) };
  const window = { fetch: async () => response };
  vm.runInNewContext(code, { window, document, setTimeout: () => 1, clearTimeout: () => {} });
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  const cards = () => list.querySelectorAll('.site-instagram__post');
  const present = () => body.children.includes(section);
  return { section, list, cards, present };
}

const post = (n, caption = `Post ${n}`) => ({
  permalink: `https://www.instagram.com/p/${n}/`,
  media_type: 'IMAGE',
  media_url: `https://cdn.example/${n}.jpg`,
  caption,
});

test('the hero panel is the raised panel over the photograph; its buttons may wrap', () => {
  assert.match(html, /<div class="wb-panel wb-panel--raised site-hero__panel">/);
  const actions = html.match(/<div class="site-hero__actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const buttons = actions.match(/<a class="wb-btn [^"]*"/g) ?? [];
  assert.equal(buttons.length, 2);
  for (const a of buttons) assert.match(a, /\bwb-btn--wrap\b/, a);
});

test('the script listens for a failed picture with addEventListener, not an onerror attribute', () => {
  assert.match(code, /addEventListener\(\s*['"]error['"]/);
  assert.doesNotMatch(html, /onerror/i);
});

test('four posts fill four cards, each a caption link around its picture', async () => {
  const { cards, present } = await run([1, 2, 3, 4].map((n) => post(n)));
  assert.ok(present());
  assert.equal(cards().length, 4);
  for (const card of cards()) {
    const link = card.querySelector('a');
    assert.equal(link.className, 'site-instagram__link wb-caption');
    assert.equal(link.target, '_blank');
    assert.equal(card.querySelector('img').className, 'wb-card__media');
  }
});

test('a picture that fails takes its card away; the strip goes when fewer than two cards are left', async () => {
  const { cards, present } = await run([1, 2, 3, 4].map((n) => post(n)));
  cards()[1].querySelector('img').fire('error');
  assert.equal(cards().length, 3, 'the failed card is gone');
  assert.ok(present(), 'three cards: the strip stays');
  cards()[0].querySelector('img').fire('error');
  assert.equal(cards().length, 2);
  assert.ok(present(), 'two cards: the strip stays');
  cards()[0].querySelector('img').fire('error');
  assert.ok(!present(), 'one card: the strip goes');
});

test('one post is not a strip: the section goes', async () => {
  const { present } = await run([post(1)]);
  assert.ok(!present());
});

test('a long caption is cut at the last word boundary within 90 characters, then "…"; a short one is whole', async () => {
  const long =
    'Wahoo Bay welcomed the fourth graders of Pompano Beach Elementary for a morning on the reef, snorkelling the modules.';
  const exact = `${'a'.repeat(44)} ${'b'.repeat(45)} tail`; // the 91st character is the space before "tail"
  const oneWord = 'x'.repeat(120);
  const { cards } = await run([post(1, long), post(2, 'A short caption.'), post(3, exact), post(4, oneWord)]);
  const caption = (i) => cards()[i].querySelector('a').children.find((c) => c.tagName === 'SPAN' && !c.className).textContent;
  const first = caption(0);
  assert.ok(first.endsWith('…'), first);
  const kept = first.slice(0, -1);
  assert.ok(Array.from(kept).length <= 90, `${Array.from(kept).length} characters`);
  assert.ok(long.startsWith(kept), 'a prefix of the caption');
  assert.match(long.slice(kept.length), /^[\s,;:.!?]/, `"${kept}" ends at a word boundary`);
  // Ninety characters end inside "reef", so the cut falls before it.
  assert.equal(kept, 'Wahoo Bay welcomed the fourth graders of Pompano Beach Elementary for a morning on the');
  assert.equal(caption(1), 'A short caption.');
  assert.equal(caption(2), `${'a'.repeat(44)} ${'b'.repeat(45)}…`);
  assert.equal(caption(3), 'Instagram post', 'a caption with no word boundary is not cut inside its word');
});
