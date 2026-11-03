// The admin's capability matrix: a copy of the server's Roles.java (wahoobay/api, common/auth). Pure, no build needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, CAPABILITIES, ROLE_CAPS, can } from '../src/lib/admin/permissions.mjs';

test('the server\'s four roles and twelve capability keys, in its order', () => {
  assert.deepEqual([...ROLES], ['owner', 'admin', 'intern', 'volunteer']);
  assert.deepEqual([...CAPABILITIES], [
    'viewData', 'reviewSightings', 'editSpecies', 'editMedia', 'hideMedia', 'manageCameras',
    'manageSchools', 'recycle', 'inviteTeam', 'manageUsers', 'viewAudit', 'settings',
  ]);
  assert.ok(Object.isFrozen(ROLES) && Object.isFrozen(CAPABILITIES) && Object.isFrozen(ROLE_CAPS));
});

test('every route-guard name the admin uses is one of the server\'s keys', () => {
  for (const name of ['viewData', 'reviewSightings', 'editSpecies', 'editMedia', 'recycle', 'viewAudit', 'manageUsers', 'settings']) {
    assert.ok(CAPABILITIES.includes(name), name);
  }
});

const has = (role) => CAPABILITIES.filter((c) => can({ role }, c));

test('owner has all twelve', () => assert.deepEqual(has('owner'), [...CAPABILITIES]));
test('admin: everything except manageSchools and manageUsers', () => {
  assert.deepEqual(has('admin'), ['viewData', 'reviewSightings', 'editSpecies', 'editMedia', 'hideMedia', 'manageCameras', 'recycle', 'inviteTeam', 'viewAudit', 'settings']);
});
test('intern: review and edit only', () => assert.deepEqual(has('intern'), ['viewData', 'reviewSightings', 'editSpecies', 'editMedia']));
test('volunteer: nothing', () => assert.deepEqual(has('volunteer'), []));

test('a revoke removes a default; a grant adds one', () => {
  assert.equal(can({ role: 'intern', revokes: ['editMedia'] }, 'editMedia'), false);
  assert.equal(can({ role: 'intern', revokes: ['editMedia'] }, 'editSpecies'), true);
  assert.equal(can({ role: 'volunteer', grants: ['reviewSightings'] }, 'reviewSightings'), true);
  assert.equal(can({ role: 'volunteer', grants: ['reviewSightings'] }, 'recycle'), false);
});

test('a revoke on the owner is ignored', () => {
  assert.equal(can({ role: 'owner', revokes: ['manageUsers', 'settings'] }, 'manageUsers'), true);
});

test('the sign-in user carries the server\'s effective list as `permissions`, which is used', () => {
  const user = { role: 'intern', permissions: ['viewData', 'recycle'] };
  assert.equal(can(user, 'recycle'), true);
  assert.equal(can(user, 'reviewSightings'), false);
});

test('unknown role, no user, or unknown capability: false; role names are case-insensitive', () => {
  assert.equal(can({ role: 'wizard' }, 'viewData'), false);
  assert.equal(can(null, 'viewData'), false);
  assert.equal(can({ role: 'owner' }, 'nonsense'), false);
  assert.equal(can({ role: 'Admin' }, 'recycle'), true);
});
