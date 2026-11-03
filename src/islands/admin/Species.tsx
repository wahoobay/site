// The species list (#/species): every species with a sighting or a media item, most seen first (GET /admin/species,
// the whole list at once), searched and filtered by category here, a page at a time, each opening its species. The
// request, the rows, the table and the sentences are src/lib/admin/catalogue.mjs's; a 401 goes to the shell's notify
// (usePagedList).
import { useEffect, useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { DEFAULT_LIMIT, listBody, listState, pagerNode } from '../../lib/admin/sightings.mjs';
import { pageSlice } from '../../lib/admin/lists.mjs';
import { SPECIES_CATEGORY_FILTERS, filterSpecies, speciesEmpty, speciesListRequest, speciesRow, speciesTable } from '../../lib/admin/catalogue.mjs';
import { usePagedList } from './shared';

export default function Species({ session, notify }: ScreenProps) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const list = usePagedList(speciesListRequest(), session.token, notify);
  const shown = filterSpecies(list.rows, { q, category });
  const page = pageSlice(shown, limit, offset);
  const state = listState({
    rows: page,
    total: shown.length,
    limit,
    offset,
    loading: list.loading,
    error: list.error,
    empty: speciesEmpty({ q, category }),
    failed: 'The species did not load.',
  });

  useEffect(() => {
    if (state.refetchOffset !== null) setOffset(state.refetchOffset);
  }, [state.refetchOffset]);

  return (
    <section className="site-admin__screen" aria-labelledby="species-title">
      <h2 id="species-title">Species</h2>
      <p>Every species with a sighting or a picture, most seen first. Open one to correct it, choose its picture, or merge it into another.</p>
      <div className="wb-toolbar">
        <div className="wb-field">
          <label className="wb-label" htmlFor="species-search">Search species</label>
          <input
            className="wb-input"
            id="species-search"
            type="search"
            autoComplete="off"
            value={q}
            aria-describedby="species-search-help"
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
          />
          <p className="wb-help" id="species-search-help">A common or scientific name, a family or a genus.</p>
        </div>
        <div className="wb-field">
          <label className="wb-label" htmlFor="species-category">Category</label>
          <select
            className="wb-select"
            id="species-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setOffset(0);
            }}
          >
            {SPECIES_CATEGORY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        {state.refresh && (
          <button className="wb-btn wb-btn--ghost" type="button" disabled={list.loading} onClick={list.reload}>
            Refresh
          </button>
        )}
      </div>
      {toReact(
        listBody(state, {
          onRetry: list.reload,
          loadingText: 'Loading species…',
          table: () => speciesTable(page.map((s) => speciesRow(s, session.token))),
          pager: () =>
            pagerNode(state, {
              label: 'Pages of species',
              limit,
              sizeId: 'species-page-size',
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
