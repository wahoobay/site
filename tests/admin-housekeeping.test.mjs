// The sighting review's housekeeping screens (src/lib/admin/housekeeping.mjs, drawn by
// src/islands/admin/{Recycle,Activity,Users,Settings,Dashboard}.tsx): the requests they send (the Java API's
// AdminRecycleController, AdminLogController, AdminUserController, AdminSettingsController, IntakeStatusController and
// AdminSightingController.summary are the authority), the rows, the payloads, which actions show, the confirms and
// the empty sentences. Pure, no build needed; the last tests read the islands' sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { API_BASE } from '../src/lib/java-api.mjs';
import { CAPABILITIES, ROLE_CAPS } from '../src/lib/admin/permissions.mjs';
import { QUEUE_EMPTY } from '../src/lib/admin/sightings.mjs';
import {
  ACTIVITY_EMPTY,
  CAPABILITY_LABELS,
  NOT_USED_HERE,
  capabilityLabel,
  INTAKE_CONFIRM,
  RECYCLE_CONFIRM,
  RECYCLE_EMPTY,
  ROLE_LABELS,
  UNDO_CONFIRM,
  USERS_EMPTY,
  USER_CONFIRM,
  activityActions,
  activityTable,
  camerasText,
  dashboardFigures,
  dashboardQueueRequest,
  dashboardView,
  disableRequest,
  editorFor,
  enableRequest,
  figuresNode,
  intakeNode,
  intakeOutcome,
  intakePayload,
  intakeRequest,
  intakeStatusRequest,
  intakeView,
  inviteErrors,
  inviteOutcome,
  invitePayload,
  inviteRequest,
  logRequest,
  logRow,
  purgePayload,
  purgeRequest,
  recycleActions,
  recycleOutcome,
  recycleRequest,
  recycleRow,
  recycleTable,
  recycleToolbar,
  restorePayload,
  restoreRequest,
  settingsActions,
  summaryRequest,
  undoOutcome,
  undoRequest,
  userActions,
  userPatchPayload,
  userPatchRequest,
  userRow,
  usersRequest,
  usersTable,
  usersView,
  withCapability,
  withRole,
} from '../src/lib/admin/housekeeping.mjs';

const nodes = (node) => (node === null || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(nodes)]);
const text = (node) => (node === null ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join(''));
const classes = (node) => (node.props.className ?? '').split(/\s+/).filter(Boolean);
const find = (tree, pred) => nodes(tree).filter(pred);
const source = (file) => readFileSync(file, 'utf8');

const UPLOADS = API_BASE.replace(/\/v1$/, '');
const TOKEN = 'tok.en';

const user = (role, extra = {}) => ({ name: role, email: `${role}@example.org`, role, permissions: [...ROLE_CAPS[role]], mustChangePassword: false, ...extra });
const OWNER = user('owner', { name: 'Katie', email: 'Katie@example.org' });
const ADMIN = user('admin');
const INTERN = user('intern');
const VOLUNTEER = user('volunteer');

/** A row of GET /admin/recycle (AdminRecycleService.list). */
const BINNED = Object.freeze({
  sighting_id: 927,
  species_id: 3,
  camera_id: 1,
  media_id: 31,
  sighting_datetime: '2026-10-31T14:22',
  verification_status: 'rejected',
  volunteer_name: 'Test visitor',
  notes: '[staging test] a sighting',
  recycled_at: '2026-11-02T13:05:00',
  common_name: 'Sergeant major',
  scientific_name: 'Abudefduf saxatilis',
  camera_name: 'Reef camera',
  storage_type: 'upload',
  storage_key: 'p.jpg',
  media_url: '/uploads/p.jpg',
  days_left: 30,
});

/** A row of GET /admin/log (AuditService.list). */
const LOGGED = Object.freeze({ id: 88, ts: '2026-11-02T13:05:00', actor: 'katie@example.org', action: 'reject', summary: 'Rejected sighting #927', undone: false, undoable: true });

/** A row of GET /admin/users (AdminUserController.shape). */
const ROY = Object.freeze({
  id: 1002,
  name: 'Roy Wickham',
  email: 'roy@example.org',
  username: 'roy',
  role: 'admin',
  roleId: 2,
  grants: [],
  revokes: ['manageCameras'],
  permissions: ROLE_CAPS.admin.filter((c) => c !== 'manageCameras'),
  active: true,
  mustChangePassword: false,
});
const KATIE = Object.freeze({ ...ROY, id: 1001, name: 'Katie H', email: 'katie@example.org', username: 'katie', role: 'owner', roleId: 1, revokes: [], permissions: [...CAPABILITIES] });
const GONE = Object.freeze({ ...ROY, id: 1003, name: 'Old intern', email: 'old@example.org', username: 'old', role: 'intern', roleId: 3, revokes: [], permissions: [...ROLE_CAPS.intern], active: false });

// --- the recycle bin ------------------------------------------------------------------------------------------------

