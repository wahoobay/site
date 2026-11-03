// All sightings (#/sightings): every sighting not in the recycle bin, newest first (GET /admin/sightings), filtered by
// status and searched across the whole table (the search is sent once typing pauses, from the first page), each
// opening its review and each movable to the recycle bin after a confirm. The requests, the table, the pager and the
// sentences are src/lib/admin/sightings.mjs's; a 401 goes to the shell's notify, as does a failed move.
import { useEffect, useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { can } from '../../lib/admin/permissions.mjs';
import {
  CONFIRM,
  DEFAULT_LIMIT,
  SIGHTINGS_COLUMNS,
  STATUS_FILTERS,
  deleteRequest,
  listBody,
  listRequest,
  listState,
  pagerNode,
  sightingRow,
  sightingsEmpty,
  sightingsTable,
  type SightingRow,
} from '../../lib/admin/sightings.mjs';
import { ConfirmDialog, send, useOneAtATime, usePagedList } from './shared';

/** How long typing pauses before the search is sent. */
const SEARCH_PAUSE_MS = 300;

export default function Sightings({ session, notify }: ScreenProps) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('all');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [recycling, setRecycling] = useState<SightingRow | null>(null);
  const { busy, run } = useOneAtATime();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typed.trim() !== q.trim()) {
        setQ(typed);
        setOffset(0);
      }
    }, SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed, q]);

  const list = usePagedList(listRequest({ limit, offset, status, q }), session.token, notify);
  const state = listState({
    rows: list.rows,
    total: list.total,
    limit,
    offset,
    loading: list.loading,
    error: list.error,
    empty: sightingsEmpty({ status, q }),
    failed: 'The sightings did not load.',
  });

  useEffect(() => {
    if (state.refetchOffset !== null) setOffset(state.refetchOffset);
  }, [state.refetchOffset]);

  const mayRecycle = can(session.user, 'reviewSightings');
  const recycle = () => {
    const row = recycling;
    if (!row || row.id === null) return;
    void run(
      'recycle',
      async () => {
        await send(deleteRequest(row.id as number), session.token);
        setRecycling(null);
        notify(`Sighting ${row.id} is in the recycle bin.`);
        list.reload();
      },
      (error) => {
        setRecycling(null);
        notify(error);
      },
    );
  };

  return (
    <section className="site-admin__screen" aria-labelledby="sightings-title">
      <h2 id="sightings-title">All sightings</h2>
      <p>Every sighting outside the recycle bin, newest first. Open one to review or edit it.</p>
      <div className="wb-toolbar">
        <div className="wb-field">
          <label className="wb-label" htmlFor="sightings-search">Search sightings</label>
          <input
            className="wb-input"
            id="sightings-search"
            type="search"
            autoComplete="off"
            value={typed}
            aria-describedby="sightings-search-help"
            onChange={(e) => setTyped(e.target.value)}
          />
          <p className="wb-help" id="sightings-search-help">A species name, who sent it, or words from its note.</p>
        </div>
        <div className="wb-field">
          <label className="wb-label" htmlFor="sightings-status">Status</label>
          <select
            className="wb-select"
            id="sightings-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>
      {toReact(
        listBody(state, {
          onRetry: list.reload,
          table: () =>
            sightingsTable(list.rows.map((s) => sightingRow(s, session.token)), {
              caption: 'All sightings',
              columns: SIGHTINGS_COLUMNS,
              onRecycle: mayRecycle ? (row) => setRecycling(row) : undefined,
            }),
          pager: () =>
            pagerNode(state, {
              label: 'Pages of all sightings',
              limit,
              sizeId: 'sightings-page-size',
              onPage: setOffset,
              onLimit: (n) => {
                setLimit(n);
                setOffset(0);
              },
            }),
        }),
      )}
      <ConfirmDialog
        id="sightings-recycle"
        confirm={recycling && recycling.id !== null ? CONFIRM.delete(recycling.id) : null}
        busy={busy !== null}
        onConfirm={recycle}
        onCancel={() => setRecycling(null)}
      />
    </section>
  );
}
