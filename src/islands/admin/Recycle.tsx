// The recycle bin (#/recycle): every rejected or deleted sighting, the latest first (GET /admin/recycle, the whole list,
// a page at a time here). Restore and Delete permanently act on the checked rows, on any page, each after a .wb-dialog
// confirm that names the count. What shows and what is sent is src/lib/admin/housekeeping.mjs's; a 401 on any call,
// and any failed action, goes to the shell's notify.
import { useEffect, useRef, useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { DEFAULT_LIMIT, listBody, listState, pagerNode } from '../../lib/admin/sightings.mjs';
import { checked, checkedAll, pageSlice, plural, selectionOf, stillThere } from '../../lib/admin/lists.mjs';
import { RECYCLE_CONFIRM, RECYCLE_EMPTY, purgeRequest, recycleActions, recycleOutcome, recycleRequest, recycleRow, recycleTable, restoreRequest } from '../../lib/admin/housekeeping.mjs';
import { ConfirmDialog, send, useOneAtATime, usePagedList } from './shared';

export default function Recycle({ session, notify }: ScreenProps) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<'restore' | 'purge' | null>(null);
  const [done, setDone] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const { busy, run } = useOneAtATime();
  const list = usePagedList(recycleRequest(), session.token, notify);

  // After a restore or a purge the dialog hands the focus back to its button, which may now be off: the heading takes it.
  useEffect(() => {
    if (done > 0) heading.current?.focus();
  }, [done]);

  // Only rows still in the bin stay checked.
  const allIds = list.rows.map((r) => r?.sighting_id).join(',');
  useEffect(() => {
    setSelected((was) => {
      const next = stillThere(was, allIds ? allIds.split(',') : []);
      return next.length === was.length ? was : next;
    });
  }, [allIds]);

  const page = pageSlice(list.rows, limit, offset).map((r) => recycleRow(r, session.token));
  const state = listState({
    rows: page,
    total: list.rows.length,
    limit,
    offset,
    loading: list.loading,
    error: list.error,
    empty: RECYCLE_EMPTY,
    failed: 'The recycle bin did not load.',
  });

  useEffect(() => {
    if (state.refetchOffset !== null) setOffset(state.refetchOffset);
  }, [state.refetchOffset]);

  const actions = recycleActions(session.user, selected, busy !== null);
  const pageIds = page.map((r) => r.id);
  const selection = selectionOf(selected, pageIds);

  const act = () => {
    const kind = confirm;
    if (!kind) return;
    const request = kind === 'restore' ? restoreRequest(selected) : purgeRequest(selected);
    if (!request) return;
    const asked = request.body.ids.length;
    void run(
      kind,
      async () => {
        const answer = await send(request, session.token);
        setConfirm(null);
        setSelected([]);
        setDone((n) => n + 1);
        notify(recycleOutcome(kind, answer, asked));
        list.reload();
      },
      (error) => {
        setConfirm(null);
        notify(error);
      },
    );
  };

  return (
    <section className="site-admin__screen" aria-labelledby="recycle-title">
      <h2 id="recycle-title" tabIndex={-1} ref={heading}>Recycle bin</h2>
      <p>Sightings that were rejected or moved here, the latest first. Restore puts them back; a rejected one returns to the review queue. Delete permanently removes them for good.</p>
      <div className="wb-toolbar">
        {page.length > 0 && actions.restore.shown && (
          <span className="site-admin__check">
            <input
              type="checkbox"
              id="recycle-all"
              checked={selection.all}
              disabled={busy !== null}
              onChange={(e) => setSelected((was) => checkedAll(was, pageIds, e.target.checked))}
            />
            <label htmlFor="recycle-all">Check every sighting on this page</label>
          </span>
        )}
        {actions.restore.shown && <span role="status">{selection.count ? `${plural(selection.count, 'sighting', 'sightings')} checked` : 'None checked'}</span>}
        {actions.restore.shown && (
          <button className="wb-btn wb-btn--action" type="button" disabled={!actions.restore.enabled} onClick={() => setConfirm('restore')}>
            Restore
          </button>
        )}
        {actions.purge.shown && (
          <button className="wb-btn wb-btn--ghost" type="button" disabled={!actions.purge.enabled} onClick={() => setConfirm('purge')}>
            Delete permanently
          </button>
        )}
        <button className="wb-btn wb-btn--ghost" type="button" disabled={list.loading} onClick={list.reload}>
          Refresh
        </button>
      </div>
      {toReact(
        listBody(state, {
          onRetry: list.reload,
          loadingText: 'Loading the recycle bin…',
          table: () =>
            recycleTable(page, {
              selected,
              enabled: actions.restore.shown && busy === null,
              onSelect: (id, on) => setSelected((was) => checked(was, id, on)),
            }),
          pager: () =>
            pagerNode(state, {
              label: 'Pages of the recycle bin',
              limit,
              sizeId: 'recycle-page-size',
              onPage: setOffset,
              onLimit: (n) => {
                setLimit(n);
                setOffset(0);
              },
            }),
        }),
      )}
      <ConfirmDialog
        id="recycle-confirm"
        confirm={confirm === 'restore' ? RECYCLE_CONFIRM.restore(selected.length) : confirm === 'purge' ? RECYCLE_CONFIRM.purge(selected.length) : null}
        busy={busy !== null}
        onConfirm={act}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