test('the recycle bin\'s requests: GET /admin/recycle, POST …/restore {ids} and POST …/purge {ids}', () => {
  assert.deepEqual(recycleRequest(), { path: '/admin/recycle' });
  assert.deepEqual(restorePayload([927, '928', 927]), { ids: [927, 928] });
  assert.deepEqual(purgePayload([927]), { ids: [927] });
  assert.deepEqual(restoreRequest([927, 928]), { path: '/admin/recycle/restore', method: 'POST', body: { ids: [927, 928] } });
  assert.deepEqual(purgeRequest([927]), { path: '/admin/recycle/purge', method: 'POST', body: { ids: [927] } });
});

test('purge requires a non-empty selection (and so does restore)', () => {
  assert.equal(purgePayload([]), null);
  assert.equal(purgePayload(['x', null]), null, 'no id in it is nothing checked');
  assert.equal(purgeRequest([]), null);
  assert.equal(restorePayload([]), null);
  assert.equal(restoreRequest([]), null);
  assert.deepEqual(recycleActions(ADMIN, [], false), { restore: { shown: true, enabled: false }, purge: { shown: true, enabled: false } });
  assert.deepEqual(recycleActions(ADMIN, [927], false), { restore: { shown: true, enabled: true }, purge: { shown: true, enabled: true } });
  assert.deepEqual(recycleActions(ADMIN, [927], true), { restore: { shown: true, enabled: false }, purge: { shown: true, enabled: false } }, 'none while one is in flight');
  assert.deepEqual(recycleActions(INTERN, [927], false), { restore: { shown: false, enabled: false }, purge: { shown: false, enabled: false } }, 'the bin needs recycle');
});

test('RECYCLE_CONFIRM names the count and what each does', () => {
  const restore = RECYCLE_CONFIRM.restore(3);
  assert.equal(restore.title, 'Restore 3 sightings?');
  assert.equal(restore.body, 'They leave the recycle bin. A rejected one goes back to the review queue as pending; the others keep their status. An undo in the activity log puts them back in the bin, but a rejected one stays pending.');
  assert.equal(RECYCLE_CONFIRM.restore(1).body, 'It leaves the recycle bin. If it was rejected, it goes back to the review queue as pending; otherwise it keeps its status. An undo in the activity log puts it back in the bin, but if it was rejected it stays pending.');
  assert.equal(restore.confirm, 'Restore 3 sightings');
  const purge = RECYCLE_CONFIRM.purge(1);
  assert.equal(purge.title, 'Delete 1 sighting permanently?');
  assert.equal(purge.body, 'It is deleted for good, with its conditions and any photo or clip that no other sighting uses. This cannot be undone.');
  assert.equal(purge.confirm, 'Delete 1 sighting');
  assert.equal(RECYCLE_CONFIRM.purge(2).body, 'They are deleted for good, with their conditions and any photo or clip that no other sighting uses. This cannot be undone.');
});

test('recycleRow and recycleTable: a check box per row, when it was recycled, no link into a review', () => {
  const row = recycleRow(BINNED, TOKEN);
  assert.equal(row.id, 927);
  assert.equal(row.species, 'Sergeant major');
  assert.equal(row.status, 'rejected');
  assert.equal(row.when, 'Oct 31, 2026, 10:22 AM');
  assert.equal(row.recycled, 'Nov 2, 2026, 8:05 AM');
  assert.equal(row.submitter, 'Test visitor');
  assert.deepEqual(row.thumb, { src: `${UPLOADS}/uploads/p.jpg`, video: false });
  const calls = [];
  const table = recycleTable([row, recycleRow({ ...BINNED, sighting_id: 928, media_id: null, storage_type: null, storage_key: null, media_url: null, verification_status: 'unverified' })], {
    selected: [927],
    enabled: true,
    onSelect: (id, on) => calls.push([id, on]),
  });
  assert.deepEqual(classes(table), ['wb-table-wrap']);
  const [t] = find(table, (n) => n.type === 'table');
  assert.equal(t.props['data-stack'], '');
  assert.deepEqual(find(find(t, (n) => n.type === 'thead')[0], (n) => n.type === 'th').map(text), ['Select', 'Media', 'Species', 'Status', 'Seen', 'Recycled', 'Submitted by', 'ID']);
  const boxes = find(t, (n) => n.type === 'input' && n.props.type === 'checkbox');
  assert.deepEqual(boxes.map((b) => b.props.checked), [true, false]);
  boxes[1].props.onChange({ target: { checked: true } });
  assert.deepEqual(calls, [[928, true]]);
  assert.equal(find(t, (n) => n.type === 'a').length, 0, 'a recycled sighting opens no review (its actions would 404)');
  const chips = find(t, (n) => classes(n).includes('wb-status'));
  assert.deepEqual(chips.map((c) => c.props['data-status']), ['rejected', 'pending']);
  for (const img of find(t, (n) => n.type === 'img')) assert.equal(img.props.referrerPolicy, 'no-referrer');
  for (const c of find(find(t, (n) => n.type === 'tbody')[0], (n) => n.type === 'td' || n.type === 'th')) assert.ok(c.props['data-label']);
  assert.ok(find(recycleTable([row], { selected: [], enabled: false, onSelect() {} }), (n) => n.type === 'input').every((n) => n.props.disabled === true));
  assert.equal(RECYCLE_EMPTY, 'The recycle bin is empty.');
});

