// What the admin's screens (src/islands/admin/*.tsx) share: a request sent with the reviewer's token, a page of a list
// and an answer from the Java API (asked again while it says to), one action at a time, and the confirm dialog
// (.wb-dialog, the native <dialog>). Each hook hands a SessionExpired (any 401) to the shell's `notify`, which ends the
// session and returns to the sign-in; any other failure is the screen's to show. The decisions are the plain modules'
// (src/lib/admin/sightings.mjs, catalogue.mjs, housekeeping.mjs, lists.mjs).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SessionExpired, apiFetch } from '../../lib/java-api.mjs';
import { pageOf } from '../../lib/admin/sightings.mjs';

/** A request as sightings.mjs builds it. */
export interface ApiRequest {
  path: string;
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
}

type Notify = (notice: unknown) => void;

/**
 * The token for a public endpoint (GET /intake/status): apiFetch sends no Authorization header without one, so the
 * reviewer's token goes nowhere it is not needed.
 */
export const NO_TOKEN = '';

/** Send a request with the reviewer's token. */
export const send = (request: ApiRequest, token: string) =>
  apiFetch(request.path, { method: request.method, body: request.body, query: request.query, token });

/** How often, and how many times, an answer that says "ask again" is asked for again (the clip being saved). */
const AGAIN_MS = 3000;
const AGAIN_TRIES = 20;

/**
 * A page of a list: asked for whenever the request changes, and again on `reload`. A failure other than the end of the
 * session is kept in `error` for the screen's notice (listState). `answer` is the whole of the last answer, for what
 * comes with a page besides its rows (the media library's folder counts); it stays while the next page loads.
 */
export function usePagedList(request: ApiRequest, token: string, notify: Notify) {
  const [page, setPage] = useState<{ rows: any[]; total: number; answer: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [round, setRound] = useState(0);
  const key = JSON.stringify(request);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    send(request, token)
      .then((answer) => {
        if (alive) setPage({ ...pageOf(answer), answer });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        if (error instanceof SessionExpired) notify(error);
        else setError(error);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // `request` is in `key`.
  }, [key, token, round, notify]);
  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { rows: page?.rows ?? [], total: page?.total ?? 0, answer: page?.answer ?? null, loading, error, reload };
}

export type Answer = { state: 'loading' } | { state: 'failed'; error: unknown } | { state: 'done'; value: any };

/**
 * One answer from the API, asked for when the path or `round` changes; while `again(answer)` is true it is asked for
 * again every 3 s, 20 times at most. `again` must be a stable function (one defined outside the component).
 */
export function useAnswer(path: string, token: string, notify: Notify, round = 0, again?: (value: any) => boolean): Answer {
  const [answer, setAnswer] = useState<Answer>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setAnswer({ state: 'loading' });
    const ask = () => {
      apiFetch(path, { token })
        .then((value) => {
          if (!alive) return;
          setAnswer({ state: 'done', value });
          tries += 1;
          if (again?.(value) && tries < AGAIN_TRIES) timer = setTimeout(ask, AGAIN_MS);
        })
        .catch((error: unknown) => {
          if (!alive) return;
          if (error instanceof SessionExpired) notify(error);
          else setAnswer({ state: 'failed', error });
        });
    };
    ask();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [path, token, round, notify, again]);
  return answer;
}

/**
 * One action at a time: `busy` names the one in flight (null when none). A press while one is in flight does nothing;
 * the check is a ref, not the state, so a double click inside one frame is caught too.
 */
export function useOneAtATime() {
  const flying = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (name: string, work: () => Promise<void>, failed: (error: unknown) => void) => {
    if (flying.current) return;
    flying.current = true;
    setBusy(name);
    try {
      await work();
    } catch (error) {
      failed(error);
    } finally {
      flying.current = false;
      setBusy(null);
    }
  }, []);
  return { busy, run };
}

/** What a confirm dialog asks (CONFIRM in sightings.mjs). */
export interface Confirm {
  title: string;
  body: string;
  confirm: string;
}

/**
 * The confirm dialog: the native <dialog> as the design styles it, opened with showModal() while `confirm` is set
 * (so it traps the focus and Escape cancels it), Cancel first. While the action runs neither button can be pressed and
 * Escape does nothing.
 */
export function ConfirmDialog({ id, confirm, busy, onConfirm, onCancel }: { id: string; confirm: Confirm | null; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = confirm !== null;
  // Before the paint, so the box never shows empty while it closes.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="wb-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onCancel={(event) => {
      event.preventDefault();
      if (!busy) onCancel();
    }}>
      {confirm && (
        <>
          <h3 className="wb-dialog__title" id={`${id}-title`}>{confirm.title}</h3>
          <p id={`${id}-body`}>{confirm.body}</p>
          <div className="wb-dialog__actions">
            <button className="wb-btn wb-btn--ghost" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
            <button className={`wb-btn wb-btn--action${busy ? ' wb-btn--busy' : ''}`} type="button" disabled={busy} onClick={onConfirm}>
              {confirm.confirm}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
