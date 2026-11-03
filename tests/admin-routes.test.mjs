// The admin's hash router and its capability guard (src/lib/admin/routes.mjs). Pure, no build needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_BASE, DASHBOARD, PASSWORD, ROUTES, guard, hashFor, matchRoute } from '../src/lib/admin/routes.mjs';
import { CAPABILITIES } from '../src/lib/admin/permissions.mjs';

const role = (name) => ({ name: 'Ana', role: name, mustChangePassword: false });

test('the admin is at /admin/', () => assert.equal(ADMIN_BASE, '/admin/'));

test('the twelve routes, in order, each with the capability that opens it', () => {
  assert.deepEqual(ROUTES.map(({ hash, screen, cap }) => ({ hash, screen, cap })), [
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
  ]);
  assert.equal(DASHBOARD, ROUTES[0]);
  assert.equal(PASSWORD.screen, 'password');
  assert.ok(Object.isFrozen(ROUTES) && ROUTES.every(Object.isFrozen));
});

test('every capability a route asks for is one of the server\'s keys; only #/password asks for none', () => {
  for (const route of ROUTES) {
    if (route.screen === 'password') assert.equal(route.cap, null);
    else assert.ok(CAPABILITIES.includes(route.cap), `${route.hash}: ${route.cap}`);
  }
});

test('matchRoute finds every row; a parameter is its segment, as text', () => {
  const cases = [
    ['#/', 'dashboard', {}],
    ['#/queue', 'queue', {}],
    ['#/sightings', 'sightings', {}],
    ['#/review/42', 'review', { id: '42' }],
    ['#/species', 'species', {}],
    ['#/species/7', 'speciesDetail', { id: '7' }],
    ['#/media', 'media', {}],
    ['#/recycle', 'recycle', {}],
    ['#/activity', 'activity', {}],
    ['#/users', 'users', {}],
    ['#/settings', 'settings', {}],
    ['#/password', 'password', {}],
  ];
  assert.equal(cases.length, ROUTES.length);
  for (const [hash, screen, params] of cases) {
    const { route, params: got } = matchRoute(hash);
    assert.equal(route.screen, screen, hash);
    assert.deepEqual(got, params, hash);
  }
});

test('matchRoute: no hash is the dashboard; a trailing slash and a query are ignored', () => {
  for (const hash of ['', '#', '#/', undefined, null]) assert.equal(matchRoute(hash).route, DASHBOARD, String(hash));
  assert.equal(matchRoute('#/queue/').route.screen, 'queue');
  assert.equal(matchRoute('#/sightings?status=pending').route.screen, 'sightings');
  assert.deepEqual(matchRoute('#/review/42/').params, { id: '42' });
});

test('matchRoute: an unknown hash is the dashboard, with no parameters', () => {
  for (const hash of ['#/nope', '#/queue/extra', '#/review', '#/review/', '#/review/42/more', '#/admin', 'queue', '#queue', '#/USERS']) {
    assert.deepEqual(matchRoute(hash), { route: DASHBOARD, params: {} }, hash);
  }
});

test('matchRoute: an id is digits only, so no path can be smuggled into an API call', () => {
  for (const hash of ['#/review/abc', '#/review/4%2F..%2Fusers', '#/review/..', '#/species/-1', '#/review/4.2', '#/review/%34%32']) {
    assert.equal(matchRoute(hash).route, DASHBOARD, hash);
  }
});

test('guard: a volunteer at #/users goes to the dashboard', () => {
  assert.equal(guard(role('volunteer'), matchRoute('#/users').route), DASHBOARD);
});

test('guard: each role reaches what its capabilities open, and is sent to the dashboard otherwise', () => {
  const reach = (name) => ROUTES.filter((r) => guard(role(name), r) === r).map((r) => r.screen);
  assert.deepEqual(reach('owner'), ROUTES.map((r) => r.screen));
  assert.deepEqual(reach('admin'), ['dashboard', 'queue', 'sightings', 'review', 'species', 'speciesDetail', 'media', 'recycle', 'activity', 'settings', 'password']);
  assert.deepEqual(reach('intern'), ['dashboard', 'queue', 'sightings', 'review', 'species', 'speciesDetail', 'media', 'password']);
  // The dashboard is where the guard sends everyone, so it "reaches" it; the shell tells a user who may not open it
  // either that the account has no screens (tests/admin-shell.test.mjs).
  assert.deepEqual(reach('volunteer'), ['dashboard', 'password']);
  for (const r of ROUTES) if (guard(role('intern'), r) !== r) assert.equal(guard(role('intern'), r), DASHBOARD, r.hash);
});

test('guard: the server\'s effective list decides when the user carries one', () => {
  const ana = { role: 'volunteer', permissions: ['reviewSightings'] };
  assert.equal(guard(ana, matchRoute('#/queue').route).screen, 'queue');
  assert.equal(guard(ana, matchRoute('#/species').route), DASHBOARD);
});

test('guard: nobody signed in reaches nothing, not even #/password', () => {
  for (const r of ROUTES) assert.equal(guard(null, r), DASHBOARD, r.hash);
});

test('hashFor: a route\'s address with its parameters', () => {
  assert.equal(hashFor(matchRoute('#/review/42').route, { id: '42' }), '#/review/42');
  assert.equal(hashFor(DASHBOARD), '#/');
  assert.equal(hashFor(matchRoute('#/users').route, {}), '#/users');
});