test('recycleOutcome: what the server says it did', () => {
  assert.equal(recycleOutcome('restore', { restored: 2 }, 2), 'Restored 2 sightings.');
  assert.equal(recycleOutcome('purge', { purged: 1 }, 1), 'Deleted 1 sighting permanently.');
  assert.equal(recycleOutcome('purge', { purged: 1 }, 3), 'Deleted 1 sighting permanently. The other 2 were no longer in the recycle bin.');
  assert.equal(recycleOutcome('restore', { restored: 0 }, 1), 'Restored 0 sightings. The other 1 was no longer in the recycle bin.');
});

// --- the activity log -----------------------------------------------------------------------------------------------

test('the activity log: GET /admin/log, POST /admin/log/{id}/undo; undo only where the log says it can be', () => {
  assert.deepEqual(logRequest(), { path: '/admin/log' });
  assert.deepEqual(undoRequest(88), { path: '/admin/log/88/undo', method: 'POST' });
  assert.equal(undoRequest('88/../x').path, '/admin/log/88%2F..%2Fx/undo');
  const row = logRow(LOGGED);
  assert.deepEqual(row, { id: 88, when: 'Nov 2, 2026, 8:05 AM', actor: 'katie@example.org', action: 'reject', summary: 'Rejected sighting #927', undone: false, undoable: true });
  assert.deepEqual(activityActions(ADMIN, row, false).undo, { shown: true, enabled: true });
  assert.deepEqual(activityActions(ADMIN, row, true).undo, { shown: true, enabled: false });
  assert.equal(activityActions(ADMIN, logRow({ ...LOGGED, undoable: false }), false).undo.shown, false);
  assert.equal(activityActions(ADMIN, logRow({ ...LOGGED, undone: true }), false).undo.shown, false);
  assert.equal(activityActions(INTERN, row, false).undo.shown, false, 'undo needs viewAudit');
  assert.equal(logRow({ id: 1, ts: null, actor: null, action: 'purge', summary: null, undone: false, undoable: false }).summary, 'purge');
});

test('UNDO_CONFIRM says which change it reverses; undoOutcome; the empty sentence', () => {
  const confirm = UNDO_CONFIRM(logRow(LOGGED));
  assert.equal(confirm.title, 'Undo this change?');
  assert.equal(confirm.body, '“Rejected sighting #927” (Nov 2, 2026, 8:05 AM, by katie@example.org) is reversed. The undo is logged too, and cannot itself be undone.');
  assert.equal(confirm.confirm, 'Undo');
  assert.equal(undoOutcome(logRow(LOGGED)), 'Undone: Rejected sighting #927.');
  assert.equal(ACTIVITY_EMPTY, 'No changes in the last 14 days.');
});

test('activityTable: who did what when, and Undo, Undone or no undo per row', () => {
  const calls = [];
  const rows = [logRow(LOGGED), logRow({ ...LOGGED, id: 87, undone: true, undoable: false }), logRow({ ...LOGGED, id: 86, action: 'purge', summary: 'Permanently deleted 1 sighting(s)', undoable: false })];
  const table = activityTable(rows, { actionsFor: (r) => activityActions(ADMIN, r, false), onUndo: (r) => calls.push(r.id) });
  const [t] = find(table, (n) => n.type === 'table');
  assert.equal(t.props['data-stack'], '');
  assert.deepEqual(find(find(t, (n) => n.type === 'thead')[0], (n) => n.type === 'th').map(text), ['When', 'By', 'Change', 'Undo']);
  const buttons = find(t, (n) => n.type === 'button');
  assert.equal(buttons.length, 1);
  assert.equal(text(buttons[0]), 'Undo “Rejected sighting #927”');
  buttons[0].props.onClick();
  assert.deepEqual(calls, [88]);
  const undoCells = find(t, (n) => n.type === 'td' && n.props['data-label'] === 'Undo').map(text);
  assert.deepEqual(undoCells.slice(1), ['Undone', 'Cannot be undone']);
});

// --- users ----------------------------------------------------------------------------------------------------------

test('the users\' requests: GET /admin/users, PATCH …/{id}, POST …/invite, DELETE …/{id}, POST …/{id}/enable', () => {
  assert.deepEqual(usersRequest(), { path: '/admin/users' });
  assert.deepEqual(userPatchRequest(1002, { role: 'intern' }), { path: '/admin/users/1002', method: 'PATCH', body: { role: 'intern' } });
  assert.deepEqual(disableRequest(1002), { path: '/admin/users/1002', method: 'DELETE' });
  assert.deepEqual(enableRequest(1003), { path: '/admin/users/1003/enable', method: 'POST' });
  assert.deepEqual(inviteRequest({ name: ' Ana Reyes ', email: ' ana@example.org ', role: 'intern' }), { path: '/admin/users/invite', method: 'POST', body: { name: 'Ana Reyes', email: 'ana@example.org', role: 'intern' } });
});

