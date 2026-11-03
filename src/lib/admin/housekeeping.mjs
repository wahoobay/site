// The sighting review's housekeeping screens: the recycle bin (#/recycle), the activity log (#/activity), users
// (#/users), settings (#/settings) and the dashboard (#/), drawn by
// src/islands/admin/{Recycle,Activity,Users,Settings,Dashboard}.tsx. Everything they decide is here: the requests
// (paths and bodies as the Java API's AdminRecycleController, AdminLogController, AdminUserController,
// AdminSettingsController, IntakeStatusController and AdminSightingController.summary take them), the rows, which
// actions show, the payloads, the confirm dialogs' words and the empty sentences; and the markup of their tables, the
// dashboard's figures and the intake line as a small VDOM (src/lib/vdom.mjs) the islands hand to React. A plain module,
// so the tests read it without a build (tests/admin-housekeeping.test.mjs).
//
// What the server checks (CapabilityFilter): /admin/recycle needs recycle, /admin/log (undo too) viewAudit,
// /admin/users (invite too) manageUsers, /admin/settings settings, /admin/summary viewData, /admin/queue
// reviewSightings; GET /intake/status is public.
// What the server does that a payload must not trigger by accident:
// - POST /admin/recycle/restore brings a rejected sighting back as unverified, into the review queue
//   (AdminRecycleService.restore); purge deletes the sightings, their conditions and every media item it leaves on
//   no sighting (sweepOrphans), and has no undo. Nothing purges the bin by itself: its `days_left` is a countdown to
//   nothing, so it is not shown.
// - PATCH /admin/users/{id} replaces `grants` and `revokes` whenever the keys are sent, so only what changed goes.
//   POST …/invite makes an unknown role a volunteer without a word, so the role is checked first; it makes the
//   temporary password itself when none (or a short one) is sent, so none is.
// - DELETE /admin/users/{id} disables, never deletes, and refuses the signed-in account and the last owner (409).
// - PATCH /admin/settings/intake is not in the activity log, and closes the live form for everyone.
import { CAPABILITIES, ROLES, ROLE_CAPS, can } from './permissions.mjs';
import { NOT_GIVEN, formatWhen, sightingRow, statusChip } from './sightings.mjs';
import { checkNode, idOf, idsOf, plural, recordsTable, thumbNode } from './lists.mjs';
import { h } from '../vdom.mjs';

/** A value as text, trimmed; nothing is "". @param {unknown} value */
const plain = (value) => (value === null || value === undefined ? '' : String(value).trim());

/** @param {string} base @param {string | number} id */
const one = (base, id) => `${base}/${encodeURIComponent(String(id))}`;

/**
 * @typedef {{ shown: boolean, enabled: boolean }} Action
 */

// --- the recycle bin ------------------------------------------------------------------------------------------------

export const RECYCLE_EMPTY = 'The recycle bin is empty.';

/** GET /admin/recycle: every recycled sighting, the latest first (the whole list; the screen pages it). */
export const recycleRequest = () => ({ path: '/admin/recycle' });

/** The restore body: { ids: [...] }, or null when none is checked. @param {unknown[]} ids */
export const restorePayload = (ids) => {
  const list = idsOf(ids);
  return list.length ? { ids: list } : null;
};

/** The purge body: { ids: [...] }, or null when none is checked (a purge always names what it deletes). @param {unknown[]} ids */
export const purgePayload = (ids) => {
  const list = idsOf(ids);
  return list.length ? { ids: list } : null;
};

/** POST /admin/recycle/restore {ids}, or null for none. @param {unknown[]} ids */
export const restoreRequest = (ids) => {
  const body = restorePayload(ids);
  return body && { path: '/admin/recycle/restore', method: 'POST', body };
};

/** POST /admin/recycle/purge {ids}, or null for none. @param {unknown[]} ids */
export const purgeRequest = (ids) => {
  const body = purgePayload(ids);
  return body && { path: '/admin/recycle/purge', method: 'POST', body };
};

