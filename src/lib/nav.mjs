// The main navigation's items (src/components/Nav.astro draws them, then Donate and sign-in). A plain module, so the
// tests read it without a build (tests/nav.test.mjs).

/** The fish-ID app on staging: the address when PUBLIC_AI_URL is not set (local builds, CI, the staging deploy). */
export const AI_URL_DEFAULT = 'https://staging-ai.wahoobay.net/';

/**
 * The fish-ID app's address for this build: the build-time PUBLIC_AI_URL, which the deploy workflow sets per
 * environment, else staging.
 * @param {string | undefined} value
 */
export const aiUrl = (value) => value ?? AI_URL_DEFAULT;

/**
 * The five sections, with Fish ID, the fish-ID app, after Live reef. It is another site of the same organisation:
 * `external`, so it opens in the same tab and is never the current page.
 * @param {string} ai the fish-ID app's address
 * @returns {{ label: string, href: string, external?: true }[]}
 */
export const mainNav = (ai) => [
  { label: 'Visit', href: '/visit/' },
  { label: 'Learn', href: '/learn/' },
  { label: 'Live reef', href: '/live/' },
  { label: 'Fish ID', href: ai, external: true },
  { label: 'Get involved', href: '/get-involved/' },
  { label: 'About', href: '/about/' },
];