test('invitePayload: { name, email, role } with one of the four role names, and never a password', () => {
  assert.deepEqual(Object.keys(ROLE_LABELS), ['owner', 'admin', 'intern', 'volunteer']);
  assert.deepEqual(Object.values(ROLE_LABELS), ['Owner', 'Admin', 'Intern', 'Volunteer']);
  for (const role of ['owner', 'admin', 'intern', 'volunteer']) {
    assert.deepEqual(invitePayload({ name: 'A', email: 'a@example.org', role }), { name: 'A', email: 'a@example.org', role });
  }
  assert.equal(invitePayload({ name: 'A', email: 'a@example.org', role: 'superuser' }), null, 'the server would make an unknown role a volunteer silently');
  assert.equal(invitePayload({ name: 'A', email: '', role: 'intern' }), null);
  assert.equal(inviteRequest({ name: 'A', email: 'nope', role: 'intern' }), null);
  assert.deepEqual(inviteErrors({ name: '', email: '', role: '' }), { email: 'Enter their email address', role: 'Choose a role' });
  assert.deepEqual(inviteErrors({ name: '', email: 'ana', role: 'intern' }), { email: 'Enter an email address, like name@example.org' });
  assert.deepEqual(inviteErrors({ name: '', email: 'ana@example.org', role: 'volunteer' }), {}, 'a name is optional');
  assert.ok(!('password' in invitePayload({ name: 'A', email: 'a@example.org', role: 'intern', password: 'x' })));
});

test('inviteOutcome: the temporary password, shown once, and how they sign in', () => {
  const answer = { ...ROY, id: 1004, name: 'Ana Reyes', email: 'ana@example.org', username: 'ana', role: 'intern', mustChangePassword: true, temporaryPassword: 'Tmp9aBcDeFgH2k' };
  const outcome = inviteOutcome(answer);
  assert.equal(outcome.password, 'Tmp9aBcDeFgH2k');
  assert.equal(outcome.name, 'Ana Reyes');
  assert.equal(outcome.text, 'Ana Reyes is added as an intern. They sign in with ana@example.org (or the username ana) and this temporary password, then choose their own. It is shown only now, so pass it on before you leave this screen.');
});

test('the users screen hides invite and delete from anyone without manageUsers', () => {
  assert.deepEqual(usersView(OWNER), { invite: true });
  assert.deepEqual(usersView(ADMIN), { invite: false }, 'an admin holds inviteTeam, but the server checks manageUsers on /admin/users');
  const roy = userRow(ROY, OWNER);
  assert.deepEqual(userActions(OWNER, roy, false), { edit: { shown: true, enabled: true }, disable: { shown: true, enabled: true }, enable: { shown: false, enabled: false } });
  const hidden = userActions(ADMIN, roy, false);
  for (const k of ['edit', 'disable', 'enable']) assert.equal(hidden[k].shown, false, k);
  const granted = user('admin', { permissions: [...ROLE_CAPS.admin, 'manageUsers'] });
  assert.equal(usersView(granted).invite, true, 'a granted manageUsers');
  assert.equal(userActions(OWNER, userRow(KATIE, OWNER), false).disable.shown, false, 'nobody disables their own account');
  assert.deepEqual(userActions(OWNER, userRow(GONE, OWNER), false).enable, { shown: true, enabled: true });
  assert.equal(userActions(OWNER, userRow(GONE, OWNER), false).disable.shown, false);
  assert.equal(userActions(OWNER, roy, true).disable.enabled, false);
});

test('userRow and usersTable: name, email, role and its changes, status; actions as the user may', () => {
  const roy = userRow(ROY, OWNER);
  assert.equal(roy.roleLabel, 'Admin');
  assert.equal(roy.statusLabel, 'Active');
  assert.equal(roy.self, false);
  assert.equal(roy.changes, 'Not: Manage cameras');
  assert.equal(userRow(KATIE, OWNER).self, true, 'matched by email, any case');
  assert.equal(userRow(GONE, OWNER).statusLabel, 'Disabled');
  assert.equal(userRow({ ...ROY, role: null }, OWNER).roleLabel, 'Unknown role');
  assert.equal(userRow({ ...ROY, grants: ['viewAudit', 'manageUsers'], revokes: [] }, OWNER).changes, 'Also: Manage users and permissions');
  assert.equal(userRow({ ...ROY, revokes: [] }, OWNER).changes, null);
  const calls = [];
  const rows = [userRow(KATIE, OWNER), roy, userRow(GONE, OWNER)];
  const table = usersTable(rows, {
    actionsFor: (r) => userActions(OWNER, r, false),
    onEdit: (r) => calls.push(['edit', r.id]),
    onDisable: (r) => calls.push(['disable', r.id]),
    onEnable: (r) => calls.push(['enable', r.id]),
  });
  const [t] = find(table, (n) => n.type === 'table');
  assert.equal(t.props['data-stack'], '');
  assert.deepEqual(find(find(t, (n) => n.type === 'thead')[0], (n) => n.type === 'th').map(text), ['Name', 'Email', 'Role', 'Status', 'Actions']);
  const buttons = find(t, (n) => n.type === 'button');
  assert.deepEqual(buttons.map(text), ['Change role Katie H', 'Change role Roy Wickham', 'Disable Roy Wickham', 'Change role Old intern', 'Enable Old intern']);
  for (const b of buttons) b.props.onClick();
  assert.deepEqual(calls.map((c) => c.join(' ')), ['edit 1001', 'edit 1002', 'disable 1002', 'edit 1003', 'enable 1003']);
  const readOnly = usersTable(rows, { actionsFor: (r) => userActions(ADMIN, r, false), onEdit() {}, onDisable() {}, onEnable() {} });
  assert.equal(find(readOnly, (n) => n.type === 'button').length, 0);
  assert.equal(USERS_EMPTY, 'No users yet.');
});

