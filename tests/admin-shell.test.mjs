// The admin's shell (src/lib/admin/shell.mjs): the sidebar's items, the state machine that decides which screen shows
// (sign-in, the forced change of password, a route behind its guard), the notices, and the Test ribbon. Pure, no
// build needed, except the last tests, which read the built page in dist/ (run `npm run build` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError, SessionExpired } from '../src/lib/java-api.mjs';
import { PasswordChangeFailed, SignInFailed } from '../src/lib/admin/session.mjs';
import { ADMIN_BASE, ROUTES } from '../src/lib/admin/routes.mjs';
import {
  NO_ACCESS,
  PASSWORD_CHANGED,
  SESSION_ENDED,
  errorText,
  navItems,
  noticeNode,
  noticeOf,
  passwordErrors,
  reduce,
  ribbonNode,
  sidebar,
  signInErrors,
  start,
  view,
} from '../src/lib/admin/shell.mjs';

const user = (role, extra = {}) => ({ name: 'Ana Reyes', email: 'a@x.org', role, mustChangePassword: false, ...extra });
const session = (role, extra) => ({ token: 'jwt', user: user(role, extra) });

/** Every node of a VDOM tree, depth first. */
const nodes = (node) => (node === null || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(nodes)]);
const text = (node) => (node === null ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join(''));
const classes = (node) => (node.props.className ?? '').split(/\s+/).filter(Boolean);

// --- navItems -------------------------------------------------------------------------------------------------------

test('navItems: the owner sees every screen without a parameter, in the routes\' order, never #/password', () => {
  assert.deepEqual(navItems(user('owner')), [
    { hash: '#/', screen: 'dashboard', label: 'Dashboard' },
    { hash: '#/queue', screen: 'queue', label: 'Review queue' },
    { hash: '#/sightings', screen: 'sightings', label: 'All sightings' },
    { hash: '#/species', screen: 'species', label: 'Species' },
    { hash: '#/media', screen: 'media', label: 'Media' },
    { hash: '#/recycle', screen: 'recycle', label: 'Recycle bin' },
    { hash: '#/activity', screen: 'activity', label: 'Activity' },
    { hash: '#/users', screen: 'users', label: 'Users' },
    { hash: '#/settings', screen: 'settings', label: 'Settings' },
  ]);
});

test('navItems: only what the user may open', () => {
  const screens = (u) => navItems(u).map((i) => i.screen);
  assert.deepEqual(screens(user('admin')), ['dashboard', 'queue', 'sightings', 'species', 'media', 'recycle', 'activity', 'settings']);
  assert.deepEqual(screens(user('intern')), ['dashboard', 'queue', 'sightings', 'species', 'media']);
  assert.deepEqual(screens(user('volunteer')), []);
  assert.deepEqual(screens(user('intern', { permissions: ['viewData', 'viewAudit'] })), ['dashboard', 'activity']);
  assert.deepEqual(screens(null), []);
  for (const role of ['owner', 'admin', 'intern', 'volunteer']) {
    assert.ok(!screens(user(role)).includes('password'), role);
    const order = ROUTES.map((r) => r.screen);
    const got = screens(user(role)).map((s) => order.indexOf(s));
    assert.deepEqual(got, [...got].sort((a, b) => a - b), `${role}: in the routes' order`);
  }
});

// --- the state machine ----------------------------------------------------------------------------------------------

test('no session: the sign-in, with no sidebar, whatever the hash', () => {
  for (const hash of ['', '#/', '#/queue', '#/review/42', '#/password']) {
    const v = view(start(null, hash));
    assert.equal(v.screen, 'signin', hash);
    assert.deepEqual(v.nav, [], hash);
    assert.equal(v.notice, null, hash);
    assert.equal(v.hash, null, 'the address is left as it is, to open after the sign-in');
  }
});

