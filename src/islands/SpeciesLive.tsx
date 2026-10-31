// A species page's live numbers (/live/species/<slug>/, for a species with a fish-ID id): the species' profile on the
// fish-ID app (GET /api/public/species/{id}, on the site's own origin) as the three tiles, "When we see it" (the day's
// hours and the last twelve months as the design's bar charts, drawn at the size they are shown, a ResizeObserver on
// each SVG, so the axis text keeps its token size) and the twelve most recent crops, the page's own picture left out.
// Hydrated when it scrolls into view
// (client:visible); it asks once. Until the profile arrives it shows the page's own numbers, the snapshot it was built
// with (the server renders the same); when the fetch fails (fetchJson rejects with ApiError: a 404, a 5xx, no answer)
// those stay and the design's notice says so, once. A crop that does not load is left out. The markup is renderState's
// (src/lib/species-live.mjs).
import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../lib/public-api.mjs';
import { profilePath, renderState, type Numbers } from '../lib/species-live.mjs';
import { toReact, useMeasuredSize } from './live-shared';

interface Props {
  /** The species' id in the fish-ID app (src/data/fish.json's species_id), as it is: profilePath encodes it. */
  speciesId: string;
  /** The species as the page names it: its common name, else its Latin. */
  name: string;
  /** The page's numbers, from the snapshot it was built with. */
  snapshot: Numbers;
  /** The page's own picture's address: a recent crop that is it is not shown again. */
  hero?: string | null;
}

/** Not loaded yet, loaded (the profile and when it arrived), or failed. */
type Loaded = { status: null } | { status: 'ok'; profile: unknown; now: number } | { status: 'error' };

export default function SpeciesLive({ speciesId, name, snapshot, hero = null }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ status: null });
  const [failed, setFailed] = useState<string[]>([]);
  const [hourSize, hourRef] = useMeasuredSize();
  const [monthSize, monthRef] = useMeasuredSize();
  const onCropError = useCallback((src: string) => setFailed((was) => (was.includes(src) ? was : [...was, src])), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson(profilePath(speciesId), { signal: controller.signal })
      .then((profile) => setLoaded({ status: 'ok', profile, now: Date.now() }))
      .catch(() => {
        // The page going away aborts the fetch: nothing to say then.
        if (!controller.signal.aborted) setLoaded({ status: 'error' });
      });
    return () => controller.abort();
  }, [speciesId]);

  return toReact(renderState(loaded.status, { name, snapshot, hero, ...loaded, failed, onCropError, hourSize, hourRef, monthSize, monthRef }));
}