test('the role editor: a role resets the capabilities to its own; PATCH sends only what changed', () => {
  const roy = userRow(ROY, OWNER);
  const editor = editorFor(roy);
  assert.equal(editor.role, 'admin');
  assert.deepEqual(editor.caps, ROLE_CAPS.admin.filter((c) => c !== 'manageCameras'));
  assert.equal(userPatchPayload(roy, editor), null, 'nothing changed: no request');
  assert.deepEqual(userPatchPayload(roy, withCapability(editor, 'manageCameras', true)), { revokes: [] }, 'the revoke undone');
  assert.deepEqual(userPatchPayload(roy, withCapability(editor, 'manageUsers', true)), { grants: ['manageUsers'] });
  const intern = withRole(editor, 'intern');
  assert.deepEqual(intern.caps, [...ROLE_CAPS.intern]);
  assert.deepEqual(userPatchPayload(roy, intern), { role: 'intern', revokes: [] }, 'a new role starts from its defaults');
  assert.deepEqual(userPatchPayload(userRow({ ...ROY, revokes: [] }, OWNER), withRole(editorFor(userRow({ ...ROY, revokes: [] }, OWNER)), 'intern')), { role: 'intern' }, 'no overrides before or after: role alone');
  const owner = withRole(editor, 'owner');
  assert.deepEqual(owner.caps, [...CAPABILITIES]);
  assert.deepEqual(userPatchPayload(roy, withCapability(owner, 'recycle', false)), { role: 'owner', revokes: [] }, 'an owner has everything: no overrides');
  assert.deepEqual(withCapability(editor, 'viewData', false).caps.includes('viewData'), false);
  assert.deepEqual(Object.keys(CAPABILITY_LABELS), [...CAPABILITIES]);
});

test('capabilityLabel: the role editor marks the three capabilities no screen here uses', () => {
  // CapabilityFilter: manageCameras gates /admin/datasource and /admin/cameras, manageSchools /admin/schools (both
  // dropped, plan 9 Ruling 2); inviteTeam gates nothing (the users screen, invites too, is manageUsers).
  assert.deepEqual([...NOT_USED_HERE], ['manageCameras', 'manageSchools', 'inviteTeam']);
  assert.equal(capabilityLabel('manageCameras'), 'Manage cameras (not used here)');
  assert.equal(capabilityLabel('manageSchools'), 'Manage school fundraising (not used here)');
  assert.equal(capabilityLabel('inviteTeam'), 'Invite team members (not used here)');
  for (const cap of CAPABILITIES.filter((c) => !NOT_USED_HERE.includes(c))) {
    assert.equal(capabilityLabel(cap), CAPABILITY_LABELS[cap], cap);
    assert.doesNotMatch(capabilityLabel(cap), /not used/, cap);
  }
  assert.match(readFileSync('src/islands/admin/Users.tsx', 'utf8'), /\{capabilityLabel\(cap\)\}/, 'the editor\'s boxes use it');
});

test('USER_CONFIRM.disable says what disabling does', () => {
  const confirm = USER_CONFIRM.disable(userRow(ROY, OWNER));
  assert.equal(confirm.title, 'Disable Roy Wickham\'s account?');
  assert.equal(confirm.body, 'Roy Wickham is signed out at their next step and cannot sign in until an owner enables the account again. Their activity stays in the log.');
  assert.equal(confirm.confirm, 'Disable account');
});

// --- settings -------------------------------------------------------------------------------------------------------

test('the intake switch: read from GET /intake/status, written with PATCH /admin/settings/intake {enabled}', () => {
  assert.deepEqual(intakeStatusRequest(), { path: '/intake/status' });
  assert.deepEqual(intakePayload(false), { enabled: false });
  assert.deepEqual(intakePayload(true), { enabled: true });
  assert.deepEqual(intakeRequest(false), { path: '/admin/settings/intake', method: 'PATCH', body: { enabled: false } });
  assert.equal(intakeOutcome({ intake_enabled: false }, true), false, 'the server\'s answer wins');
  assert.equal(intakeOutcome(null, false), false);
  assert.deepEqual(intakeView({ enabled: true }), { known: true, open: true, text: 'Intake is open', detail: 'The sighting form takes sightings.' });
  assert.deepEqual(intakeView({ enabled: false, message: 'Paused' }), { known: true, open: false, text: 'Intake is closed', detail: 'The sighting form takes no sightings until it is opened again.' });
  assert.deepEqual(intakeView(null), { known: false, open: null, text: 'The sighting form\'s state did not load.', detail: null });
});