test('signedIn opens the screen the address asked for, behind its guard', () => {
  const asked = start(null, '#/review/42');
  const v = view(reduce(asked, { type: 'signedIn', session: session('intern') }));
  assert.equal(v.screen, 'review');
  assert.deepEqual(v.params, { id: '42' });
  assert.equal(v.hash, '#/review/42');
  assert.equal(v.session.token, 'jwt');
  const users = view(reduce(start(null, '#/users'), { type: 'signedIn', session: session('intern') }));
  assert.equal(users.screen, 'dashboard');
  assert.equal(users.hash, '#/', 'the address is corrected to the dashboard');
});

test('mustChangePassword: the change-password screen, and every other route blocked, until it is changed', () => {
  const forced = session('owner', { mustChangePassword: true });
  for (const route of ROUTES) {
    const hash = route.hash.replace(':id', '42');
    const v = view(start(forced, hash));
    assert.equal(v.screen, 'password', hash);
    assert.equal(v.forced, true, hash);
    assert.deepEqual(v.nav, [], `${hash}: no sidebar items while it is forced`);
    assert.equal(v.hash, '#/password', hash);
    const moved = view(reduce(start(forced, hash), { type: 'navigate', hash: '#/users' }));
    assert.equal(moved.screen, 'password', `${hash}: navigating does not get round it`);
  }
  const changed = reduce(start(forced, '#/users'), { type: 'passwordChanged' });
  assert.equal(changed.session.user.mustChangePassword, false);
  const v = view(changed);
  assert.equal(v.screen, 'users', 'then the screen it asked for');
  assert.equal(v.forced, false);
  assert.deepEqual(v.notice, { tone: 'info', text: PASSWORD_CHANGED });
  assert.equal(v.nav.length, 9);
});

test('#/password is open to any signed-in user; after the change it goes to the dashboard', () => {
  for (const role of ['owner', 'admin', 'intern', 'volunteer']) {
    const state = start(session(role), '#/password');
    assert.equal(view(state).screen, 'password', role);
    assert.equal(view(state).forced, false, role);
    const after = view(reduce(state, { type: 'passwordChanged' }));
    assert.equal(after.hash, '#/', role);
  }
});

test('SessionExpired: back to the sign-in with "Your session ended. Sign in again.", keeping the address', () => {
  assert.equal(SESSION_ENDED, 'Your session ended. Sign in again.');
  const busy = start(session('intern'), '#/review/42');
  for (const event of [{ type: 'notify', notice: new SessionExpired(null, { path: '/admin/sightings/42' }) }, { type: 'expired' }]) {
    const state = reduce(busy, event);
    assert.equal(state.session, null);
    const v = view(state);
    assert.equal(v.screen, 'signin');
    assert.deepEqual(v.notice, { tone: 'error', text: SESSION_ENDED });
    const back = view(reduce(state, { type: 'signedIn', session: session('intern') }));
    assert.equal(back.screen, 'review', 'signing in again returns to the same screen');
    assert.deepEqual(back.params, { id: '42' });
    assert.equal(back.notice, null);
  }
});

test('signedOut: the sign-in, the address back to the dashboard\'s, no notice', () => {
  const state = reduce(start(session('owner'), '#/users'), { type: 'signedOut' });
  assert.equal(state.session, null);
  assert.equal(state.hash, '#/');
  assert.equal(view(state).screen, 'signin');
  assert.equal(view(state).notice, null);
});

test('a volunteer, who has no screen, is told so instead of an empty dashboard', () => {
  const v = view(start(session('volunteer'), '#/users'));
  assert.equal(v.screen, 'noAccess');
  assert.equal(v.hash, '#/');
  assert.deepEqual(v.nav, []);
  assert.match(NO_ACCESS, /owner/);
  assert.equal(view(start(session('volunteer'), '#/password')).screen, 'password', 'but may change their password');
});

test('the sidebar marks the current screen; a review is under the queue, a species under the species', () => {
  const current = (hash) => view(start(session('owner'), hash)).nav.filter((i) => i.current).map((i) => i.screen);
  assert.deepEqual(current('#/'), ['dashboard']);
  assert.deepEqual(current('#/users'), ['users']);
  assert.deepEqual(current('#/review/42'), ['queue']);
  assert.deepEqual(current('#/species/7'), ['species']);
  assert.deepEqual(current('#/password'), []);
});

