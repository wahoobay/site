// What the live camera's three islands share (LiveBadge, LivePlayer, LiveNow): the camera's status, asked of
// GET /api/public/cameras once for all of them and again every 30 s; a poll that waits while the page is hidden; the
// page's visibility; and toReact, which hands renderState's VDOM (src/lib/live.mjs) to React. Islands on one page share
// this module, so they share one status: the badge, the player and the panels never disagree.
import { createElement, useSyncExternalStore, type ReactNode } from 'react';
import { fetchJson } from '../lib/public-api.mjs';
import { pollInterval, statusOf, type Status } from '../lib/live.mjs';

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

export interface CameraState {
  /** null until the first answer (or its failure). */
  status: Status | null;
  camera: Camera | null;
}

/**
 * Runs `task` now and again `ms` after each run settles, while the page is visible: a hidden page waits, and the task
 * runs at once when the page shows again. The task's signal aborts when the poll stops. Returns the stop.
 */
export function poll(task: (signal: AbortSignal) => Promise<void>, ms: number): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const run = async () => {
    timer = undefined;
    if (controller.signal.aborted || document.hidden) return;
    running = true;
    try {
      await task(controller.signal);
    } catch {
      // A task keeps the page as it was when it fails; the next run tries again.
    } finally {
      running = false;
    }
    if (!controller.signal.aborted && !document.hidden) timer = setTimeout(run, ms);
  };
  const onVisibility = () => {
    if (!document.hidden && !running && timer === undefined) void run();
  };
  document.addEventListener('visibilitychange', onVisibility);
  void run();
  return () => {
    controller.abort();
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

const UNKNOWN: CameraState = { status: null, camera: null };

interface Store {
  state: CameraState;
  listeners: Set<() => void>;
  stop?: () => void;
  subscribe: (listener: () => void) => () => void;
}

const stores = new Map<string, Store>();

/** The store of one camera's status: it asks while anything listens, and keeps its answer for the next listener. */
function storeOf(id: string): Store {
  const known = stores.get(id);
  if (known) return known;
  const store: Store = {
    state: UNKNOWN,
    listeners: new Set(),
    subscribe(listener) {
      store.listeners.add(listener);
      store.stop ??= poll(async (signal) => {
        let next: CameraState;
        try {
          const answer = await fetchJson('/cameras', { signal });
          const camera = (Array.isArray(answer?.cameras) ? answer.cameras : []).find((c: Camera | null) => c?.id === id) ?? null;
          next = { status: statusOf(answer, id), camera };
        } catch {
          if (signal.aborted) return;
          // No answer: offline the first time; a failed re-check keeps what the page already shows.
          next = store.state.status === null ? { status: 'offline', camera: null } : store.state;
        }
        if (next.status !== store.state.status || JSON.stringify(next.camera) !== JSON.stringify(store.state.camera)) {
          store.state = next;
          for (const l of store.listeners) l();
        }
      }, pollInterval(null));
      return () => {
        store.listeners.delete(listener);
        if (store.listeners.size === 0) {
          store.stop?.();
          store.stop = undefined;
        }
      };
    },
  };
  stores.set(id, store);
  return store;
}

/** The camera's status and its entry; on the server, and while hydrating, not known yet. */
export function useCameraState(id: string): CameraState {
  const store = storeOf(id);
  return useSyncExternalStore(store.subscribe, () => store.state, () => UNKNOWN);
}

const onVisibilityChange = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

/** Whether the page is hidden (another tab, a minimised window); false on the server. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(onVisibilityChange, () => document.hidden, () => false);
}

interface VNode {
  type: string;
  props: Record<string, unknown>;
  children: Array<VNode | string>;
}

/** renderState's VDOM as React elements. */
export const toReact = (node: VNode | string | null): ReactNode =>
  node === null ? null : typeof node === 'string' ? node : createElement(node.type, node.props, ...node.children.map(toReact));
