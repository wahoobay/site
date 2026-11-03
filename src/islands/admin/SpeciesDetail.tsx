// One species (#/species/:id): its picture and facts, the fields a reviewer may correct (a scientific name another
// species has offers a merge instead), its sightings a page at a time (each opening its review, its media pinnable as
// the species' picture, any of them movable to another species), and a merge into another species or a delete. The
// move, the merge and the delete each ask first in a .wb-dialog that says what they will do. What shows and what is
// sent is src/lib/admin/catalogue.mjs's; a 401 on any call, and any failed action, goes to the shell's notify.
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import arrowLeft from '@wahoobay/design/icons/arrow-left.svg?raw';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { SessionExpired } from '../../lib/java-api.mjs';
import { DEFAULT_LIMIT, listBody, listState, mediaNode, mediaView, pagerNode } from '../../lib/admin/sightings.mjs';
import { checked, failureNotice, plural, stillThere } from '../../lib/admin/lists.mjs';
import {
  DELETE_MODES,
  SPECIES_CONFIRM,
  SPECIES_FIELDS,
  SPECIES_SIGHTINGS_EMPTY,
  factsList,
  heroRequest,
  mergeRequest,
  moveRequest,
  refreshedFields,
  speciesActions,
  speciesChoices,
  speciesDeleteRequest,
  speciesDetailRequest,
  speciesEditOutcome,
  speciesEditPayload,
  speciesEditRequest,
  speciesFacts,
  speciesHref,
  speciesListRequest,
  speciesLoadFailure,
  speciesOptions,
  speciesSightingRow,
  speciesSightingsRequest,
  speciesSightingsTable,
  speciesSummary,
  type SpeciesField,
  type SpeciesSightingRow,
} from '../../lib/admin/catalogue.mjs';
import { ConfirmDialog, send, useAnswer, useOneAtATime, usePagedList } from './shared';

const LIST = '#/species';

