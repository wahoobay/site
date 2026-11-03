// What @astrojs/sitemap lists (astro.config.mjs): every page but the sighting review's, which is noindex and
// disallowed in public/robots.txt as well (tests/sitemap-filter.test.mjs).
import { ADMIN_BASE } from './admin/routes.mjs';

/**
 * Whether the sitemap names the page at `page`, a full URL as the integration passes it.
 * @param {string} page
 */
export const sitemapFilter = (page) => {
  const path = new URL(page).pathname;
  return !(path.startsWith(ADMIN_BASE) || `${path}/` === ADMIN_BASE);
};
