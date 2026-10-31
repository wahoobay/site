// What the live camera's three islands share (LiveBadge, LivePlayer, LiveNow): the camera's status, asked of
// GET /api/public/cameras once for all of them and again every 30 s (createCameraStore in src/lib/live-status.mjs:
// two failed re-checks in a row are offline, the next answer restores it); the page's visibility; and toReact, which
// hands renderState's VDOM (src/lib/live.mjs) to React. Islands on one page share this module, so they share one
// status: the badge, the player and the panels never disagree.
import { createElement, useSyncExternalStore, type ReactNode } from 'react';
import { fetchJson } from '../lib/public-api.mjs';
import { createCameraStore, type CameraState } from '../lib/live-status.mjs';
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
