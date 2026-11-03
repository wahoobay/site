// The activity log (#/activity): every change made in the review in the last 14 days, the latest first (GET /admin/log,
// the whole list, a page at a time here), and Undo where the server says a change can be undone, after a .wb-dialog
// confirm that names it. What shows and what is sent is src/lib/admin/housekeeping.mjs's; a 401 on any call, and a
// failed undo (already undone, past the window), goes to the shell's notify.
import { useEffect, useRef, useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { DEFAULT_LIMIT, listBody, listState, pagerNode } from '../../lib/admin/sightings.mjs';
import { pageSlice } from '../../lib/admin/lists.mjs';
import { ACTIVITY_EMPTY, UNDO_CONFIRM, activityActions, activityTable, logRequest, logRow, undoOutcome, undoRequest, type LogRow } from '../../lib/admin/housekeeping.mjs';
import { ConfirmDialog, send, useOneAtATime, usePagedList } from './shared';

export default function Activity({ session, notify }: ScreenProps) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [undoing, setUndoing] = useState<LogRow | null>(null);
  const [undone, setUndone] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const { busy, run } = useOneAtATime();
  const list = usePagedList(logRequest(), session.token, notify);

  // After an undo the row's button is gone from the reloaded log: the heading takes the focus.
  useEffect(() => {
    if (undone > 0) heading.current?.focus();
  }, [undone]);

  const page = pageSlice(list.rows, limit, offset).map(logRow);
  const state = listState({
    rows: page,
    total: list.rows.length,
    limit,
    offset,
    loading: list.loading,
    error: list.error,
    empty: ACTIVITY_EMPTY,
    failed: 'The activity log did not load.',
  });

  useEffect(() => {
    if (state.refetchOffset !== null) setOffset(state.refetchOffset);
  }, [state.refetchOffset]);

  const undo = () => {
    const row = undoing;
    if (!row || row.id === null) return;
    void run(
      'undo',
      async () => {
        await send(undoRequest(row.id as number), session.token);
        setUndoing(null);
        setUndone((n) => n + 1);
        notify(undoOutcome(row));
        list.reload();
      },
      (error) => {
        setUndoing(null);
        notify(error);
      },
    );
  };

  return (
    <section className="site-admin__screen" aria-labelledby="activity-title">
      <h2 id="activity-title" tabIndex={-1} ref={heading}>Activity</h2>
      <p>Every change made here in the last 14 days, the latest first, with who made it. A change that can be undone has its Undo for 14 days; a merge or a permanent delete has none.</p>
      {state.refresh && (
        <div className="wb-toolbar">
          <button className="wb-btn wb-btn--ghost" type="button" disabled={list.loading} onClick={list.reload}>
            Refresh
          </button>
        </div>
      )}
      {toReact(
        listBody(state, {
          onRetry: list.reload,
          loadingText: 'Loading the activity log…',
          table: () => activityTable(page, { actionsFor: (row) => activityActions(session.user, row, busy !== null), onUndo: (row) => setUndoing(row) }),
          pager: () =>
            pagerNode(state, {
              label: 'Pages of the activity log',
              limit,
              sizeId: 'activity-page-size',
              onPage: setOffset,
              onLimit: (n) => {
                setLimit(n);
                setOffset(0);
              },
            }),
        }),
      )}
      <ConfirmDialog id="activity-undo" confirm={undoing ? UNDO_CONFIRM(undoing) : null} busy={busy !== null} onConfirm={undo} onCancel={() => setUndoing(null)} />
    </section>
  );
}
