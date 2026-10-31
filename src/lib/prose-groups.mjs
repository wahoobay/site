// The camera page's Markdown body (src/content/live/camera.md) as groups: under each H2, its H3 items, each H3 with
// what follows it, wrapped so site.css can lay them out side by side from 48rem and as a tight list below
// (.site-live__group, __items, __item). The words, their order and the headings are the Markdown's: only wrappers are
// added. A section with fewer than two H3s, and anything before the first H2, is left as it is. A plain module, so the
// tests read it without a build (tests/live.test.mjs).

// A comment before an H3 (a katie: review note) belongs to that H3's item.
const COMMENTS = String.raw`(?:<!--[\s\S]*?-->\s*)*`;
const ITEM = new RegExp(String.raw`${COMMENTS}<h3\b[\s\S]*?(?=${COMMENTS}<h3\b|$)`, 'g');

/**
 * The body's HTML with each H2 group's H3 items wrapped.
 * @param {string} html the rendered Markdown
 * @returns {string}
 */
export const groupItems = (html) =>
  html
    .split(/(?=<h2\b)/)
    .map((section) => {
      if (!section.startsWith('<h2')) return section;
      const items = [...section.matchAll(ITEM)];
      if (items.length < 2) return section;
      const head = section.slice(0, items[0].index).trim();
      const body = items.map((m) => `<div class="site-live__item">${m[0].trim()}</div>`).join('\n');
      // The whitespace after the section's last item stays between the groups.
      return `<div class="site-live__group">${head}\n<div class="site-live__items">${body}</div></div>${/\s*$/.exec(section)?.[0] ?? ''}`;
    })
    .join('');
