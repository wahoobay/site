// Unlisted pages: pages of the pages collection that are built and reachable at their address but linked from no list.
// They are left out of their section's "In this section" navigation (sectionPages, src/lib/sections.ts) and out of
// the sitemap (src/lib/sitemap-filter.mjs), and carry noindex (src/layouts/Page.astro); their own section navigation
// marks the page they sit under. The list is a plain module, not a front-matter field, because the sitemap filter runs
// in astro.config.mjs, outside the content collections (tests/unlisted.test.mjs).
//
// /get-involved/support/thank-you/ is where Zeffy sends donors after a gift. Katie gives Zeffy the old site's
// https://wahoobay.net/pages/thank-you; after the cutover that address redirects here (redirects.json).

/** The unlisted pages' addresses, each with its trailing slash. */
export const UNLISTED = Object.freeze(['/get-involved/support/thank-you/']);

/** `path` with one trailing slash. @param {string} path */
const slashed = (path) => (path.endsWith('/') ? path : `${path}/`);

/**
 * Whether the page at `path` (a pathname, with or without its trailing slash) is unlisted.
 * @param {string} path
 */
export const isUnlisted = (path) => UNLISTED.includes(slashed(path));

/**
 * The address of the page `path` sits under: '/get-involved/support/thank-you/' → '/get-involved/support/'.
 * @param {string} path
 */
export const parentOf = (path) => slashed(path).replace(/[^/]+\/$/, '');