/**
 * @typedef {{
 *   id: number | null, species: string, scientific: string | null, status: 'pending' | 'verified' | 'rejected',
 *   statusLabel: string, when: string, recycled: string, submitter: string, camera: string,
 *   thumb: { src: string, video: boolean } | null,
 * }} RecycleRow
 */

/**
 * A recycled sighting: as the sighting screens read it (sightingRow), and when it was recycled. It links to no review:
 * the review's actions would answer 404 for a recycled sighting.
 * @param {any} r a row of GET /admin/recycle
 * @param {string | null} [token]
 * @returns {RecycleRow}
 */
export function recycleRow(r, token) {
  const row = sightingRow(r, token);
  return {
    id: row.id,
    species: row.species,
    scientific: row.scientific,
    status: row.status,
    statusLabel: row.statusLabel,
    when: row.when,
    recycled: formatWhen(r?.recycled_at),
    submitter: row.submitter,
    camera: row.camera,
    thumb: row.thumb,
  };
}

/**
 * The recycle bin's table: a check box per row, its picture, species, status, when seen and recycled, who sent it.
 * @param {RecycleRow[]} rows
 * @param {{ selected: number[], enabled: boolean, onSelect: (id: number, on: boolean) => void }} options
 */
export const recycleTable = (rows, { selected, enabled, onSelect }) =>
  recordsTable(rows, {
    caption: 'Sightings in the recycle bin',
    key: (r) => r.id,
    columns: [
      {
        key: 'select',
        label: 'Select',
        cell: (r) =>
          r.id === null
            ? NOT_GIVEN
            : checkNode({ id: `recycle-${r.id}`, checked: selected.includes(r.id), disabled: !enabled, label: `Select sighting ${r.id}`, hideLabel: true, onChange: (on) => onSelect(/** @type {number} */ (r.id), on) }),
      },
      { key: 'media', label: 'Media', cell: (r) => thumbNode(r.thumb) },
      {
        key: 'species',
        label: 'Species',
        header: true,
        cell: (r) => [r.species, r.scientific && r.scientific !== r.species && h('span', { key: 'sci', className: 'site-admin__sub' }, h('i', null, r.scientific))],
      },
      { key: 'status', label: 'Status', cell: (r) => statusChip(r.status) },
      { key: 'when', label: 'Seen', cell: (r) => r.when },
      { key: 'recycled', label: 'Recycled', cell: (r) => r.recycled },
      { key: 'submitter', label: 'Submitted by', cell: (r) => r.submitter },
      { key: 'id', label: 'ID', cell: (r) => (r.id === null ? NOT_GIVEN : String(r.id)) },
    ],
  });

/**
 * Restore and purge act on the checked set: each needs recycle (/admin/recycle), at least one checked, and no request
 * in flight.
 * @param {any} user
 * @param {number[]} selected
 * @param {boolean} busy
 * @returns {{ restore: Action, purge: Action }}
 */
export function recycleActions(user, selected, busy) {
  const shown = can(user, 'recycle');
  const enabled = shown && !busy && idsOf(selected).length > 0;
  return { restore: { shown, enabled }, purge: { shown, enabled } };
}

/**
 * The confirm dialogs (.wb-dialog) before a restore and a purge, each naming the count. A restore's undo (AuditService
 * "recycle_ids") recycles again but does not put back a rejected status, so the restore says so.
 */