test('navigate: a new address clears the notice; the same address (the hashchange after it) keeps it', () => {
  let state = start(session('owner'), '#/queue');
  state = reduce(state, { type: 'navigate', hash: '#/review/42' });
  state = reduce(state, { type: 'notify', notice: 'Sighting #42 approved' });
  state = reduce(state, { type: 'navigate', hash: '#/review/42' });
  assert.deepEqual(view(state).notice, { tone: 'info', text: 'Sighting #42 approved' });
  state = reduce(state, { type: 'navigate', hash: '#/queue' });
  assert.equal(view(state).notice, null);
  assert.equal(view(state).screen, 'queue');
});

test('notify and dismiss: words are information, a failure is an error in words fit to show', () => {
  let state = start(session('owner'), '#/');
  state = reduce(state, { type: 'notify', notice: { tone: 'error', text: 'Not saved' } });
  assert.deepEqual(view(state).notice, { tone: 'error', text: 'Not saved' });
  state = reduce(state, { type: 'notify', notice: new ApiError(409, { error: 'Species has linked sightings' }) });
  assert.deepEqual(view(state).notice, { tone: 'error', text: 'Species has linked sightings' });
  state = reduce(state, { type: 'dismiss' });
  assert.equal(view(state).notice, null);
  assert.equal(view(state).screen, 'dashboard', 'a notice never ends the session');
});

test('noticeOf and errorText', () => {
  assert.equal(noticeOf(null), null);
  assert.equal(noticeOf(''), null);
  assert.deepEqual(noticeOf('Saved'), { tone: 'info', text: 'Saved' });
  assert.deepEqual(noticeOf({ text: 'Odd', tone: 'loud' }), { tone: 'info', text: 'Odd' });
  assert.equal(errorText(new ApiError(0, null)), 'The server did not answer. Try again in a minute.');
  assert.equal(errorText(new ApiError(403, { error: 'You do not have permission to do that.', required: 'manageUsers' })), 'You do not have permission to do that.');
  assert.equal(errorText(new ApiError(500, '<html>')), 'The server could not do that (HTTP 500). Try again.');
  assert.equal(errorText(new SignInFailed('This account is disabled')), 'This account is disabled');
  assert.equal(errorText(new PasswordChangeFailed('Current password is incorrect.')), 'Current password is incorrect.');
  assert.equal(errorText(new TypeError('x is undefined')), 'Something went wrong. Try again.');
});

// --- the forms ------------------------------------------------------------------------------------------------------

test('signInErrors: both fields are needed; nothing is sent without them', () => {
  assert.deepEqual(signInErrors({ username: '', password: '' }), { username: 'Enter your username', password: 'Enter your password' });
  assert.deepEqual(signInErrors({ username: '  ', password: 'pw' }), { username: 'Enter your username' });
  assert.deepEqual(signInErrors({ username: 'ana', password: 'pw' }), {});
});

test('passwordErrors: the current one, ten characters or more (trimmed, as the API counts), typed twice alike', () => {
  assert.deepEqual(passwordErrors({ current: '', next: '', confirm: '' }), {
    current: 'Enter your current password',
    next: 'Use at least 10 characters',
  });
  assert.deepEqual(passwordErrors({ current: 'old', next: '  short   ', confirm: '  short   ' }), { next: 'Use at least 10 characters' });
  assert.deepEqual(passwordErrors({ current: 'old', next: 'long enough!', confirm: 'long enough' }), { confirm: 'The two new passwords are not the same' });
  assert.deepEqual(passwordErrors({ current: 'old', next: 'long enough!', confirm: 'long enough!' }), {});
});

// --- the frame's VDOM: sidebar, notice, Test ribbon -----------------------------------------------------------------

