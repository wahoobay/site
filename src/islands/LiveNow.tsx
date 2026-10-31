// What the reef camera sees right now, under the camera page's player (/live/) and, compact, under the home band's
// still: the species seen in the last hour (GET /api/public/detections/summary?hours=1) as the design's species chips,
// the water sensors' latest reading (GET /api/public/environment/latest) as its stat tiles with the reading's age, and
// on /live/ the week's sightings (GET /api/public/species/counts?days=7&top=5) as its bar chart, drawn at the size the
// chart is shown (a ResizeObserver on its SVG), so the axis text keeps its token size, each species in its colour
// for the page's life (the ranking). Compact is the chips and the four
// tiles. At night (the camera's entry says `dark: true`) an hour with no sightings says the reef is dark, not that
// nothing was seen (Ruling 54). Hydrated when it scrolls into view (client:visible); it refreshes every 60 s, and waits while the page is
// hidden. While the camera is not live it renders nothing, and forgets its answers; until one answer has arrived it is
// an empty box, so a failed first fetch never says "Nothing seen"; a panel whose answer has not arrived yet is left
// out, and one whose refresh fails keeps what it showed (mergeAnswers, src/lib/live-status.mjs). The markup is
// renderState's (src/lib/live.mjs).
import { useEffect, useRef, useState } from 'react';
import { extendRanking } from '../lib/chart.mjs';
import { fetchJson } from '../lib/public-api.mjs';
import { panelsInterval, renderState } from '../lib/live.mjs';
import { mergeAnswers } from '../lib/live-status.mjs';
import { poll, toReact, useCameraState, useMeasuredSize } from './live-shared';

interface Props {
  /** The camera's id in the public API (REEF_CAMERA). */
  camera: string;
  /** The home band's panels: the chips and the four tiles, no chart. */
  compact?: boolean;
}

/** The panels' answers (mergeAnswers): each one that has arrived, those not arrived yet, and when. */
interface Answers {
  summary?: unknown;
  latest?: unknown;
  counts?: unknown;
  pending: string[];
  now: number;
}

export default function LiveNow({ camera, compact = false }: Props) {
  const { status, camera: entry } = useCameraState(camera);
  // A missing `dark` is not known, as null is: only true changes the hour panel's sentence.
  const dark = entry?.dark === true;
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [chartSize, chartRef] = useMeasuredSize();
  // The chart's colours (Ruling 50): the week's species order, taken from the first answer and grown at its end by
  // each later one, for the page's life, so a species keeps its colour from refresh to refresh.
  const ranking = useRef<string[]>([]);

  useEffect(() => {
    if (status !== 'live') {
      setAnswers(null);
      return;
    }
    return poll(async (signal) => {
      const asked = [
        fetchJson('/detections/summary?hours=1', { signal }),
        fetchJson('/environment/latest', { signal }),
        ...(compact ? [] : [fetchJson('/species/counts?days=7&top=5', { signal })]),
      ];
      const [summary, latest, counts] = await Promise.allSettled(asked);
      if (signal.aborted) return;
      if (counts?.status === 'fulfilled') ranking.current = extendRanking(ranking.current, counts.value);
      setAnswers((was: Answers | null) => mergeAnswers(was, compact ? { summary, latest } : { summary, latest, counts }, Date.now()) as Answers | null);
    }, panelsInterval);
  }, [status, compact]);

  // Live but nothing answered yet: still the empty box.
  const showing = status === 'live' && answers === null ? null : status;
  return toReact(renderState(showing, { compact, dark, ...answers, ranking: ranking.current, chartSize, chartRef }).panels);
}
