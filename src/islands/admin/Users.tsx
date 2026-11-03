// Users (#/users): every account (GET /admin/users), with its role and its changes from that role, and for a user with
// manageUsers: the invite (which answers a temporary password, shown here once), the role editor (a role and the
// capabilities it adds or takes away), Disable (after a .wb-dialog confirm; the API's DELETE) and Enable. What shows
// and what is sent is src/lib/admin/housekeeping.mjs's; a 401 on any call, and any failed action, goes to the shell's
// notify.
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { CAPABILITIES } from '../../lib/admin/permissions.mjs';
import { listBody, listState } from '../../lib/admin/sightings.mjs';
import {
  CAPABILITY_LABELS,
  ROLE_LABELS,
  USERS_EMPTY,
  USER_CONFIRM,
  disableRequest,
  editorFor,
  enableRequest,
  inviteErrors,
  inviteOutcome,
  inviteRequest,
  userActions,
  userPatchPayload,
  userPatchRequest,
  userRow,
  usersRequest,
  usersTable,
  usersView,
  withCapability,
  withRole,
  type Editor,
  type UserRow,
} from '../../lib/admin/housekeeping.mjs';
import { ConfirmDialog, send, useOneAtATime, usePagedList } from './shared';

const BLANK = { name: '', email: '', role: 'volunteer' };
const INVITE = { name: 'invite-name', email: 'invite-email', role: 'invite-role' };