test('sidebar: the user, the permitted links with the current one marked, change password and sign out', () => {
  const signOut = () => {};
  const tree = sidebar(view(start(session('intern'), '#/review/42')), { onSignOut: signOut });
  assert.equal(tree.type, 'nav');
  assert.equal(tree.props['aria-label'], 'Sighting review');
  assert.match(text(tree), /Ana Reyes/);
  assert.match(text(tree), /intern/i);
  const links = nodes(tree).filter((n) => n.type === 'a');
  assert.deepEqual(links.map((a) => a.props.href), ['#/', '#/queue', '#/sightings', '#/species', '#/media', '#/password']);
  for (const a of links) assert.ok(classes(a).includes('wb-nav__link'), a.props.href);
  const on = links.filter((a) => a.props['aria-current'] === 'page');
  assert.deepEqual(on.map((a) => a.props.href), ['#/queue']);
  assert.ok(classes(on[0]).includes('wb-nav__link--on'));
  assert.equal(links.filter((a) => classes(a).includes('wb-nav__link--on')).length, 1);
  const button = nodes(tree).find((n) => n.type === 'button');
  assert.equal(text(button), 'Sign out');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props.onClick, signOut);
  assert.deepEqual(classes(button), ['wb-btn', 'wb-btn--ghost']);
});

test('sidebar while the password must change: no links but sign out', () => {
  const tree = sidebar(view(start(session('owner', { mustChangePassword: true }), '#/')), { onSignOut: () => {} });
  const links = nodes(tree).filter((n) => n.type === 'a');
  assert.deepEqual(links, []);
  assert.ok(nodes(tree).some((n) => n.type === 'button'));
});

test('noticeNode: an error is an alert with the error notice\'s edge; information is a status; both dismiss', () => {
  const dismiss = () => {};
  assert.equal(noticeNode(null, { onDismiss: dismiss }), null);
  const error = noticeNode({ tone: 'error', text: SESSION_ENDED }, { onDismiss: dismiss });
  assert.equal(error.props.role, 'alert');
  assert.ok(classes(error).includes('wb-notice') && classes(error).includes('wb-notice--error'));
  assert.match(text(error), /Your session ended\. Sign in again\./);
  const info = noticeNode({ tone: 'info', text: 'Saved' }, { onDismiss: dismiss });
  assert.equal(info.props.role, 'status');
  assert.ok(!classes(info).includes('wb-notice--error'));
  for (const node of [error, info]) {
    const button = nodes(node).find((n) => n.type === 'button');
    assert.equal(button.props.onClick, dismiss);
    assert.equal(button.props.type, 'button');
    assert.equal(text(button), 'Dismiss');
  }
});

test('ribbonNode: the Test ribbon on every build that is not production\'s, as the sighting form labels its sightings', () => {
  assert.equal(ribbonNode('production'), null);
  for (const env of ['staging', undefined, '']) {
    const node = ribbonNode(env);
    assert.ok(node, String(env));
    assert.ok(classes(node).includes('wb-notice'));
    assert.match(text(node), /^Test site\./);
    assert.match(text(node), /live/);
  }
});

// --- the built page -------------------------------------------------------------------------------------------------

test('dist: /admin/ is the island alone on a noindex page titled "Sighting review", with no section nav', () => {
  const html = readFileSync(`dist${ADMIN_BASE}index.html`, 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.match(html, /<title>Sighting review · Wahoo Bay<\/title>/);
  assert.match(html, /<h1>Sighting review<\/h1>/);
  assert.match(html, /<astro-island\b[^>]*\bcomponent-url="[^"]*AdminApp[^"]*"[^>]*\bclient="only"/);
  assert.doesNotMatch(html, /wb-subnav/, 'no section nav');
  assert.doesNotMatch(html, /review-/, 'no old review address');
});

test('dist: robots.txt keeps crawlers out of /admin/ and still allows the rest', () => {
  const robots = readFileSync('dist/robots.txt', 'utf8');
  assert.match(robots, new RegExp(`^Disallow: ${ADMIN_BASE}$`, 'm'));
  assert.match(robots, /^Allow: \/$/m);
});

test('dist: /sign-in/ links the sighting review at /admin/', () => {
  const html = readFileSync('dist/sign-in/index.html', 'utf8');
  assert.match(html, new RegExp(`<a\\b[^>]*\\bhref="${ADMIN_BASE}"`));
});