export const RECYCLE_CONFIRM = Object.freeze({
  /** @param {number} n */
  restore: (n) => ({
    title: `Restore ${plural(n, 'sighting', 'sightings')}?`,
    body:
      n === 1
        ? 'It leaves the recycle bin. If it was rejected, it goes back to the review queue as pending; otherwise it keeps its status. An undo in the activity log puts it back in the bin, but if it was rejected it stays pending.'
        : 'They leave the recycle bin. A rejected one goes back to the review queue as pending; the others keep their status. An undo in the activity log puts them back in the bin, but a rejected one stays pending.',
    confirm: `Restore ${plural(n, 'sighting', 'sightings')}`,
  }),
  /** @param {number} n */
  purge: (n) => ({
    title: `Delete ${plural(n, 'sighting', 'sightings')} permanently?`,
    body:
      n === 1
        ? 'It is deleted for good, with its conditions and any photo or clip that no other sighting uses. This cannot be undone.'
        : 'They are deleted for good, with their conditions and any photo or clip that no other sighting uses. This cannot be undone.',
    confirm: `Delete ${plural(n, 'sighting', 'sightings')}`,
  }),
});

/**
 * What a restore or a purge did, from the server's count ({ restored } or { purged }), and how many it skipped (no
 * longer in the bin: restored or purged meanwhile).
 * @param {'restore' | 'purge'} kind
 * @param {any} answer
 * @param {number} asked
 */
export function recycleOutcome(kind, answer, asked) {
  const said = Number(kind === 'restore' ? answer?.restored : answer?.purged);
  const n = Number.isFinite(said) && said >= 0 ? said : asked;
  const done = kind === 'restore' ? `Restored ${plural(n, 'sighting', 'sightings')}.` : `Deleted ${plural(n, 'sighting', 'sightings')} permanently.`;
  const left = asked - n;
  return left > 0 ? `${done} The other ${left} ${left === 1 ? 'was' : 'were'} no longer in the recycle bin.` : done;
}

// --- the activity log -----------------------------------------------------------------------------------------------

export const ACTIVITY_EMPTY = 'No changes in the last 14 days.';

/** GET /admin/log: the last 14 days of changes (300 at most), the latest first (AuditService.list). */
export const logRequest = () => ({ path: '/admin/log' });

/** POST /admin/log/{id}/undo: the change reversed, if the log says it can be. @param {string | number} id */
export const undoRequest = (id) => ({ path: `${one('/admin/log', id)}/undo`, method: 'POST' });

/**
 * @typedef {{ id: number | null, when: string, actor: string, action: string, summary: string, undone: boolean, undoable: boolean }} LogRow
 */

/**
 * A change in the log: when, by whom (the account's email), what (the server's summary, else its action), and whether
 * it was undone or can be.
 * @param {any} r a row of GET /admin/log
 * @returns {LogRow}
 */
export const logRow = (r) => ({
  id: idOf(r?.id),
  when: formatWhen(r?.ts),
  actor: plain(r?.actor) || 'system',
  action: plain(r?.action),
  summary: plain(r?.summary) || plain(r?.action) || 'A change',
  undone: r?.undone === true,
  undoable: r?.undoable === true,
});

/**
 * Undo shows where the log says the change can be undone and it was not, for a user with viewAudit (the server's check
 * on POST …/undo); not while a request is in flight.
 * @param {any} user
 * @param {LogRow} row
 * @param {boolean} busy
 * @returns {{ undo: Action }}
 */
export function activityActions(user, row, busy) {
  const shown = can(user, 'viewAudit') && row.undoable && !row.undone;
  return { undo: { shown, enabled: shown && !busy } };
}

/**
 * The confirm dialog (.wb-dialog) before an undo: which change it reverses.
 * @param {LogRow} row
 */
export const UNDO_CONFIRM = (row) => ({
  title: 'Undo this change?',
  body: `“${row.summary}” (${row.when}, by ${row.actor}) is reversed. The undo is logged too, and cannot itself be undone.`,
  confirm: 'Undo',
});

/** What an undo did. @param {LogRow} row */
export const undoOutcome = (row) => `Undone: ${row.summary}.`;

