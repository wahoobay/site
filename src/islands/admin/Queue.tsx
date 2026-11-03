// The review queue (#/queue): the sightings waiting for a decision, newest first (GET /admin/queue), a page at a time,
// each opening its review. The table, the pager, the empty sentence and the notice with its retry are
// src/lib/admin/sightings.mjs's; a 401 goes to the shell's notify (usePagedList).
import { useEffect, useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { DEFAULT_LIMIT, QUEUE_COLUMNS, QUEUE_EMPTY, listBody, listState, pagerNode, queueRequest, sightingRow, sightingsTable } from '../../lib/admin/sightings.mjs';
import { usePagedList } from './shared';

export default function Queue({ session, notify }: ScreenProps) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const list = usePagedList(queueRequest({ limit, offset }), session.token, notify);
  const state = listState({
    rows: list.rows,
    total: list.total,
    limit,
    offset,
    loading: list.loading,
    error: list.error,
    empty: QUEUE_EMPTY,
    failed: 'The review queue did not load.',
  });

  // A page past the end (its last sighting was just decided) gives way to the last page.
  useEffect(() => {
    if (state.refetchOffset !== null) setOffset(state.refetchOffset);
  }, [state.refetchOffset]);

  return (
    <section className="site-admin__screen" aria-labelledby="queue-title">
      <h2 id="queue-title">Review queue</h2>
      <p>The sightings visitors sent that wait for a decision, newest first. Open one to approve or reject it.</p>
      <div className="wb-toolbar">
        <button className="wb-btn wb-btn--ghost" type="button" disabled={list.loading} onClick={list.reload}>
          Refresh
        </button>
      </div>
      {toReact(
        listBody(state, {
          onRetry: list.reload,
          table: () => sightingsTable(list.rows.map((s) => sightingRow(s, session.token)), { caption: 'Sightings waiting for review', columns: QUEUE_COLUMNS }),
          pager: () =>
            pagerNode(state, {
              label: 'Pages of the review queue',
              limit,
              sizeId: 'queue-page-size',
              onPage: setOffset,
              onLimit: (n) => {
                setLimit(n);
                setOffset(0);
              },
            }),
        }),
      )}
    </section>
  );
}
