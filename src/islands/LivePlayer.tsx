// The camera page's player (/live/), hydrated at once (client:load). While the camera is live (GET /api/public/cameras,
// shared with the badge and the panels: src/islands/live-shared.ts) it is the camera's MJPEG stream from the fish-ID
// app (PUBLIC_AI_URL), in the design's video frame, with the fish the camera names drawn over it: it asks
// GET /api/public/live every second for the current frame's detections and draws each as the design's detection box
// (.wb-detect), placed in percent of the frame. The frame's size is the answer's, else the stream image's own once it
// shows the stream (frameOf, src/lib/live-status.mjs), never the still's. A box keeps its element while its fish stays
// put (boxKey), so the design's fade-in plays when a box appears and not on every poll. The boxes go when the frame has
// not changed for 3 s or a poll fails. Embed or offline, or when the stream fails to load, it is the YouTube embed from
// youtube-nocookie.com; after a failed stream, each status answer that says live, and the page showing again, try the
// stream off-screen (probeStream), and the player comes back to it once it plays, so a hiccup heals without the embed
// being torn down while the stream stays out of reach. Until the status is known it is the camera's still. While the
// page is hidden the polls wait and the frame shows the still, so a background tab does not keep downloading the stream.
// The markup is renderState's (src/lib/live.mjs); the island only fetches, measures and keeps state.
import { useEffect, useRef, useState } from 'react';
import { fetchJson, streamUrl } from '../lib/public-api.mjs';
import { isStale, pollInterval, renderState, type Detection, type Size } from '../lib/live.mjs';
import { frameOf, probeStream } from '../lib/live-status.mjs';
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
  const { status, camera: entry, seq } = useCameraState(camera);
  const hidden = usePageHidden();
  const [failed, setFailed] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const stream = entry ? streamUrl(ai, entry.stream_mjpeg) : null;
  const showing = status === 'live' && failed ? 'embed' : status;
  const endpoint = showing === 'live' && !hidden ? (entry?.live ?? null) : null;

  // A failed stream: on each answer that says live, and when the page shows again, try it off-screen.
  useEffect(() => {
    if (!failed || status !== 'live' || hidden || !stream) return;
    const probe = probeStream(stream);
    void probe.result.then((plays) => {
      if (plays) setFailed(false);
    });
    return probe.cancel;
  }, [failed, status, hidden, stream, seq]);

  useEffect(() => {
    if (!endpoint) {
      setDetections([]);
      setGeometry(null);
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
        const img = image.current;
        const frame = frameOf(answer, img, stream);
        setGeometry(
          img && frame
            ? {
                frame,
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
  }, [endpoint, stream]);

  const tree = renderState(showing, {
    embedId,
    title,
    stream,
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