/**
 * The log's table: when, by whom, the change, and its Undo (or "Undone", or "Cannot be undone").
 * @param {LogRow[]} rows
 * @param {{ actionsFor: (row: LogRow) => ReturnType<typeof activityActions>, onUndo: (row: LogRow) => void }} options
 */
export const activityTable = (rows, { actionsFor, onUndo }) =>
  recordsTable(rows, {
    caption: 'Changes in the last 14 days',
    key: (r) => r.id,
    columns: [
      { key: 'when', label: 'When', cell: (r) => r.when },
      { key: 'actor', label: 'By', cell: (r) => r.actor },
      { key: 'summary', label: 'Change', header: true, cell: (r) => r.summary },
      {
        key: 'undo',
        label: 'Undo',
        cell: (r) => {
          if (r.undone) return 'Undone';
          const { undo } = actionsFor(r);
          if (!undo.shown) return 'Cannot be undone';
          return h('button', { className: 'wb-btn wb-btn--ghost', type: 'button', disabled: !undo.enabled, onClick: () => onUndo(r) }, 'Undo', h('span', { className: 'wb-sr-only' }, ` “${r.summary}”`));
        },
      },
    ],
  });

// --- users ----------------------------------------------------------------------------------------------------------

export const USERS_EMPTY = 'No users yet.';

/** The four roles, the server's names (Roles.java) in its order, and their words. */
export const ROLE_LABELS = Object.freeze({ owner: 'Owner', admin: 'Admin', intern: 'Intern', volunteer: 'Volunteer' });

/** What each capability opens here (Roles.ALL_CAPS, in its order). */
export const CAPABILITY_LABELS = Object.freeze({
  viewData: 'Dashboard',
  reviewSightings: 'Review sightings',
  editSpecies: 'Edit species',
  editMedia: 'Media library',
  hideMedia: 'Hide media from the site',
  manageCameras: 'Manage cameras',
  manageSchools: 'Manage school fundraising',
  recycle: 'Recycle bin',
  inviteTeam: 'Invite team members',
  manageUsers: 'Manage users and permissions',
  viewAudit: 'Activity log and undo',
  settings: 'Settings',
});

/** GET /admin/users: every account, disabled ones too (AdminUserController.list). */
export const usersRequest = () => ({ path: '/admin/users' });

/**
 * PATCH /admin/users/{id} with what changed (userPatchPayload).
 * @param {string | number} id
 * @param {{ role?: string, grants?: string[], revokes?: string[] }} body
 */
export const userPatchRequest = (id, body) => ({ path: one('/admin/users', id), method: 'PATCH', body });

/** DELETE /admin/users/{id}: the account disabled (never deleted; its log stays). @param {string | number} id */
export const disableRequest = (id) => ({ path: one('/admin/users', id), method: 'DELETE' });

/** POST /admin/users/{id}/enable: a disabled account active again. @param {string | number} id */
export const enableRequest = (id) => ({ path: `${one('/admin/users', id)}/enable`, method: 'POST' });

/** Capability keys as the server knows them, in its order. @param {unknown} list */
const capsOf = (list) => CAPABILITIES.filter((c) => Array.isArray(list) && list.includes(c));

/** @param {string} role */
const presetOf = (role) => (role === 'owner' ? [...CAPABILITIES] : [...(/** @type {Record<string, readonly string[]>} */ (ROLE_CAPS)[role] ?? [])]);

/**
 * @typedef {{
 *   id: number | null, name: string, email: string, username: string, role: string | null, roleLabel: string,
 *   active: boolean, statusLabel: string, mustChange: boolean, self: boolean, grants: string[], revokes: string[],
 *   permissions: string[], changes: string | null,
 * }} UserRow
 */

/**
 * An account as the users screen shows it: name, email, role (a role id the server cannot map is "Unknown role"), the
 * changes from its role's defaults in words, whether it is active, and whether it is the signed-in user's own (matched
 * by email, any case: the session carries no id).
 * @param {any} u a row of GET /admin/users
 * @param {any} me the signed-in user
 * @returns {UserRow}
 */
