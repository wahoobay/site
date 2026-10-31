// The trends page's charts (/live/trends/): the range switch, the latest readings as tiles, the species seen per day
// or week and the water and weather history, from the public API on the site's own origin (the paths are
// src/lib/trends.mjs's). Hydrated when it scrolls into view (client:visible). The range is its state, 30 days to
// begin with; choosing one asks for that range's answers at once (one already fetched is drawn meanwhile), and the
// island asks again every ten minutes, waiting while the page is hidden (poll, src/lib/live-status.mjs). A failed
// fetch keeps what was drawn and the design's notice says so, once (mergeRound). Each chart is drawn at the size it
// is shown, a ResizeObserver on its SVG, so its axis text keeps its token size. The markup is renderState's.
import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../lib/public-api.mjs';
import { poll } from '../lib/live-status.mjs';
import { CHART_KEYS, DEFAULT_RANGE, REFRESH_MS, mergeRound, pathsOf, rangeOf, renderState, type Store } from '../lib/trends.mjs';
import { toReact } from './live-shared';

interface Size {
  width: number;
  height: number;
}

type Ref = (element: Element | null) => (() => void) | undefined;

/**
 * Each chart's SVG size as a ResizeObserver reports it, by the chart's key, and a ref for each key to put on the SVG;
 * a chart not measured yet has no size. No size (the element between layouts) is not a measurement.
 */
function useMeasuredSizes(keys: readonly string[]): [Record<string, Size>, Record<string, Ref>] {
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const refs = useMemo(
    () =>
      Object.fromEntries(
        keys.map((key): [string, Ref] => [
          key,
          (element) => {
            if (!element) return undefined;
            const observer = new ResizeObserver(([entry]) => {
              const { width, height } = entry.contentRect;
              if (width <= 0 || height <= 0) return;
              setSizes((was) => (was[key]?.width === width && was[key]?.height === height ? was : { ...was, [key]: { width, height } }));
            });
            observer.observe(element);
            return () => observer.disconnect();
          },
        ]),
      ),
    [keys],
  );
  return [sizes, refs];
}

export default function TrendsCharts() {
  const [range, setRange] = useState<string>(DEFAULT_RANGE);
  const [store, setStore] = useState<Store | null>(null);
  const [sizes, refs] = useMeasuredSizes(CHART_KEYS);

  useEffect(
    () =>
      poll(async (signal) => {
        const paths = pathsOf(rangeOf(range));
        const settled = await Promise.allSettled(paths.map((path) => fetchJson(path, { signal })));
        // A range chosen meanwhile (or the island going away) aborts the round: nothing to say then.
        if (signal.aborted) return;
        setStore((was) => mergeRound(was, paths.map((path, i): [string, PromiseSettledResult<unknown>] => [path, settled[i]]), Date.now()));
      }, REFRESH_MS),
    [range],
  );

  return toReact(renderState({ range, ...store, sizes, refs, onRange: setRange }));
}