export default function Users({ session, notify }: ScreenProps) {
  const [invite, setInvite] = useState(BLANK);
  const [tried, setTried] = useState(false);
  const [issued, setIssued] = useState<ReturnType<typeof inviteOutcome> | null>(null);
  const [editing, setEditing] = useState<{ row: UserRow; editor: Editor } | null>(null);
  const [disabling, setDisabling] = useState<UserRow | null>(null);
  const issuedRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLHeadingElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [disabled, setDisabled] = useState(0);
  const { busy, run } = useOneAtATime();
  const list = usePagedList(usersRequest(), session.token, notify);
  const view = usersView(session.user);
  const rows = list.rows.map((u) => userRow(u, session.user));
  const errors = tried ? inviteErrors(invite) : {};
  const state = listState({
    rows,
    total: rows.length,
    limit: Math.max(1, rows.length),
    offset: 0,
    loading: list.loading,
    error: list.error,
    empty: USERS_EMPTY,
    failed: 'The users did not load.',
  });

  useEffect(() => {
    if (issued) issuedRef.current?.focus();
  }, [issued]);
  const editingId = editing?.row.id ?? null;
  useEffect(() => {
    if (editingId !== null) editorRef.current?.focus();
  }, [editingId]);
  useEffect(() => {
    if (disabled > 0) heading.current?.focus();
  }, [disabled]);

  const submitInvite = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    const request = inviteRequest(invite);
    if (!request) {
      const missing = inviteErrors(invite);
      document.getElementById(missing.email ? INVITE.email : INVITE.role)?.focus();
      return;
    }
    void run(
      'invite',
      async () => {
        const answer = await send(request, session.token);
        setIssued(inviteOutcome(answer));
        setInvite(BLANK);
        setTried(false);
        list.reload();
      },
      notify,
    );
  };

  const saveRole = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || editing.row.id === null) return;
    const { row, editor } = editing;
    const body = userPatchPayload(row, editor);
    if (!body) return;
    void run(
      'role',
      async () => {
        await send(userPatchRequest(row.id as number, body), session.token);
        setEditing(null);
        notify(`${row.name}'s role and permissions are saved.`);
        list.reload();
      },
      notify,
    );
  };

  const disable = () => {
    const row = disabling;
    if (!row || row.id === null) return;
    void run(
      'disable',
      async () => {
        await send(disableRequest(row.id as number), session.token);
        setDisabling(null);
        setDisabled((n) => n + 1);
        notify(`${row.name}'s account is disabled.`);
        list.reload();
      },
      (error) => {
        setDisabling(null);
        notify(error);
      },
    );
  };

  const enable = (row: UserRow) =>
    void run(
      'enable',
      async () => {
        if (row.id === null) return;
        await send(enableRequest(row.id), session.token);
        notify(`${row.name}'s account is enabled.`);
        list.reload();
      },
      notify,
    );

  const changed = editing ? userPatchPayload(editing.row, editing.editor) : null;
  const owner = editing?.editor.role === 'owner';

  return (
    <section className="site-admin__screen" aria-labelledby="users-title">
      <h2 id="users-title" tabIndex={-1} ref={heading}>Users</h2>
      <p>Everyone who can sign in to the review, with their role. A role gives a set of permissions; an owner can add to them or take some away for one person.</p>

      {view.invite && (
        <form className="site-admin__edit" noValidate aria-busy={busy === 'invite'} onSubmit={submitInvite}>
          <h3>Invite someone</h3>
          <p>They get a temporary password, shown here once, and choose their own when they first sign in. Nothing is emailed.</p>
          <div className="site-admin__fields">
            <div className="wb-field">
              <label className="wb-label" htmlFor={INVITE.name}>Name</label>
              <input className="wb-input" id={INVITE.name} type="text" autoComplete="off" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            </div>
            <div className="wb-field">
              <label className="wb-label" htmlFor={INVITE.email}>Email</label>
              <input
                className="wb-input"
                id={INVITE.email}
                type="email"
                autoComplete="off"
                value={invite.email}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? `${INVITE.email}-error` : undefined}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              />
              {errors.email && <p className="wb-error" id={`${INVITE.email}-error`}>{errors.email}</p>}
            </div>
            <div className="wb-field">
              <label className="wb-label" htmlFor={INVITE.role}>Role</label>
              <select
                className="wb-select"
                id={INVITE.role}
                value={invite.role}
                aria-invalid={errors.role ? true : undefined}
                aria-describedby={errors.role ? `${INVITE.role}-error` : undefined}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {errors.role && <p className="wb-error" id={`${INVITE.role}-error`}>{errors.role}</p>}
            </div>
          </div>
          <div>
            <button className={`wb-btn wb-btn--action${busy === 'invite' ? ' wb-btn--busy' : ''}`} type="submit" disabled={busy !== null}>
              {busy === 'invite' ? 'Inviting…' : 'Invite'}
            </button>
          </div>
        </form>
      )}

      {issued && (
        <div className="wb-notice site-admin__notice" role="status" tabIndex={-1} ref={issuedRef}>
          <div>
            <p>{issued.text}</p>
            <p>
              Temporary password: <strong>{issued.password || 'Not given'}</strong>
            </p>
          </div>
          <button className="wb-btn wb-btn--ghost" type="button" onClick={() => setIssued(null)}>
            Done
          </button>
        </div>
      )}

      {toReact(
        listBody(state, {
          onRetry: list.reload,
          loadingText: 'Loading the users…',
          table: () =>
            usersTable(rows, {
              actionsFor: (row) => userActions(session.user, row, busy !== null),
              onEdit: (row) => setEditing({ row, editor: editorFor(row) }),
              onDisable: (row) => setDisabling(row),
              onEnable: enable,
            }),
          pager: () => null,
        }),
      )}

      {editing && (
        <form className="site-admin__edit" noValidate aria-busy={busy === 'role'} aria-labelledby="user-editor-title" onSubmit={saveRole}>
          <h3 id="user-editor-title" tabIndex={-1} ref={editorRef}>Role and permissions of {editing.row.name}</h3>
          <div className="wb-field">
            <label className="wb-label" htmlFor="user-role">Role</label>
            <select
              className="wb-select"
              id="user-role"
              value={editing.editor.role}
              aria-describedby="user-role-help"
              onChange={(e) => setEditing({ ...editing, editor: withRole(editing.editor, e.target.value) })}
            >
              {!editing.editor.role && <option value="">Choose a role</option>}
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <p className="wb-help" id="user-role-help">A new role starts from that role's own permissions.</p>
          </div>
          <div className="site-admin__fields" role="group" aria-labelledby="user-caps-title">
            <h4 className="site-admin__wide" id="user-caps-title">Permissions</h4>
            {owner && <p className="site-admin__wide">An owner has every permission.</p>}
            {CAPABILITIES.map((cap) => (
              <span className="site-admin__check" key={cap}>
                <input
                  type="checkbox"
                  id={`user-cap-${cap}`}
                  checked={editing.editor.caps.includes(cap)}
                  disabled={owner || !editing.editor.role}
                  onChange={(e) => setEditing({ ...editing, editor: withCapability(editing.editor, cap, e.target.checked) })}
                />
                <label htmlFor={`user-cap-${cap}`}>{CAPABILITY_LABELS[cap as keyof typeof CAPABILITY_LABELS]}</label>
              </span>
            ))}
          </div>
          <div className="site-admin__actions">
            <button className={`wb-btn wb-btn--action${busy === 'role' ? ' wb-btn--busy' : ''}`} type="submit" disabled={busy !== null || !changed}>
              {busy === 'role' ? 'Saving…' : 'Save'}
            </button>
            <button className="wb-btn wb-btn--ghost" type="button" disabled={busy !== null} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <ConfirmDialog id="user-disable" confirm={disabling ? USER_CONFIRM.disable(disabling) : null} busy={busy !== null} onConfirm={disable} onCancel={() => setDisabling(null)} />
    </section>
  );
}
