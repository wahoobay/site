// What the reef camera sees right now, under the camera page's player (/live/) and, compact, under the home band's
// still: the species seen in the last hour (GET /api/public/detections/summary?hours=1) as the design's species chips,
// the water sensors' latest reading (GET /api/public/environment/latest) as its stat tiles with the reading's age, and
// on /live/ the week's sightings (GET /api/public/species/counts?days=7&top=5) as its bar chart, drawn at the size the
// chart is shown (a ResizeObserver on its SVG), so the axis text keeps its token size. Compact is the chips and three
// tiles. Hydrated when it scrolls into view (client:visible); it refreshes every 60 s, and waits while the page is
// hidden. While the camera is not live it renders nothing, and forgets its answers; until one answer has arrived it is
// an empty box, so a failed first fetch never says "Nothing seen"; a panel whose answer has not arrived yet is left
// out, and one whose refresh fails keeps what it showed (mergeAnswers, src/lib/live-status.mjs). The markup is
// renderState's (src/lib/live.mjs).
import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../lib/public-api.mjs';
import { panelsInterval, renderState, type Size } from '../lib/live.mjs';
import { mergeAnswers } from '../lib/live-status.mjs';
import { poll, toReact, useCameraState } from './live-shared';

interface Props {
  /** The camera's id in the public API (REEF_CAMERA). */
  camera: string;
  /** The home band's panels: the chips and three tiles. */
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
  const { status } = useCameraState(camera);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [chartSize, setChartSize] = useState<Size | null>(null);

  const chartRef = useCallback((svg: SVGSVGElement | null) => {
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // No size (the SVG between layouts) is not a measurement.
      if (width <= 0 || height <= 0) return;
      setChartSize((was) => (was && was.width === width && was.height === height ? was : { width, height }));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

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
      setAnswers((was: Answers | null) => mergeAnswers(was, compact ? { summary, latest } : { summary, latest, counts }, Date.now()) as Answers | null);
    }, panelsInterval);
  }, [status, compact]);

  // Live but nothing answered yet: still the empty box.
  const showing = status === 'live' && answers === null ? null : status;
  return toReact(renderState(showing, { compact, ...answers, chartSize, chartRef }).panels);
}
