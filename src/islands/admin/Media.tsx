// The media library (#/media): a page at a time of the photos and clips (GET /admin/media), by folder (approved first,
// the server's default) and searched across the whole library once typing pauses. An approved item can be hidden from
// the public site or shown again (PATCH, reversible, so no confirm); any item can be deleted after a .wb-dialog
// confirm, which the server refuses (409, naming them) while a sighting outside the recycle bin uses it. What shows
// and what is sent is src/lib/admin/catalogue.mjs's; a 401 on any call, and any failed action, goes to the shell's
// notify.
import { useEffect, useRef, useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { DEFAULT_LIMIT, listBody, listState, pagerNode } from '../../lib/admin/sightings.mjs';
import { failureNotice } from '../../lib/admin/lists.mjs';
import {
  MEDIA_CONFIRM,
  folderOptions,
  mediaActions,
  mediaDeleteRequest,
  mediaEmpty,
  mediaListRequest,
  mediaRow,
  mediaTable,
  visibilityOutcome,
  visibilityRequest,
  type MediaRow,
} from '../../lib/admin/catalogue.mjs';
import { ConfirmDialog, send, useOneAtATime, usePagedList } from './shared';

/** How long typing pauses before the search is sent. */
const SEARCH_PAUSE_MS = 300;

export default function Media({ session, notify }: ScreenProps) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [folder, setFolder] = useState('all');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState<MediaRow | null>(null);
  const [deleted, setDeleted] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const { busy, run } = useOneAtATime();

  // After a delete the dialog hands the focus back to the row's button, which the reload removes: the heading takes it.
  useEffect(() => {
    if (deleted > 0) heading.current?.focus();
  }, [deleted]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typed.trim() !== q.trim()) {
        setQ(typed);
        setOffset(0);
      }
    }, SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed, q]);

  const list = usePagedList(mediaListRequest({ limit, offset, folder, q }), session.token, notify);
  const state = listState({
    rows: list.rows,
    total: list.total,
    limit,
    offset,
    loading: list.loading,
    error: list.error,
    empty: mediaEmpty({ folder, q }),
    failed: 'The media did not load.',
  });

  useEffect(() => {
    if (state.refetchOffset !== null) setOffset(state.refetchOffset);
  }, [state.refetchOffset]);

  // The folders' counts come with each page (the answer's `counts`), and stay while the next page loads.
  const answerCounts = list.answer && typeof list.answer.counts === 'object' ? (list.answer.counts as Record<string, unknown>) : null;

  const rows = list.rows.map((m) => mediaRow(m, session.token));

  const toggle = (row: MediaRow, isPublic: boolean) =>
    void run(
      'visibility',
      async () => {
        if (row.id === null) return;
        const answer = await send(visibilityRequest(row.id, isPublic), session.token);
        notify(visibilityOutcome(row.id, answer, isPublic));
        list.reload();
      },
      notify,
    );

  const remove = () => {
    const row = deleting;
    if (!row || row.id === null) return;
    void run(
      'delete',
      async () => {
        await send(mediaDeleteRequest(row.id as number), session.token);
        setDeleting(null);
        setDeleted((n) => n + 1);
        notify(`Media ${row.id} is deleted.`);
        list.reload();
      },
      (error) => {
        setDeleting(null);
        notify(failureNotice(error, `Media ${row.id}`));
      },
    );
  };

  return (
    <section className="site-admin__screen" aria-labelledby="media-title">
      <h2 id="media-title" tabIndex={-1} ref={heading}>Media</h2>
      <p>The photos and clips sent with sightings, newest first. Only media on an approved sighting can show on the public site; hide one to take it down.</p>
      <div className="wb-toolbar">
        <div className="wb-field">
          <label className="wb-label" htmlFor="media-search">Search media</label>
          <input
            className="wb-input"
            id="media-search"
            type="search"
            autoComplete="off"
            value={typed}
            aria-describedby="media-search-help"
            onChange={(e) => setTyped(e.target.value)}
          />
          <p className="wb-help" id="media-search-help">A species name, who sent it, or its file name.</p>
        </div>
        <div className="wb-field">
          <label className="wb-label" htmlFor="media-folder">Folder</label>
          <select
            className="wb-select"
            id="media-folder"
            value={folder}
            onChange={(e) => {
              setFolder(e.target.value);
              setOffset(0);
            }}
          >
            {folderOptions(answerCounts).map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>
      {toReact(
        listBody(state, {
          onRetry: list.reload,
          loadingText: 'Loading media…',
          table: () =>
            mediaTable(rows, {
              actionsFor: (row) => mediaActions(session.user, row, busy !== null),
              onVisibility: toggle,
              onDelete: (row) => setDeleting(row),
            }),
          pager: () =>
            pagerNode(state, {
              label: 'Pages of media',
              limit,
              sizeId: 'media-page-size',
              onPage: setOffset,
              onLimit: (n) => {
                setLimit(n);
                setOffset(0);
              },
            }),
        }),
      )}
      <ConfirmDialog
        id="media-delete"
        confirm={deleting ? MEDIA_CONFIRM.delete(deleting) : null}
        busy={busy !== null}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
