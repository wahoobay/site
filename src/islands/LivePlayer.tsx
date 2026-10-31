// The camera page's player (/live/), hydrated at once (client:load). While the camera is live (GET /api/public/cameras,
// shared with the badge and the panels: src/islands/live-shared.ts) it is the camera's MJPEG stream from the fish-ID
// app (PUBLIC_AI_URL), in the design's video frame, with the fish the camera names drawn over it: it asks
// GET /api/public/live every second for the current frame's detections and draws each as the design's detection box
// (.wb-detect), placed in percent of the frame. A box keeps its element while its fish stays put (boxKey), so the
// design's fade-in plays when a box appears and not on every poll. The boxes go when the frame has not changed for
// 3 s or a poll fails. Embed or offline, or once the stream fails to load, it is the YouTube embed from
// youtube-nocookie.com. Until the status is known it is the camera's still. While the page is hidden the polls wait and
// the frame shows the still, so a background tab does not keep downloading the stream. The markup is renderState's
// (src/lib/live.mjs); the island only fetches, measures and keeps state.
import { useEffect, useRef, useState } from 'react';
import { fetchJson, streamUrl } from '../lib/public-api.mjs';
import { isStale, pollInterval, renderState, type Detection, type Size } from '../lib/live.mjs';
import { poll, toReact, useCameraState, usePageHidden } from './live-shared';

interface Props {
  /** The camera's id in the public API (REEF_CAMERA). */
  camera: string;
  /** The fish-ID app's address for this build (src/lib/nav.mjs), where the stream is. */
  ai: string;
  /** The YouTube video the embed shows (the camera page's `video`). */
  embedId: string;
  /** The embed's title, for screen readers. */
  title: string;
}

interface Geometry {
  frame: Size;
  rendered: Size;
  em: number;
}

export default function LivePlayer({ camera, ai, embedId, title }: Props) {
  const { status, camera: entry } = useCameraState(camera);
  const hidden = usePageHidden();
  const [failed, setFailed] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const image = useRef<HTMLImageElement>(null);
  // A stream that fails to load in this browser is the embed for the rest of the visit.
  const showing = status === 'live' && failed ? 'embed' : status;
  const endpoint = showing === 'live' && !hidden ? (entry?.live ?? null) : null;

  useEffect(() => {
    if (!endpoint) {
      setDetections([]);
      return;
    }
    let frameId: unknown;
    let changedAt = Date.now();
    return poll(async (signal) => {
      try {
        const answer = await fetchJson(endpoint, { signal, timeoutMs: 3000 });
        const now = Date.now();
        if (answer?.frame_id !== frameId) {
          frameId = answer?.frame_id;
          changedAt = now;
        }
        // The stream reports no frame size, so the image's own is the frame's.
        const img = image.current;
        setGeometry(
          img && img.naturalWidth > 0
            ? {
                frame: { width: img.naturalWidth, height: img.naturalHeight },
                rendered: { width: img.clientWidth, height: img.clientHeight },
                em: Number.parseFloat(getComputedStyle(img).fontSize) || 16,
              }
            : null,
        );
        setDetections(isStale(changedAt, now) || !Array.isArray(answer?.detections) ? [] : answer.detections);
      } catch {
        if (!signal.aborted) setDetections([]);
      }
    }, pollInterval('live'));
  }, [endpoint]);

  const tree = renderState(showing, {
    embedId,
    title,
    stream: entry ? streamUrl(ai, entry.stream_mjpeg) : null,
    detections,
    frame: geometry?.frame,
    rendered: geometry?.rendered,
    em: geometry?.em,
    paused: hidden,
    streamRef: image,
    onStreamError: () => setFailed(true),
  });
  return toReact(tree.player);
}
