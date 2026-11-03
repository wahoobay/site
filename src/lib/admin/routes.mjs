// The sighting review's hash router: the admin is one page (src/pages/admin/index.astro, the island
// src/islands/AdminApp.tsx), and its screens are addresses after the # (#/queue, #/review/42). Each route names the
// server capability (src/lib/admin/permissions.mjs) that opens it; the guard only decides what to SHOW, the API's
// CapabilityFilter still decides what is allowed. A plain module, so the tests read it without a build
// (tests/admin-routes.test.mjs).
import { can } from './permissions.mjs';

/**
 * Where the admin is. The page's file (src/pages/admin/index.astro), the sitemap's filter (src/lib/sitemap-filter.mjs),
 * public/robots.txt and the sign-in page's link follow it; tests/admin-shell.test.mjs holds them to it.
 */
export const ADMIN_BASE = '/admin/';

/** @typedef {{ hash: string, screen: string, cap: string | null }} Route */

/**
 * The routes, in the sidebar's order. `:id` is one segment of digits (a sighting's or a species' id), so a parameter
 * can never carry a path into the API's addresses. `cap` null: any signed-in user.
 * @type {readonly Readonly<Route>[]}
 */
export const ROUTES = Object.freeze(
  /** @type {Route[]} */ ([
    { hash: '#/', screen: 'dashboard', cap: 'viewData' },
    { hash: '#/queue', screen: 'queue', cap: 'reviewSightings' },
    { hash: '#/sightings', screen: 'sightings', cap: 'reviewSightings' },
    { hash: '#/review/:id', screen: 'review', cap: 'reviewSightings' },
    { hash: '#/species', screen: 'species', cap: 'editSpecies' },
    { hash: '#/species/:id', screen: 'speciesDetail', cap: 'editSpecies' },
    { hash: '#/media', screen: 'media', cap: 'editMedia' },
    { hash: '#/recycle', screen: 'recycle', cap: 'recycle' },
    { hash: '#/activity', screen: 'activity', cap: 'viewAudit' },
    { hash: '#/users', screen: 'users', cap: 'manageUsers' },
    { hash: '#/settings', screen: 'settings', cap: 'settings' },
    { hash: '#/password', screen: 'password', cap: null },
  ]).map((route) => Object.freeze(route)),
);

/** Where an unknown address, and a route the user may not open, lead. */
export const DASHBOARD = ROUTES[0];

/** The change-password screen: open to anyone signed in, and the only one while the password must change. */
export const PASSWORD = /** @type {Readonly<Route>} */ (ROUTES.find((r) => r.screen === 'password'));

/** Each route's pattern: the hash with each `:name` as a group of digits. */
const PATTERNS = ROUTES.map((route) => {
  /** @type {string[]} */
  const names = [];
  const source = route.hash
    .split('/')
    .map((part) => {
      if (!part.startsWith(':')) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(part.slice(1));
      return '(\\d+)';
    })
    .join('/');
  return { route, names, re: new RegExp(`^${source}$`) };
});

/**
 * The route an address opens, and its parameters (as text). No hash is the dashboard; a trailing slash and anything
 * after a `?` are ignored; an address that is no route is the dashboard, with no parameters.
 * @param {string | null | undefined} hash
 * @returns {{ route: Readonly<Route>, params: Record<string, string> }}
 */
export function matchRoute(hash) {
  let path = String(hash ?? '').split('?')[0];
  if (path === '' || path === '#') path = '#/';
  if (path.length > 2 && path.endsWith('/')) path = path.slice(0, -1);
  for (const { route, names, re } of PATTERNS) {
    const m = re.exec(path);
    if (!m) continue;
    /** @type {Record<string, string>} */
    const params = {};
    names.forEach((name, i) => {
      params[name] = m[i + 1];
    });
    return { route, params };
  }
  return { route: DASHBOARD, params: {} };
}

/**
 * The route itself when `user` may open it, else the dashboard. Nobody signed in may open none.
 * @param {any} user
 * @param {Readonly<Route>} route
 * @returns {Readonly<Route>}
 */
export function guard(user, route) {
  if (!user) return DASHBOARD;
  if (route.cap === null) return route;
  return can(user, route.cap) ? route : DASHBOARD;
}

/**
 * A route's address with its parameters filled in.
 * @param {Readonly<Route>} route
 * @param {Record<string, string | number>} [params]
 */
export const hashFor = (route, params = {}) => route.hash.replace(/:([a-z]+)/gi, (_, name) => String(params[name] ?? ''));