export function userRow(u, me) {
  const role = ROLES.includes(plain(u?.role).toLowerCase()) ? plain(u.role).toLowerCase() : null;
  const email = plain(u?.email);
  const grants = capsOf(u?.grants);
  const revokes = capsOf(u?.revokes);
  let changes = null;
  if (role && role !== 'owner') {
    const preset = presetOf(role);
    const also = grants.filter((c) => !preset.includes(c));
    const not = revokes.filter((c) => preset.includes(c));
    const label = (/** @type {string[]} */ list) => list.map((c) => CAPABILITY_LABELS[/** @type {keyof typeof CAPABILITY_LABELS} */ (c)]).join(', ');
    changes = [also.length ? `Also: ${label(also)}` : '', not.length ? `Not: ${label(not)}` : ''].filter(Boolean).join('; ') || null;
  }
  const active = u?.active !== false;
  return {
    id: idOf(u?.id),
    name: plain(u?.name) || plain(u?.username) || email || `User ${u?.id ?? ''}`.trim(),
    email: email || NOT_GIVEN,
    username: plain(u?.username),
    role,
    roleLabel: role ? ROLE_LABELS[/** @type {keyof typeof ROLE_LABELS} */ (role)] : 'Unknown role',
    active,
    statusLabel: active ? 'Active' : 'Disabled',
    mustChange: u?.mustChangePassword === true,
    self: Boolean(email && plain(me?.email) && email.toLowerCase() === plain(me.email).toLowerCase()),
    grants,
    revokes,
    permissions: capsOf(u?.permissions),
    changes,
  };
}

/**
 * What the users screen offers beyond the list: the invite, which the server checks against manageUsers (the whole of
 * /admin/users; inviteTeam opens nothing there).
 * @param {any} user
 */
export const usersView = (user) => ({ invite: can(user, 'manageUsers') });

/**
 * Which of an account's actions show and can be pressed: each needs manageUsers. Disable is for an active account that
 * is not the user's own (the server refuses that, and the last owner); enable for a disabled one.
 * @param {any} user
 * @param {UserRow} row
 * @param {boolean} busy
 * @returns {{ edit: Action, disable: Action, enable: Action }}
 */
export function userActions(user, row, busy) {
  const may = can(user, 'manageUsers');
  /** @param {boolean} shown */
  const action = (shown) => ({ shown, enabled: shown && !busy });
  return { edit: action(may), disable: action(may && row.active && !row.self), enable: action(may && !row.active) };
}

/**
 * The users' table: name, email, role (and its changes), status; Change role, Disable and Enable as the user may.
 * @param {UserRow[]} rows
 * @param {{ actionsFor: (row: UserRow) => ReturnType<typeof userActions>, onEdit: (row: UserRow) => void, onDisable: (row: UserRow) => void, onEnable: (row: UserRow) => void }} options
 */
export function usersTable(rows, { actionsFor, onEdit, onDisable, onEnable }) {
  const acts = rows.map(actionsFor);
  /** @type {import('./lists.mjs').Column[]} */
  const columns = [
    { key: 'name', label: 'Name', header: true, cell: (r) => [r.name, r.self && h('span', { key: 'you', className: 'site-admin__sub' }, 'You')] },
    { key: 'email', label: 'Email', cell: (r) => r.email },
    { key: 'role', label: 'Role', cell: (r) => [r.roleLabel, r.changes && h('span', { key: 'changes', className: 'site-admin__sub' }, r.changes)] },
    { key: 'status', label: 'Status', cell: (r) => [r.statusLabel, r.mustChange && h('span', { key: 'must', className: 'site-admin__sub' }, 'Must change their password')] },
  ];
  if (acts.some((a) => a.edit.shown || a.disable.shown || a.enable.shown)) {
    /** @param {string} key @param {string} label @param {Action} a @param {UserRow} r @param {(row: UserRow) => void} on */
    const button = (key, label, a, r, on) =>
      a.shown && h('button', { key, className: 'wb-btn wb-btn--ghost', type: 'button', disabled: !a.enabled, onClick: () => on(r) }, label, h('span', { className: 'wb-sr-only' }, ` ${r.name}`));
    columns.push({
      key: 'actions',
      label: 'Actions',
      cell: (r) => {
        const a = acts[rows.indexOf(r)];
        return h(
          'span',
          { className: 'site-admin__actions' },
          button('edit', 'Change role', a.edit, r, onEdit),
          button('disable', 'Disable', a.disable, r, onDisable),
          button('enable', 'Enable', a.enable, r, onEnable),
        );
      },
    });
  }
  return recordsTable(rows, { caption: 'Users', key: (r) => r.id, columns });
}

