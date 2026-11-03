// The sighting review's shell: what the island (src/islands/AdminApp.tsx) decides before it draws anything. The state
// is { session, hash, notice }; `reduce` moves it on an event (signed in, signed out, the session expired, the address
// changed, a notice, the password changed) and `view` says what that state shows: the sign-in, the change of password
// (forced while the account must change it), or a route behind its guard, with the sidebar's items and the notice.
// The frame's markup (the sidebar, a notice, the Test ribbon) is a small VDOM (src/lib/vdom.mjs) the island hands to
// React. A plain module, so the tests read it without a build (tests/admin-shell.test.mjs).
import { ApiError, SessionExpired } from '../java-api.mjs';
import { can } from './permissions.mjs';
import { DASHBOARD, PASSWORD, ROUTES, guard, hashFor, matchRoute } from './routes.mjs';
import { h } from '../vdom.mjs';

export const SESSION_ENDED = 'Your session ended. Sign in again.';
export const PASSWORD_CHANGED = 'Your password is changed.';
export const NO_ACCESS = 'Your account has no review screens yet. Ask an owner to give it the permissions it needs.';

/** The sidebar's words for the screens it lists, in no order of their own (the routes' order is the sidebar's). */
const LABELS = Object.freeze({
  dashboard: 'Dashboard',
  queue: 'Review queue',
  sightings: 'All sightings',
  species: 'Species',
  media: 'Media',
  recycle: 'Recycle bin',
  activity: 'Activity',
  users: 'Users',
  settings: 'Settings',
});

/** A screen that has no sidebar item of its own shows as part of this one. */
const UNDER = Object.freeze({ review: 'queue', speciesDetail: 'species' });

/**
 * @typedef {{ token: string, user: any }} Session
 * @typedef {{ tone: 'info' | 'error', text: string }} Notice
 * @typedef {{ session: Session | null, hash: string, notice: Notice | null }} State
 * @typedef {{ hash: string, screen: string, label: string }} NavItem
 */

/**
 * The sidebar's items: each route without a parameter that `user` may open, in the routes' order. Never #/password,
 * which the sidebar offers apart from the screens.
 * @param {any} user
 * @returns {NavItem[]}
 */
export const navItems = (user) =>
  ROUTES.filter((r) => r.screen in LABELS && r.cap !== null && can(user, r.cap)).map((r) => ({
    hash: r.hash,
    screen: r.screen,
    label: LABELS[/** @type {keyof typeof LABELS} */ (r.screen)],
  }));

/**
 * What to show a person for an error: the API's own words when it gave some (`{error}`), a failed sign-in's or change
 * of password's message, else a sentence that says what to do.
 * @param {unknown} error
 */
export function errorText(error) {
  if (error instanceof ApiError) {
    const said = error.body && typeof error.body === 'object' && typeof error.body.error === 'string' ? error.body.error.trim() : '';
    if (said) return said;
    if (error.status === 0) return 'The server did not answer. Try again in a minute.';
    return `The server could not do that (HTTP ${error.status}). Try again.`;
  }
  if (error instanceof Error && (error.name === 'SignInFailed' || error.name === 'PasswordChangeFailed') && error.message) return error.message;
  return 'Something went wrong. Try again.';
}

/**
 * A notice from what a screen hands `notify`: words (information), `{ tone, text }`, or an error (its words, as
 * errorText says them). Nothing is no notice.
 * @param {unknown} input
 * @returns {Notice | null}
 */
export function noticeOf(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'string') return { tone: 'info', text: input };
  if (input instanceof Error) return { tone: 'error', text: errorText(input) };
  if (typeof input === 'object' && 'text' in input && typeof input.text === 'string' && input.text) {
    return { tone: 'tone' in input && input.tone === 'error' ? 'error' : 'info', text: input.text };
  }
  return null;
}

/** Equal addresses are one address: "" and "#" are "#/". @param {string | null | undefined} hash */
const addressOf = (hash) => (!hash || hash === '#' ? '#/' : hash);

/**
 * The state the page starts in: the stored session (or none) at the page's address.
 * @param {Session | null | undefined} session
 * @param {string | null | undefined} hash
 * @returns {State}
 */
