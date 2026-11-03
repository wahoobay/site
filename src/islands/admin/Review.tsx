// The review of one sighting (#/review/:id): its media (the saved clip, the photos; with several, which to keep), the
// clip's state, its facts, the conditions at its time (each asked for again on "Try again" when it failed), the
// species and sighting fields a reviewer may correct, and approve, reject and move to the recycle bin (reject, the
// move, and an approve that drops media after a confirm: a dropped item is deleted for good). Approving with unsaved
// changes saves them first. While a request is in flight every action is off. What shows and what is sent is
// src/lib/admin/sightings.mjs's; a 401 on any call, and any failed action, goes to the shell's notify.
import { useEffect, useState, type SubmitEvent } from 'react';
import arrowLeft from '@wahoobay/design/icons/arrow-left.svg?raw';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { SessionExpired } from '../../lib/java-api.mjs';
import {
  CONFIRM,
  FIELDS,
  approveRequest,
  clipLine,
  clipStatusRequest,
  clipSummary,
  deleteRequest,
  discardCount,
  editOutcome,
  editPayload,
  editRequest,
  environmentNode,
  environmentRequest,
  environmentSummary,
  factsNode,
  loadFailure,
  mediaNode,
  mediaOf,
  mediaPicker,
  mediaView,
  optionsFor,
  rejectRequest,
  reviewActions,
  reviewFields,
  savedSighting,
  sightingRequest,
  sightingRow,
  titleLineNode,
  type Field,
} from '../../lib/admin/sightings.mjs';
import { ConfirmDialog, send, useAnswer, useOneAtATime } from './shared';

const QUEUE = '#/queue';

/** Ask for the clip's state again while it is being saved. */
const clipPending = (value: unknown) => Boolean(clipSummary(value)?.pending);