/** A plausible email address (the server checks only that one is given). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What the invite needs before it sends: an email address and one of the four roles. The name is optional.
 * @param {{ name?: string, email?: string, role?: string }} form
 * @returns {{ email?: string, role?: string }}
 */
export function inviteErrors({ email, role }) {
  /** @type {{ email?: string, role?: string }} */
  const errors = {};
  if (!plain(email)) errors.email = 'Enter their email address';
  else if (!EMAIL.test(plain(email))) errors.email = 'Enter an email address, like name@example.org';
  if (!ROLES.includes(String(role ?? ''))) errors.role = 'Choose a role';
  return errors;
}

/**
 * The invite body: { name, email, role }, trimmed, the role one of the four; never a password (the server makes a
 * temporary one). Null while inviteErrors finds a problem.
 * @param {{ name?: string, email?: string, role?: string }} form
 * @returns {{ name: string, email: string, role: string } | null}
 */
export function invitePayload(form) {
  const errors = inviteErrors(form);
  if (errors.email || errors.role) return null;
  return { name: plain(form.name), email: plain(form.email), role: String(form.role) };
}

/** POST /admin/users/invite {name, email, role}, or null while the form is not ready. @param {{ name?: string, email?: string, role?: string }} form */
export const inviteRequest = (form) => {
  const body = invitePayload(form);
  return body && { path: '/admin/users/invite', method: 'POST', body };
};

/**
 * What the invite answered: the new account and its temporary password, which the API shows this once.
 * @param {any} answer
 * @returns {{ name: string, email: string, username: string, role: string, password: string, text: string }}
 */
export function inviteOutcome(answer) {
  const row = userRow(answer, null);
  const role = row.role ?? 'volunteer';
  const word = ROLE_LABELS[/** @type {keyof typeof ROLE_LABELS} */ (role)].toLowerCase();
  const article = /^[aeiou]/.test(word) ? 'an' : 'a';
  const login = row.username && row.username !== row.email ? `${row.email} (or the username ${row.username})` : row.email;
  return {
    name: row.name,
    email: row.email,
    username: row.username,
    role,
    password: plain(answer?.temporaryPassword),
    text: `${row.name} is added as ${article} ${word}. They sign in with ${login} and this temporary password, then choose their own. It is shown only now, so pass it on before you leave this screen.`,
  };
}

/**
 * @typedef {{ role: string, caps: string[] }} Editor
 */

/**
 * The role editor's starting state: the account's role and its capabilities as the server has them (an owner's are
 * all of them).
 * @param {UserRow} row
 * @returns {Editor}
 */
export const editorFor = (row) => ({ role: row.role ?? '', caps: row.role === 'owner' ? [...CAPABILITIES] : [...row.permissions] });

/**
 * A new role, with that role's own capabilities (the old screen did the same: a role change starts clean).
 * @param {Editor} editor
 * @param {string} role
 * @returns {Editor}
 */
export const withRole = (editor, role) => ({ ...editor, role, caps: presetOf(role) });

