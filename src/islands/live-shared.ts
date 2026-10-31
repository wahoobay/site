// What the live camera's three islands share (LiveBadge, LivePlayer, LiveNow): the camera's status, asked of
// GET /api/public/cameras once for all of them and again every 30 s (createCameraStore in src/lib/live-status.mjs:
// two failed re-checks in a row are offline, the next answer restores it); the page's visibility; and toReact, which
// hands renderState's VDOM (src/lib/live.mjs) to React. Islands on one page share this module, so they share one
// status: the badge, the player and the panels never disagree. A species page's island (SpeciesLive) uses toReact and
// useMeasuredSize, the charts' ResizeObserver.
import { createElement, useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { fetchJson } from '../lib/public-api.mjs';
import { createCameraStore, type CameraState } from '../lib/live-status.mjs';
import type { Size } from '../lib/live.mjs';
import type { VNode } from '../lib/vdom.mjs';

export { poll } from '../lib/live-status.mjs';
export type { CameraState };

/** A camera of GET /api/public/cameras. */
export interface Camera {
  id: string;
  status: string;
  stream_mjpeg: string | null;
  snapshot: string | null;
  embed_url: string | null;
  /** Its detections, GET /api/public/live?camera=…, as a path under /api/public. */
  live: string;
}

const UNKNOWN: CameraState = { status: null, camera: null, seq: 0 };
const stores = new Map<string, ReturnType<typeof createCameraStore>>();

const storeOf = (id: string) => {
  let store = stores.get(id);
  if (!store) {
    store = createCameraStore(id, { fetchJson });
    stores.set(id, store);
  }
  return store;
};

/** The camera's status and its entry; on the server, and while hydrating, not known yet. */
export function useCameraState(id: string): CameraState & { camera: Camera | null } {
  const store = storeOf(id);
  return useSyncExternalStore(store.subscribe, store.getState, () => UNKNOWN);
}

const onVisibilityChange = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

/** Whether the page is hidden (another tab, a minimised window); false on the server. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(onVisibilityChange, () => document.hidden, () => false);
}

/** renderState's VDOM as React elements. */
export const toReact = (node: VNode | string | null): ReactNode =>
  node === null ? null : typeof node === 'string' ? node : createElement(node.type, node.props, ...node.children.map(toReact));

/**
 * An element's size as a ResizeObserver reports it (a chart's SVG, drawn at the size it is shown so its axis text
 * keeps its token size), and the ref to put on the element; null until it is measured. No size (the element between
 * layouts) is not a measurement. Used by LiveNow and SpeciesLive.
 */
export function useMeasuredSize(): [Size | null, (element: Element | null) => (() => void) | undefined] {
  const [size, setSize] = useState<Size | null>(null);
  const ref = useCallback((element: Element | null) => {
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setSize((was) => (was && was.width === width && was.height === height ? was : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [size, ref];
}
