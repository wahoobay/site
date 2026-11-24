// The Visit page's facts (src/content/pages/visit/index.md): the items of the list that opens its body, each a bold
// title and a sentence. The home page's Visit section shows them (src/components/VisitSection.astro), so the hours,
// the open snorkel and the address are written once, on the Visit page. A plain module, so the tests read it without a
// build (tests/visit-facts.test.mjs).

/**
 * The bold title and the sentence of each item of the body's first list, up to its first heading. A Markdown link in
 * a sentence keeps its words and drops its address: the home page shows the facts as plain text.
 * @param {string} body the page's Markdown, without its front matter
 * @returns {{ title: string, text: string }[]}
 */
export const visitFacts = (body) => {
  const facts = [];
  for (const line of String(body).split(/\r?\n/)) {
    if (/^#/.test(line)) break;
    const item = line.match(/^- \*\*(.+?)\*\*\s+(.+)$/);
    if (item) facts.push({ title: item[1].trim(), text: item[2].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim() });
  }
  return facts;
};