test('INTAKE_CONFIRM: the write confirms first, because it closes the public form for everyone', () => {
  const close = INTAKE_CONFIRM(false);
  assert.equal(close.title, 'Close the sighting form?');
  assert.equal(close.body, 'Nobody can send a sighting until it is opened again: the form says sightings are paused and the API refuses them. It is the live form, for everyone, and the change is not in the activity log.');
  assert.equal(close.confirm, 'Close the form');
  const open = INTAKE_CONFIRM(true);
  assert.equal(open.title, 'Open the sighting form?');
  assert.equal(open.confirm, 'Open the form');
  assert.deepEqual(settingsActions(ADMIN, intakeView({ enabled: true }), false).intake, { shown: true, enabled: true, label: 'Close the sighting form', next: false });
  assert.deepEqual(settingsActions(ADMIN, intakeView({ enabled: false }), false).intake, { shown: true, enabled: true, label: 'Open the sighting form', next: true });
  assert.equal(settingsActions(ADMIN, intakeView(null), false).intake.enabled, false, 'not before the state is known');
  assert.equal(settingsActions(ADMIN, intakeView({ enabled: true }), true).intake.enabled, false);
  assert.equal(settingsActions(INTERN, intakeView({ enabled: true }), false).intake.shown, false, 'the switch needs settings');
});

// --- the dashboard --------------------------------------------------------------------------------------------------

test('the dashboard\'s requests: GET /admin/summary, GET /admin/queue?limit=5, GET /intake/status', () => {
  assert.deepEqual(summaryRequest(), { path: '/admin/summary' });
  assert.deepEqual(dashboardQueueRequest(), { path: '/admin/queue', query: { limit: 5 } });
  assert.deepEqual(dashboardView(ADMIN), { queue: true, settings: true });
  assert.deepEqual(dashboardView(user('intern', { permissions: ['viewData'] })), { queue: false, settings: false }, '/admin/queue needs reviewSightings');
  assert.deepEqual(dashboardView(VOLUNTEER), { queue: false, settings: false });
});

test('the dashboard renders the summary\'s KPIs as .wb-figures', () => {
  const summary = { pending: 7, verified: 1204, total_sightings: 1311, species: 182, cameras: 3 };
  const figures = dashboardFigures(summary);
  assert.deepEqual(figures.map((f) => [f.label, f.text]), [['Pending review', '7'], ['Verified', '1,204'], ['All sightings', '1,311'], ['Species', '182']]);
  const node = figuresNode(figures);
  assert.deepEqual(classes(node), ['wb-figures']);
  const each = node.children;
  assert.equal(each.length, 4, 'four: the design sets figures two, then four, to a row');
  for (const f of each) {
    assert.deepEqual(classes(f), ['wb-figure']);
    assert.deepEqual(f.children.map((c) => classes(c)[0]), ['wb-figure__value', 'wb-figure__label']);
  }
  assert.equal(text(each[1].children[0]), '1,204');
  assert.equal(text(each[1].children[1]), 'Verified');
  assert.deepEqual(dashboardFigures({}).map((f) => f.text), ['Not given', 'Not given', 'Not given', 'Not given']);
  assert.equal(camerasText(summary), 'Cameras: 3.');
  assert.equal(camerasText({}), null);
});

test('the dashboard says "Intake is closed" when enabled is false', () => {
  const closed = intakeNode(intakeView({ enabled: false }), { settingsHref: '#/settings' });
  assert.match(text(closed), /^Intake is closed\. The sighting form takes no sightings until it is opened again\. Open it in Settings\.$/);
  assert.ok(classes(closed).includes('wb-notice'));
  assert.equal(find(closed, (n) => n.type === 'a')[0].props.href, '#/settings');
  const noLink = intakeNode(intakeView({ enabled: false }), { settingsHref: null });
  assert.equal(find(noLink, (n) => n.type === 'a').length, 0);
  assert.equal(text(intakeNode(intakeView({ enabled: true }), { settingsHref: '#/settings' })), 'Intake is open. The sighting form takes sightings.');
  assert.equal(text(intakeNode(intakeView(null), { settingsHref: null })), 'The sighting form\'s state did not load.');
  assert.equal(QUEUE_EMPTY, 'No sightings waiting for review', 'the dashboard\'s queue uses the queue\'s sentence');
});

// --- the finish review (Task 7) -------------------------------------------------------------------------------------