export const start = (session, hash) => ({ session: session ?? null, hash: addressOf(hash), notice: null });

/**
 * @typedef {{ type: 'signedIn', session: Session }
 *   | { type: 'signedOut' }
 *   | { type: 'expired' }
 *   | { type: 'navigate', hash: string }
 *   | { type: 'notify', notice: unknown }
 *   | { type: 'dismiss' }
 *   | { type: 'passwordChanged' }} ShellEvent
 */

/**
 * The next state. The address is kept across a sign-in, so the screen asked for (a bookmark, or the one the session
 * expired on) opens after it. A notice that is a SessionExpired is the session's end. A new address clears the notice;
 * the same address again (the hashchange that follows the island's own navigate) changes nothing.
 * @param {State} state
 * @param {ShellEvent} event
 * @returns {State}
 */
export function reduce(state, event) {
  switch (event.type) {
    case 'signedIn':
      return { session: event.session, hash: state.hash, notice: null };
    case 'signedOut':
      return { session: null, hash: '#/', notice: null };
    case 'expired':
      return { session: null, hash: state.hash, notice: { tone: 'error', text: SESSION_ENDED } };
    case 'navigate': {
      const hash = addressOf(event.hash);
      return hash === state.hash ? state : { ...state, hash, notice: null };
    }
    case 'notify':
      if (event.notice instanceof SessionExpired) return reduce(state, { type: 'expired' });
      return { ...state, notice: noticeOf(event.notice) };
    case 'dismiss':
      return state.notice ? { ...state, notice: null } : state;
    case 'passwordChanged': {
      if (!state.session) return state;
      const user = { ...state.session.user, mustChangePassword: false };
      const hash = matchRoute(state.hash).route === PASSWORD ? '#/' : state.hash;
      return { session: { ...state.session, user }, hash, notice: { tone: 'info', text: PASSWORD_CHANGED } };
    }
    default:
      return state;
  }
}

/**
 * @typedef {NavItem & { current: boolean }} NavLink
 * @typedef {{
 *   screen: string,
 *   route: import('./routes.mjs').Route | null,
 *   params: Record<string, string>,
 *   hash: string | null,
 *   nav: NavLink[],
 *   forced: boolean,
 *   notice: Notice | null,
 *   session: Session | null,
 *   user: any,
 * }} View
 */

/**
 * What the state shows. `screen` is "signin" (nobody signed in), "password" (forced while the account must change
 * it, every other route blocked), "noAccess" (an account the guard sends to a dashboard it may not open either), or
 * the route's screen. `hash` is the address of what shows, which the island puts in the address bar when the guard
 * changed it; null at the sign-in, which leaves the address to open after it.
 * @param {State} state
 * @returns {View}
 */
export function view(state) {
  const { session, notice } = state;
  const base = { notice, session, user: session?.user ?? null, forced: false, nav: [], params: {} };
  if (!session) return { ...base, screen: 'signin', route: null, hash: null };
  const user = session.user;
  if (user?.mustChangePassword) return { ...base, screen: 'password', route: PASSWORD, hash: PASSWORD.hash, forced: true };
  const asked = matchRoute(state.hash);
  const route = guard(user, asked.route);
  const params = route === asked.route ? asked.params : {};
  const section = UNDER[/** @type {keyof typeof UNDER} */ (route.screen)] ?? route.screen;
  const nav = navItems(user).map((item) => ({ ...item, current: item.screen === section }));
  const hash = hashFor(route, params);
  if (route === DASHBOARD && !can(user, DASHBOARD.cap ?? '')) return { ...base, screen: 'noAccess', route, hash, nav };
  return { ...base, screen: route.screen, route, params, hash, nav };
}

/**
 * Whether the build is a test (any build that is not production's; PUBLIC_SITE_ENV unset is staging), as the sighting
 * form labels its sightings (src/lib/sighting.mjs).
 * @param {string | null | undefined} env
 */
export const isTest = (env) => (env || 'staging') !== 'production';

// --- the forms ------------------------------------------------------------------------------------------------------

/** The API's shortest new password (AuthController, after trimming). */
const MIN_PASSWORD = 10;

