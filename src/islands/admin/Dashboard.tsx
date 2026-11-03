// The dashboard (#/): whether the sighting form is open (the public GET /intake/status), the summary's counts as the
// design's figures (GET /admin/summary), and, for a user who may review, the newest sightings waiting for review
// (GET /admin/queue?limit=5, which needs reviewSightings: the dashboard's own viewData does not open it). What shows
// is src/lib/admin/housekeeping.mjs's; a 401 on any call goes to the shell's notify (useAnswer, usePagedList).
import { useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { QUEUE_COLUMNS, QUEUE_EMPTY, listBody, listState, sightingRow, sightingsTable } from '../../lib/admin/sightings.mjs';
import { plural } from '../../lib/admin/lists.mjs';
import { camerasText, dashboardFigures, dashboardQueueRequest, dashboardView, figuresNode, intakeNode, intakeStatusRequest, intakeView, summaryRequest } from '../../lib/admin/housekeeping.mjs';
import { NO_TOKEN, useAnswer, usePagedList } from './shared';

export default function Dashboard({ session, notify }: ScreenProps) {
  const [round, setRound] = useState(0);
  const summary = useAnswer(summaryRequest().path, session.token, notify, round);
  const intake = useAnswer(intakeStatusRequest().path, NO_TOKEN, notify, round);
  const view = dashboardView(session.user);

  return (
    <section className="site-admin__screen" aria-labelledby="dashboard-title">
      <h2 id="dashboard-title">Dashboard</h2>
      {intake.state === 'loading' ? (
        <p role="status">Checking the sighting form…</p>
      ) : (
        toReact(intakeNode(intakeView(intake.state === 'done' ? intake.value : null), { settingsHref: view.settings ? '#/settings' : null }))
      )}

      <div className="site-admin__column">
        <h3>Sightings and species</h3>
        {summary.state === 'loading' ? (
          <p role="status">Loading the counts…</p>
        ) : summary.state === 'failed' ? (
          <div className="wb-notice wb-notice--error site-admin__notice" role="alert">
            <p>The counts did not load.</p>
            <button className="wb-btn wb-btn--action" type="button" onClick={() => setRound((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {toReact(figuresNode(dashboardFigures(summary.value)))}
            {camerasText(summary.value) && <p>{camerasText(summary.value)}</p>}
          </>
        )}
      </div>

      {view.queue && <QueuePreview token={session.token} notify={notify} />}
    </section>
  );
}

/** The newest sightings waiting for review, and the way to the queue. */
function QueuePreview({ token, notify }: { token: string; notify: (notice: unknown) => void }) {
  const list = usePagedList(dashboardQueueRequest(), token, notify);
  const state = listState({
    rows: list.rows,
    total: list.rows.length,
    limit: Math.max(1, list.rows.length),
    offset: 0,
    loading: list.loading,
    error: list.error,
    empty: QUEUE_EMPTY,
    failed: 'The review queue did not load.',
  });
  return (
    <div className="site-admin__column">
      <h3>Waiting for review</h3>
      {toReact(
        listBody(state, {
          onRetry: list.reload,
          table: () => sightingsTable(list.rows.map((s) => sightingRow(s, token)), { caption: 'The newest sightings waiting for review', columns: QUEUE_COLUMNS }),
          pager: () => null,
        }),
      )}
      {list.total > 0 && (
        <p>
          <a href="#/queue">Open the review queue</a> ({plural(list.total, 'sighting', 'sightings')} waiting)
        </p>
      )}
    </div>
  );
}