test('fix 4: a recycled provisional sighting has no scientific name; the visitor\'s words are a plain sub-line', () => {
  const guess = recycleRow({ ...BINNED, species_id: 18, common_name: 'Big silver fish with a yellow tail', scientific_name: '[unverified] Big silver fish with a yellow tail', name_status: 'provisional' }, TOKEN);
  assert.equal(guess.species, 'Unidentified');
  assert.equal(guess.scientific, null);
  assert.equal(guess.visitorsName, 'Big silver fish with a yellow tail');
  const table = recycleTable([guess, recycleRow(BINNED, TOKEN)], { selected: [], enabled: true, onSelect() {} });
  const heads = find(find(table, (n) => n.type === 'tbody')[0], (n) => n.type === 'th');
  assert.deepEqual(find(heads[0], (n) => classes(n).includes('site-admin__sub')).map(text), ['Visitor\'s name: Big silver fish with a yellow tail']);
  assert.equal(find(heads[0], (n) => n.type === 'i').length, 0, 'nothing in italics');
  assert.doesNotMatch(text(heads[0]), /\[unverified\]/i);
  assert.equal(text(find(heads[1], (n) => n.type === 'i')[0]), 'Abudefduf saxatilis', 'a real one stays in italics');
});

test('fixes 3b and 6: long text may break in the recycle bin, the activity log and users; times are the day over the time', () => {
  const long = (tree) => find(find(tree, (n) => n.type === 'tbody')[0], (n) => classes(n).includes('wb-table__long')).map((c) => c.props['data-label']);
  const spoken = (tree, label) => find(tree, (n) => n.props?.['data-label'] === label).map((c) => find(c, (n) => classes(n).includes('site-admin__when'))[0]?.children.map(text));
  const bin = recycleTable([recycleRow(BINNED, TOKEN)], { selected: [], enabled: true, onSelect() {} });
  assert.deepEqual(long(bin), ['Submitted by']);
  assert.deepEqual(spoken(bin, 'Seen'), [['Oct 31, 2026', '10:22 AM']]);
  assert.deepEqual(spoken(bin, 'Recycled'), [['Nov 2, 2026', '8:05 AM']]);
  const log = activityTable([logRow(LOGGED)], { actionsFor: (r) => activityActions(ADMIN, r, false), onUndo() {} });
  assert.deepEqual(long(log), ['By'], 'the actor is an email');
  assert.deepEqual(spoken(log, 'When'), [['Nov 2, 2026', '8:05 AM']]);
  const users = usersTable([userRow({ ...ROY, email: 'priya.natarajan-okonkwo@student.pompanobeachschools.example.org' }, OWNER)], { actionsFor: (r) => userActions(OWNER, r, false), onEdit() {}, onDisable() {}, onEnable() {} });
  assert.deepEqual(long(users), ['Email']);
});

test('fix 5: the housekeeping confirms carry a tone: a purge and a disable are grave; a restore, an undo and the switch are not', () => {
  assert.equal(RECYCLE_CONFIRM.purge(2).tone, 'grave');
  assert.equal(RECYCLE_CONFIRM.restore(2).tone, 'action');
  assert.equal(USER_CONFIRM.disable(userRow(ROY, OWNER)).tone, 'grave');
  assert.equal(UNDO_CONFIRM(logRow(LOGGED)).tone, 'action');
  assert.equal(INTAKE_CONFIRM(true).tone, 'action');
  assert.equal(INTAKE_CONFIRM(false).tone, 'action');
  assert.equal(RECYCLE_CONFIRM.purge(2).confirm, 'Delete 2 sightings', 'the label names the consequence');
});