/**
 * What the sign-in form needs before it sends: both fields.
 * @param {{ username: string, password: string }} fields
 * @returns {{ username?: string, password?: string }}
 */
export function signInErrors({ username, password }) {
  /** @type {{ username?: string, password?: string }} */
  const errors = {};
  if (!String(username ?? '').trim()) errors.username = 'Enter your username';
  if (!String(password ?? '')) errors.password = 'Enter your password';
  return errors;
}

/**
 * What the change-password form needs before it sends: the current password, a new one of ten characters or more
 * once trimmed (as the API counts), typed the same way twice.
 * @param {{ current: string, next: string, confirm: string }} fields
 * @returns {{ current?: string, next?: string, confirm?: string }}
 */
export function passwordErrors({ current, next, confirm }) {
  /** @type {{ current?: string, next?: string, confirm?: string }} */
  const errors = {};
  if (!String(current ?? '')) errors.current = 'Enter your current password';
  if (String(next ?? '').trim().length < MIN_PASSWORD) errors.next = `Use at least ${MIN_PASSWORD} characters`;
  else if (next !== confirm) errors.confirm = 'The two new passwords are not the same';
  return errors;
}

// --- the frame's VDOM -----------------------------------------------------------------------------------------------

/**
 * The sidebar: who is signed in, the screens they may open (the current one marked as the site's nav marks it), and,
 * apart from them, change password and sign out. While the password must change, only sign out.
 * @param {View} v
 * @param {{ onSignOut: () => void }} actions
 */
export const sidebar = (v, { onSignOut }) =>
  h(
    'nav',
    { className: 'site-admin__nav', 'aria-label': 'Sighting review' },
    v.user && h('p', { className: 'site-admin__who' }, 'Signed in as ', h('strong', null, v.user.name || v.user.email || 'you'), v.user.role ? ` (${v.user.role})` : ''),
    v.nav.length > 0 &&
      h(
        'ul',
        { className: 'wb-subnav site-admin__menu' },
        v.nav.map((item) =>
          h(
            'li',
            { key: item.hash },
            h(
              'a',
              {
                className: item.current ? 'wb-nav__link wb-nav__link--on' : 'wb-nav__link',
                href: item.hash,
                'aria-current': item.current ? 'page' : undefined,
              },
              item.label,
            ),
          ),
        ),
      ),
    h(
      'ul',
      { className: 'wb-subnav site-admin__menu site-admin__account' },
      !v.forced &&
        h(
          'li',
          { key: 'password' },
          h(
            'a',
            {
              className: v.screen === 'password' ? 'wb-nav__link wb-nav__link--on' : 'wb-nav__link',
              href: PASSWORD.hash,
              'aria-current': v.screen === 'password' ? 'page' : undefined,
            },
            'Change password',
          ),
        ),
      h('li', { key: 'signout' }, h('button', { className: 'wb-btn wb-btn--ghost', type: 'button', onClick: onSignOut }, 'Sign out')),
    ),
  );

/**
 * A notice above the screen: an error is an alert in the error notice's edge, information a status; either can be
 * dismissed.
 * @param {Notice | null} notice
 * @param {{ onDismiss: () => void }} actions
 */
export const noticeNode = (notice, { onDismiss }) =>
  notice &&
  h(
    'div',
    {
      className: notice.tone === 'error' ? 'wb-notice wb-notice--error site-admin__notice' : 'wb-notice site-admin__notice',
      role: notice.tone === 'error' ? 'alert' : 'status',
    },
    h('p', null, notice.text),
    h('button', { className: 'wb-btn wb-btn--ghost', type: 'button', onClick: onDismiss }, 'Dismiss'),
  );

/**
 * The Test ribbon, on every build that is not production's: staging's admin signs in to the live API (plan 9,
 * Ruling 7), so what it changes is real.
 * @param {string | null | undefined} env
 */
export const ribbonNode = (env) =>
  isTest(env)
    ? h('p', { className: 'wb-notice site-admin__ribbon' }, h('strong', null, 'Test site.'), ' Sign-in and every change here use the live sighting data.')
    : null;