export default function Review({ session, params, navigate, notify }: ScreenProps) {
  const id = params.id;
  const token = session.token;
  const [sighting, setSighting] = useState<any>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [round, setRound] = useState(0);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<string | number | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'reject' | 'delete' | null>(null);
  const [envRound, setEnvRound] = useState(0);
  const [clipRound, setClipRound] = useState(0);
  const { busy, run } = useOneAtATime();
  const environment = useAnswer(environmentRequest(id).path, token, notify, envRound);
  const clip = useAnswer(clipStatusRequest(id).path, token, notify, clipRound, clipPending);

  useEffect(() => {
    let alive = true;
    setFailure(null);
    send(sightingRequest(id), token)
      .then((s) => {
        if (!alive) return;
        setSighting(s);
        setFields(reviewFields(s));
        setKeep({});
        setShown(null);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        if (error instanceof SessionExpired) notify(error);
        else setFailure(error);
      });
    return () => {
      alive = false;
    };
  }, [id, token, round, notify]);

  const actions = reviewActions(session.user, sighting, busy !== null);
  const changes = sighting ? editPayload(sighting, fields) : null;

  /**
   * Save the changes, if any, and say what the server did (editOutcome: its `updated: false` is "Nothing was
   * changed"); once saved, the sighting is as the server has it. No changes: null.
   */
  const saveChanges = async () => {
    if (!changes) return null;
    const outcome = editOutcome(id, await send(editRequest(id, changes), token));
    if (outcome.saved) setSighting(savedSighting(sighting, changes));
    return outcome;
  };

  /** How many media this approve would drop: any, and it asks first (CONFIRM.approveDiscard). */
  const drops = sighting ? discardCount(sighting, keep) : 0;

  const approving = async () => {
    // Changes the server did not take are not approved over: the reviewer looks again first.
    const outcome = await saveChanges();
    if (outcome && !outcome.saved) {
      setConfirm(null);
      notify({ tone: 'error', text: `${outcome.text} It is not approved yet: check the fields, then approve again.` });
      return;
    }
    await send(approveRequest(sighting, keep), token);
    setConfirm(null);
    navigate(QUEUE);
    notify(`Sighting ${id} is approved.`);
  };

  /** Approve: at once when it drops nothing, else after the confirm (decide). */
  const approve = () => {
    if (drops > 0) {
      setConfirm('approve');
      return;
    }
    void run('approve', approving, notify);
  };

  const decide = () => {
    const kind = confirm;
    if (!kind) return;
    if (kind === 'approve') {
      void run('approve', approving, (error) => {
        setConfirm(null);
        notify(error);
      });
      return;
    }
    void run(
      kind,
      async () => {
        await send(kind === 'reject' ? rejectRequest(id) : deleteRequest(id), token);
        setConfirm(null);
        navigate(QUEUE);
        notify(kind === 'reject' ? `Sighting ${id} is rejected and in the recycle bin.` : `Sighting ${id} is in the recycle bin.`);
      },
      (error) => {
        setConfirm(null);
        notify(error);
      },
    );
  };

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!changes) return;
    void run(
      'save',
      async () => {
        const outcome = await saveChanges();
        if (outcome) notify(outcome.text);
      },
      notify,
    );
  };

  const back = (
    <a className="wb-back" href={QUEUE}>
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: arrowLeft.trim() }} /> Review queue
    </a>
  );

  if (!sighting) {
    const failed = failure ? loadFailure(id, failure) : null;
    return (
      <section className="site-admin__screen" aria-labelledby="review-title">
        {back}
        <h2 id="review-title">Sighting {id}</h2>
        {failed ? (
          <div className="wb-notice wb-notice--error site-admin__notice" role="alert">
            <p>{failed.text}</p>
            {failed.retry && (
              <button className="wb-btn wb-btn--action" type="button" onClick={() => setRound((n) => n + 1)}>
                Try again
              </button>
            )}
          </div>
        ) : (
          <p role="status">Loading the sighting…</p>
        )}
      </section>
    );
  }

  const row = sightingRow(sighting, token);
  const media = mediaOf(sighting);
  const hero = media.find((m) => String(m.media_id) === String(shown)) ?? media[0] ?? null;
  const hasSpecies = sighting.species_id !== null && sighting.species_id !== undefined;
  // What to say about the saved clip, if anything: nothing for a photo or no media (no clip is ever saved for those).
  const clipNow = clipLine(clip, sighting);
  const off = !actions.edit.enabled;

  const field = (f: Field) => {
    const fieldId = `review-${f.key}`;
    const value = fields[f.key] ?? '';
    const set = (next: string) => setFields((was) => ({ ...was, [f.key]: next }));
    return (
      <div className={f.kind === 'textarea' ? 'wb-field site-admin__wide' : 'wb-field'} key={f.key}>
        <label className="wb-label" htmlFor={fieldId}>{f.label}</label>
        {f.kind === 'select' ? (
          <select className="wb-select" id={fieldId} value={value} disabled={off} onChange={(e) => set(e.target.value)}>
            {optionsFor(f, value).map((o) => (
              <option key={o} value={o}>{o || 'Not set'}</option>
            ))}
          </select>
        ) : f.kind === 'textarea' ? (
          <textarea className="wb-textarea" id={fieldId} value={value} disabled={off} onChange={(e) => set(e.target.value)} />
        ) : (
          <input className="wb-input" id={fieldId} type="text" value={value} disabled={off} onChange={(e) => set(e.target.value)} />
        )}
      </div>
    );
  };

  return (
    <section className="site-admin__screen" aria-labelledby="review-title">
      {back}
      <h2 id="review-title">Sighting {id}</h2>
      {toReact(titleLineNode(row))}

      <div className="site-admin__review">
        <div className="site-admin__column">
          <h3>Media</h3>
          {toReact(mediaNode(mediaView(hero, token)))}
          {toReact(
            mediaPicker(media, {
              active: hero?.media_id ?? null,
              keep,
              token,
              onShow: (mediaId) => setShown(mediaId),
              onKeep: (mediaId, on) => setKeep((was) => ({ ...was, [String(mediaId)]: on })),
            }),
          )}
          {clipNow?.kind === 'failed' ? (
            <div className="wb-notice wb-notice--error site-admin__notice" role="alert">
              <p>The clip's state did not load.</p>
              <button className="wb-btn wb-btn--action" type="button" onClick={() => setClipRound((n) => n + 1)}>
                Try again<span className="wb-sr-only"> to check the clip</span>
              </button>
            </div>
          ) : (
            clipNow && <p role="status">{clipNow.text}</p>
          )}
        </div>
        <div className="site-admin__column">
          <h3>Details</h3>
          {toReact(factsNode(sighting))}
          <h3>Conditions at the time</h3>
          {environment.state === 'done' ? (
            toReact(environmentNode(environmentSummary(environment.value)))
          ) : environment.state === 'failed' ? (
            <div className="wb-notice wb-notice--error site-admin__notice" role="alert">
              <p>The conditions did not load.</p>
              <button className="wb-btn wb-btn--action" type="button" onClick={() => setEnvRound((n) => n + 1)}>
                Try again<span className="wb-sr-only"> to load the conditions</span>
              </button>
            </div>
          ) : (
            <p role="status">Checking the sensors…</p>
          )}
        </div>
      </div>

      {actions.edit.shown && (
        <form className="site-admin__edit" noValidate aria-busy={busy === 'save'} onSubmit={save}>
          <h3>Identification</h3>
          {hasSpecies ? (
            <div className="site-admin__fields" role="group" aria-labelledby="review-species">
              <h4 className="site-admin__wide" id="review-species">The species</h4>
              <p className="site-admin__wide">A change here changes the species for every sighting of it.</p>
              {FIELDS.filter((f) => f.group === 'species').map(field)}
            </div>
          ) : (
            <p>This sighting has no species yet, so there is no species to correct here.</p>
          )}
          <div className="site-admin__fields" role="group" aria-labelledby="review-sighting">
            <h4 className="site-admin__wide" id="review-sighting">This sighting</h4>
            {FIELDS.filter((f) => f.group === 'sighting').map(field)}
          </div>
          <div>
            <button className={`wb-btn wb-btn--ghost${busy === 'save' ? ' wb-btn--busy' : ''}`} type="submit" disabled={off || !changes}>
              {busy === 'save' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {(actions.approve.shown || actions.reject.shown || actions.delete.shown) && (
        <div className="site-admin__decide">
          <h3>Decision</h3>
          {actions.approve.shown && changes && <p>Approving saves your changes first.</p>}
          <div className="site-admin__actions">
            {actions.approve.shown && (
              <button className={`wb-btn wb-btn--action${busy === 'approve' ? ' wb-btn--busy' : ''}`} type="button" disabled={!actions.approve.enabled} onClick={approve}>
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </button>
            )}
            {actions.reject.shown && (
              <button className="wb-btn wb-btn--ghost" type="button" disabled={!actions.reject.enabled} onClick={() => setConfirm('reject')}>
                Reject
              </button>
            )}
            {actions.delete.shown && (
              <button className="wb-btn wb-btn--ghost" type="button" disabled={!actions.delete.enabled} onClick={() => setConfirm('delete')}>
                Move to recycle bin
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        id="review-confirm"
        confirm={
          confirm === 'approve' ? CONFIRM.approveDiscard(id, drops) : confirm === 'reject' ? CONFIRM.reject(id) : confirm === 'delete' ? CONFIRM.delete(id) : null
        }
        busy={busy !== null}
        onConfirm={decide}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