test('fixes 7 and 12: the recycle bin\'s toolbar: the page\'s check box with how many are checked, the pair, then Refresh', () => {
  const calls = [];
  const options = {
    actions: recycleActions(ADMIN, [], false),
    selection: { count: 0, all: false, some: false },
    pageCount: 9,
    busy: false,
    loading: false,
    refresh: true,
    onAll: (on) => calls.push(['all', on]),
    onRestore: () => calls.push('restore'),
    onPurge: () => calls.push('purge'),
    onRefresh: () => calls.push('refresh'),
  };
  const bar = recycleToolbar(options);
  assert.deepEqual(classes(bar), ['wb-toolbar']);
  const groups = bar.children.filter(Boolean);
  assert.deepEqual(groups.map((g) => classes(g)), [['site-admin__selection'], ['site-admin__actions'], ['site-admin__actions']]);
  const [selection, pair, refresh] = groups;
  const box = find(selection, (n) => n.type === 'input')[0];
  assert.equal(box.props.id, 'recycle-all');
  assert.equal(text(find(selection, (n) => n.type === 'label')[0]), 'Check every sighting on this page');
  assert.equal(text(find(selection, (n) => n.props?.role === 'status')[0]), 'None checked', 'on the check box\'s line');
  box.props.onChange({ target: { checked: true } });
  assert.deepEqual(find(pair, (n) => n.type === 'button').map(text), ['Restore', 'Delete permanently'], 'the pair together, Refresh apart');
  assert.deepEqual(find(pair, (n) => n.type === 'button').map((b) => classes(b)), [['wb-btn', 'wb-btn--action'], ['wb-btn', 'wb-btn--ghost']]);
  assert.ok(find(pair, (n) => n.type === 'button').every((b) => b.props.disabled === true), 'none checked: off');
  assert.deepEqual(find(refresh, (n) => n.type === 'button').map(text), ['Refresh']);
  find(refresh, (n) => n.type === 'button')[0].props.onClick();
  assert.deepEqual(calls, [['all', true], 'refresh']);
  const two = recycleToolbar({ ...options, actions: recycleActions(ADMIN, [1, 2], false), selection: { count: 2, all: false, some: true } });
  assert.equal(text(find(two, (n) => n.props?.role === 'status')[0]), '2 sightings checked');
  const [restore, purge] = find(two, (n) => n.type === 'button');
  assert.equal(restore.props.disabled, false);
  restore.props.onClick();
  purge.props.onClick();
  assert.deepEqual(calls.slice(-2), ['restore', 'purge']);
  const failed = recycleToolbar({ ...options, refresh: false });
  assert.ok(!find(failed, (n) => n.type === 'button').some((b) => text(b) === 'Refresh'), 'not beside the error notice\'s Try again');
  const empty = recycleToolbar({ ...options, pageCount: 0 });
  assert.equal(find(empty, (n) => n.type === 'input').length, 0, 'no rows, no check box for the page');
  const intern = recycleToolbar({ ...options, actions: recycleActions(INTERN, [], false) });
  assert.deepEqual(find(intern, (n) => n.type === 'button').map(text), ['Refresh'], 'no recycle: only Refresh');
  assert.deepEqual(find(recycleToolbar({ ...options, loading: true }), (n) => n.type === 'button').filter((b) => text(b) === 'Refresh').map((b) => b.props.disabled), [true]);
  const css = source('src/styles/site.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) => sel.split(',').map((x) => x.trim()).includes('.site-admin__selection'));
  assert.ok(rule, 'site.css lays out the selection group');
  assert.match(rule[2], /display:\s*flex/);
  assert.match(rule[2], /align-items:\s*center/, '"None checked" sits on the check box\'s line');
});

test('finish review: the housekeeping islands draw the toolbar and Refresh as the modules decide', () => {
  const recycle = source('src/islands/admin/Recycle.tsx');
  assert.match(recycle, /toReact\(\s*recycleToolbar\(/);
  assert.match(recycle, /refresh: state\.refresh/);
  assert.doesNotMatch(recycle, /None checked|Refresh</, 'the words are the module\'s');
  assert.match(source('src/islands/admin/Activity.tsx'), /\{state\.refresh && \(\s*<div className="wb-toolbar">/);
});

// --- the islands ----------------------------------------------------------------------------------------------------

test('AdminApp registers the housekeeping screens by their route\'s screen name', () => {
  const app = source('src/islands/AdminApp.tsx');
  const screens = app.match(/const SCREENS[^=]*=\s*\{([^}]*)\}/)?.[1] ?? '';
  for (const [name, screen] of [['Dashboard', 'dashboard'], ['Recycle', 'recycle'], ['Activity', 'activity'], ['Users', 'users'], ['Settings', 'settings']]) {
    assert.match(app, new RegExp(`import ${name} from '\\./admin/${name}'`));
    assert.match(screens, new RegExp(`\\b${screen}: ${name}\\b`));
  }
});

test('the housekeeping screens: every API failure goes to notify; confirms first; no media of their own', () => {
  for (const name of ['Recycle', 'Activity', 'Users', 'Settings', 'Dashboard']) {
    const file = `src/islands/admin/${name}.tsx`;
    const body = source(file);
    assert.match(body, /\bnotify\b/, `${file}: uses notify`);
    assert.doesNotMatch(body, /<(img|video)\b/, `${file}: no media element of its own`);
    assert.doesNotMatch(body, /accent/, `${file}: never the accent`);
    assert.doesNotMatch(body, /\bfetch\(/, `${file}: the API only through apiFetch`);
    assert.doesNotMatch(body, /style=/, `${file}: no style attribute`);
  }
  const recycle = source('src/islands/admin/Recycle.tsx');
  assert.match(recycle, /RECYCLE_CONFIRM\.restore\(/);
  assert.match(recycle, /RECYCLE_CONFIRM\.purge\(/);
  assert.match(source('src/islands/admin/Activity.tsx'), /UNDO_CONFIRM\(/);
  assert.match(source('src/islands/admin/Users.tsx'), /USER_CONFIRM\.disable\(/);
  assert.match(source('src/islands/admin/Users.tsx'), /usersView\(/);
  const settings = source('src/islands/admin/Settings.tsx');
  assert.match(settings, /INTAKE_CONFIRM\(/, 'the switch asks first');
  assert.match(settings, /intakeRequest\(/);
  const dashboard = source('src/islands/admin/Dashboard.tsx');
  assert.match(dashboard, /figuresNode\(/);
  assert.match(dashboard, /intakeNode\(/);
  assert.match(dashboard, /dashboardView\(/, 'the queue only for those who may read it');
});