/**
 * One capability on or off (an owner's cannot change: the owner passes every check).
 * @param {Editor} editor
 * @param {string} cap
 * @param {boolean} on
 * @returns {Editor}
 */
export const withCapability = (editor, cap, on) =>
  editor.role === 'owner' ? editor : { ...editor, caps: CAPABILITIES.filter((c) => (c === cap ? on : editor.caps.includes(c))) };

/** @param {string[]} a @param {string[]} b */
const sameSet = (a, b) => a.length === b.length && a.every((c) => b.includes(c));

/**
 * The PATCH body: the role when it changed, and `grants` (what the role lacks) and `revokes` (what it has, taken away)
 * each only when it differs from the account's, because the server replaces either whenever its key is sent. Null when
 * nothing changed, or no role is chosen.
 * @param {UserRow} row
 * @param {Editor} editor
 * @returns {{ role?: string, grants?: string[], revokes?: string[] } | null}
 */
export function userPatchPayload(row, editor) {
  if (!ROLES.includes(editor.role)) return null;
  /** @type {{ role?: string, grants?: string[], revokes?: string[] }} */
  const out = {};
  if (editor.role !== row.role) out.role = editor.role;
  const preset = presetOf(editor.role);
  const caps = editor.role === 'owner' ? preset : capsOf(editor.caps);
  const grants = caps.filter((c) => !preset.includes(c));
  const revokes = preset.filter((c) => !caps.includes(c));
  if (!sameSet(grants, row.grants)) out.grants = grants;
  if (!sameSet(revokes, row.revokes)) out.revokes = revokes;
  return Object.keys(out).length ? out : null;
}

/** The confirm dialog (.wb-dialog) before an account is disabled (the API's DELETE). */
export const USER_CONFIRM = Object.freeze({
  /** @param {UserRow} row */
  disable: (row) => ({
    title: `Disable ${row.name}'s account?`,
    body: `${row.name} is signed out at their next step and cannot sign in until an owner enables the account again. Their activity stays in the log.`,
    confirm: 'Disable account',
  }),
});

// --- settings -------------------------------------------------------------------------------------------------------

/** GET /intake/status: whether the sighting form takes sightings (public; no token sent). */
export const intakeStatusRequest = () => ({ path: '/intake/status' });

/** The switch's body: { enabled: boolean }. @param {unknown} enabled */
export const intakePayload = (enabled) => ({ enabled: Boolean(enabled) });

/** PATCH /admin/settings/intake {enabled}: the sighting form opened or closed, for everyone. @param {unknown} enabled */
export const intakeRequest = (enabled) => ({ path: '/admin/settings/intake', method: 'PATCH', body: intakePayload(enabled) });

/**
 * Whether the form is open now, from the switch's answer ({ intake_enabled }), else what was asked.
 * @param {any} answer
 * @param {boolean} asked
 */
export const intakeOutcome = (answer, asked) => (typeof answer?.intake_enabled === 'boolean' ? answer.intake_enabled : Boolean(asked));

/**
 * @typedef {{ known: boolean, open: boolean | null, text: string, detail: string | null }} IntakeView
 */

/**
 * The form's state in words, from GET /intake/status ({ enabled }): open, closed, or not known (it did not load).
 * @param {any} status
 * @returns {IntakeView}
 */
export function intakeView(status) {
  if (status?.enabled === false) return { known: true, open: false, text: 'Intake is closed', detail: 'The sighting form takes no sightings until it is opened again.' };
  if (status?.enabled === true) return { known: true, open: true, text: 'Intake is open', detail: 'The sighting form takes sightings.' };
  return { known: false, open: null, text: 'The sighting form\'s state did not load.', detail: null };
}

/**
 * The form's state as the dashboard shows it: closed is a notice (with the way to Settings for a user who may open
 * it), open a line, not known a line.
 * @param {IntakeView} view
 * @param {{ settingsHref: string | null }} options
 */
