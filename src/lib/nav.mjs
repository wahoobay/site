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
 * `external`, so it opens in a new tab and is never the current page.
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

/**
 * The Live reef pages' own navigation (src/components/SectionNav.astro draws it on each of them), Fish ID last: the
 * fish-ID app is another site, so it is `external` and opens in a new tab.
 * @param {string} ai the fish-ID app's address
 * @returns {{ label: string, href: string, external?: true }[]}
 */
export const liveNav = (ai) => [
  { label: 'Camera', href: '/live/' },
  { label: 'Reef highlights', href: '/live/highlights/' },
  { label: 'Species', href: '/live/species/' },
  { label: 'Data dashboards', href: '/live/data/' },
  { label: 'Log a sighting', href: '/live/log-a-sighting/' },
  { label: 'Fish ID', href: ai, external: true },
];