export default function SpeciesDetail({ session, params, navigate, notify }: ScreenProps) {
  const id = params.id;
  const token = session.token;
  const [detail, setDetail] = useState<any>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [round, setRound] = useState(0);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [moveTo, setMoveTo] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [mode, setMode] = useState<string>(DELETE_MODES[0].value);
  const [confirm, setConfirm] = useState<'merge' | 'move' | 'delete' | null>(null);
  const { busy, run } = useOneAtATime();
  const list = usePagedList(speciesSightingsRequest(id, { limit, offset }), token, notify);
  const others = useAnswer(speciesListRequest().path, token, notify);
  // The species the form was last filled from, and whether the next load follows a save (refreshedFields).
  const shown = useRef<any>(null);
  const saved = useRef(false);

  useEffect(() => {
    let alive = true;
    setFailure(null);
    send(speciesDetailRequest(id), token)
      .then((d) => {
        if (!alive) return;
        const before = shown.current;
        const afterSave = saved.current;
        saved.current = false;
        shown.current = d;
        setDetail(d);
        setFields((was) => refreshedFields(before, was, d, afterSave));
      })
      .catch((error: unknown) => {
        if (!alive) return;
        saved.current = false;
        if (error instanceof SessionExpired) notify(error);
        // Once the species shows, a reload that fails (after a save, a pin or a move) is a notice; the page stays.
        else if (shown.current) notify({ tone: 'error', text: speciesLoadFailure(id, error).text });
        else setFailure(error);
      });
    return () => {
      alive = false;
    };
  }, [id, token, round, notify]);

  // Only rows still listed stay checked (another page, or a move, takes them off).
  const rowIds = list.rows.map((r) => r?.sighting_id).join(',');
  useEffect(() => {
    setSelected((was) => {
      const next = stillThere(was, rowIds ? rowIds.split(',') : []);
      return next.length === was.length ? was : next;
    });
  }, [rowIds]);

  const state = listState({
    rows: list.rows,
    total: list.total,
    limit,
    offset,
    loading: list.loading,
    error: list.error,
    empty: SPECIES_SIGHTINGS_EMPTY,
    failed: 'Its sightings did not load.',
  });
  useEffect(() => {
    if (state.refetchOffset !== null) setOffset(state.refetchOffset);
  }, [state.refetchOffset]);

  const back = (
    <a className="wb-back" href={LIST}>
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: arrowLeft.trim() }} /> Species
    </a>
  );

  if (!detail) {
    const failed = failure ? speciesLoadFailure(id, failure) : null;
    return (
      <section className="site-admin__screen" aria-labelledby="species-detail-title">
        {back}
        <h2 id="species-detail-title">Species {id}</h2>
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
          <p role="status">Loading the species…</p>
        )}
      </section>
    );
  }

  const summary = speciesSummary(detail);
  const actions = speciesActions(session.user, busy !== null);
  const changes = speciesEditPayload(detail, fields);
  const choices = speciesChoices(others.state === 'done' ? others.value : null, id);
  const choiceName = (value: string) => choices.find((c) => String(c.id) === value)?.label ?? `species ${value}`;
  const rows: SpeciesSightingRow[] = list.rows.map((r) => speciesSightingRow(r, token, summary.heroId));
  const choicesNote = others.state === 'loading' ? 'Loading the species…' : others.state === 'failed' ? 'The other species did not load.' : null;

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!changes) return;
    void run(
      'save',
      async () => {
        const outcome = speciesEditOutcome(await send(speciesEditRequest(id, changes), token));
        if (!outcome.saved) {
          if (outcome.merge) setMergeTo(String(outcome.merge.id));
          notify({ tone: 'error', text: outcome.text });
          return;
        }
        saved.current = true;
        setRound((n) => n + 1);
        notify(outcome.text);
      },
      notify,
    );
  };

  const pin = (row: SpeciesSightingRow) =>
    void run(
      'hero',
      async () => {
        const next = row.hero ? null : row.mediaId;
        await send(heroRequest(id, next), token);
        setRound((n) => n + 1);
        notify(next === null ? 'The species picture is cleared.' : `The media of sighting ${row.id} is the species picture now.`);
      },
      notify,
    );

  const decide = () => {
    const kind = confirm;
    if (!kind) return;
    const merge = kind === 'merge' ? mergeRequest(id, mergeTo) : null;
    const move = kind === 'move' ? moveRequest(moveTo, selected) : null;
    // No species chosen, or nothing checked: nothing to send (the buttons are off then, but the dialog must not stay).
    if ((kind === 'merge' && !merge) || (kind === 'move' && !move)) {
      setConfirm(null);
      return;
    }
    void run(
      kind,
      async () => {
        if (merge) {
          await send(merge, token);
          setConfirm(null);
          navigate(speciesHref(merge.body.into));
          notify(`${summary.name} is merged into ${choiceName(mergeTo)}.`);
        } else if (move) {
          const answer = await send(move, token);
          const moved = typeof answer?.moved === 'number' ? answer.moved : move.body.sighting_ids.length;
          setConfirm(null);
          setSelected([]);
          setMoveTo('');
          list.reload();
          setRound((n) => n + 1);
          notify(`Moved ${plural(moved, 'sighting', 'sightings')} to ${choiceName(moveTo)}. You can undo it in the activity log.`);
        } else {
          await send(speciesDeleteRequest(id, mode), token);
          setConfirm(null);
          navigate(LIST);
          notify(`${summary.name} is deleted.`);
        }
      },
      (error) => {
        setConfirm(null);
        notify(kind === 'delete' ? failureNotice(error, summary.name) : error);
      },
    );
  };

  const off = !actions.edit.enabled;
  const field = (f: SpeciesField) => {
    const fieldId = `species-${f.key}`;
    const value = fields[f.key] ?? '';
    const set = (next: string) => setFields((was) => ({ ...was, [f.key]: next }));
    return (
      <div className="wb-field" key={f.key}>
        <label className="wb-label" htmlFor={fieldId}>{f.label}</label>
        {f.kind === 'select' ? (
          <select className="wb-select" id={fieldId} value={value} disabled={off} onChange={(e) => set(e.target.value)}>
            {speciesOptions(f, value).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input className="wb-input" id={fieldId} type="text" value={value} disabled={off} onChange={(e) => set(e.target.value)} />
        )}
      </div>
    );
  };

  const choiceOptions = (none: string) => [
    <option key="" value="">{choicesNote ?? none}</option>,
    ...choices.map((c) => (
      <option key={c.id} value={String(c.id)}>{c.label}</option>
    )),
  ];

  const dialog =
    confirm === 'merge'
      ? SPECIES_CONFIRM.merge(summary.name, choiceName(mergeTo), summary.sightings)
      : confirm === 'move'
        ? SPECIES_CONFIRM.move(selected.length, summary.name, choiceName(moveTo))
        : confirm === 'delete'
          ? SPECIES_CONFIRM.delete(summary.name, mode, summary.sightings)
          : null;

  return (
    <section className="site-admin__screen" aria-labelledby="species-detail-title">
      {back}
      <h2 id="species-detail-title">{summary.name}</h2>
      {(summary.scientific || summary.provisional) && (
        <p className="site-admin__title-line">
          {summary.scientific && <i>{summary.scientific}</i>}
          {summary.scientific && summary.provisional && ' '}
          {summary.provisional && <strong>Provisional name: a visitor's guess.</strong>}
        </p>
      )}

      <div className="site-admin__review">
        <div className="site-admin__column">
          <h3>Picture</h3>
          {summary.hero ? toReact(mediaNode(mediaView(summary.hero, token))) : <p>No picture is pinned. Choose one from its sightings below.</p>}
        </div>
        <div className="site-admin__column">
          <h3>Details</h3>
          {toReact(factsList(speciesFacts(summary)))}
        </div>
      </div>

      {actions.edit.shown && (
        <form className="site-admin__edit" noValidate aria-busy={busy === 'save'} onSubmit={save}>
          <h3>Correct the species</h3>
          <p>A change here changes the species for every sighting of it.</p>
          <div className="site-admin__fields">{SPECIES_FIELDS.map(field)}</div>
          <div>
            <button className={`wb-btn wb-btn--action${busy === 'save' ? ' wb-btn--busy' : ''}`} type="submit" disabled={off || !changes}>
              {busy === 'save' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      <div className="site-admin__column">
        <h3>Its sightings</h3>
        <p>Check sightings to move them to another species. Species picture makes a sighting's media the picture of the species.</p>
        {actions.move.shown && (
          <div className="wb-toolbar">
            <div className="wb-field">
              <label className="wb-label" htmlFor="species-move-to">Move the checked sightings to</label>
              <select className="wb-select" id="species-move-to" value={moveTo} disabled={!actions.move.enabled || choices.length === 0} onChange={(e) => setMoveTo(e.target.value)}>
                {choiceOptions('Choose a species')}
              </select>
            </div>
            <button className="wb-btn wb-btn--ghost" type="button" disabled={!actions.move.enabled || !moveTo || selected.length === 0} onClick={() => setConfirm('move')}>
              {selected.length ? `Move ${plural(selected.length, 'sighting', 'sightings')}` : 'Move'}
            </button>
          </div>
        )}
        {toReact(
          listBody(state, {
            onRetry: list.reload,
            table: () =>
              speciesSightingsTable(rows, {
                selected,
                enabled: actions.move.enabled,
                onSelect: (sid, on) => setSelected((was) => checked(was, sid, on)),
                onHero: pin,
              }),
            pager: () =>
              pagerNode(state, {
                label: 'Pages of its sightings',
                limit,
                sizeId: 'species-sightings-page-size',
                onPage: setOffset,
                onLimit: (n) => {
                  setLimit(n);
                  setOffset(0);
                },
              }),
          }),
        )}
      </div>

      {(actions.merge.shown || actions.delete.shown) && (
        <div className="site-admin__decide">
          <h3>Merge or delete</h3>
          {actions.merge.shown && (
            <div className="wb-toolbar">
              <div className="wb-field">
                <label className="wb-label" htmlFor="species-merge-into">Merge this species into</label>
                <select className="wb-select" id="species-merge-into" value={mergeTo} disabled={!actions.merge.enabled || choices.length === 0} onChange={(e) => setMergeTo(e.target.value)}>
                  {choiceOptions('Choose a species')}
                </select>
              </div>
              <button className="wb-btn wb-btn--ghost" type="button" disabled={!actions.merge.enabled || !mergeTo} onClick={() => setConfirm('merge')}>
                Merge
              </button>
            </div>
          )}
          {actions.delete.shown && (
            <div className="wb-toolbar">
              <div className="wb-field">
                <label className="wb-label" htmlFor="species-delete-mode">When it is deleted</label>
                <select className="wb-select" id="species-delete-mode" value={mode} disabled={!actions.delete.enabled} onChange={(e) => setMode(e.target.value)}>
                  {DELETE_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <button className="wb-btn wb-btn--ghost" type="button" disabled={!actions.delete.enabled} onClick={() => setConfirm('delete')}>
                Delete species
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog id="species-confirm" confirm={dialog} busy={busy !== null} onConfirm={decide} onCancel={() => setConfirm(null)} />
    </section>
  );
}