export function intakeNode(view, { settingsHref }) {
  if (!view.known) return h('p', null, view.text);
  const line = h('p', null, h('strong', null, `${view.text}.`), ` ${view.detail}`, !view.open && settingsHref && [' ', h('a', { key: 'settings', href: settingsHref }, 'Open it in Settings'), '.']);
  return view.open ? line : h('div', { className: 'wb-notice', role: 'status' }, line);
}

/**
 * The confirm dialog (.wb-dialog) before the switch: it opens or closes the live form for everyone.
 * @param {boolean} open the state it sets
 */
export const INTAKE_CONFIRM = (open) =>
  open
    ? {
        title: 'Open the sighting form?',
        body: 'Visitors can send sightings again on the live form. The change is not in the activity log.',
        confirm: 'Open the form',
      }
    : {
        title: 'Close the sighting form?',
        body: 'Nobody can send a sighting until it is opened again: the form says sightings are paused and the API refuses them. It is the live form, for everyone, and the change is not in the activity log.',
        confirm: 'Close the form',
      };

/**
 * The switch shows for a user with settings, and can be pressed once the form's state is known and no request is in
 * flight; `next` is the state it sets.
 * @param {any} user
 * @param {IntakeView} view
 * @param {boolean} busy
 * @returns {{ intake: Action & { label: string, next: boolean } }}
 */
export function settingsActions(user, view, busy) {
  const shown = can(user, 'settings');
  return {
    intake: { shown, enabled: shown && view.known && !busy, label: view.open ? 'Close the sighting form' : 'Open the sighting form', next: !view.open },
  };
}

// --- the dashboard --------------------------------------------------------------------------------------------------

/** GET /admin/summary: the counts the dashboard shows (AdminSightingService.summary). */
export const summaryRequest = () => ({ path: '/admin/summary' });

/** GET /admin/queue?limit=5: the newest sightings waiting for review. */
export const dashboardQueueRequest = () => ({ path: '/admin/queue', query: { limit: 5 } });

/**
 * What the dashboard shows beyond the counts: the queue's newest (GET /admin/queue needs reviewSightings, which the
 * dashboard's viewData does not give), and the way to the switch (settings).
 * @param {any} user
 */
export const dashboardView = (user) => ({ queue: can(user, 'reviewSightings'), settings: can(user, 'settings') });

/** The summary's figures, in the design's four columns. */
const FIGURES = Object.freeze([
  ['pending', 'Pending review'],
  ['verified', 'Verified'],
  ['total_sightings', 'All sightings'],
  ['species', 'Species'],
]);

/** @param {unknown} value */
const figureText = (value) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : NOT_GIVEN);

/**
 * The summary's counts as figures: pending review, verified, all sightings (outside the recycle bin) and species.
 * @param {any} summary
 * @returns {{ key: string, label: string, text: string }[]}
 */
export const dashboardFigures = (summary) => FIGURES.map(([key, label]) => ({ key, label, text: figureText(summary?.[key]) }));

/** The cameras the summary counts, as a line, or null. @param {any} summary */
export const camerasText = (summary) => (typeof summary?.cameras === 'number' ? `Cameras: ${figureText(summary.cameras)}.` : null);

/**
 * The figures (.wb-figures): each value large in brand blue over its label, as the home page's (src/components/
 * Figures.astro, whose waiver for the detector's contrast check on large text this repeats).
 * @param {{ key: string, label: string, text: string }[]} figures
 */
export const figuresNode = (figures) =>
  h(
    'div',
    { className: 'wb-figures' },
    figures.map((f) =>
      h(
        'div',
        { key: f.key, className: 'wb-figure' },
        h('b', { className: 'wb-figure__value', 'data-impeccable-ignore': 'low-contrast' }, f.text),
        h('span', { className: 'wb-figure__label' }, f.label),
      ),
    ),
  );
