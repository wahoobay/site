// The admin's double-submit guard: one action at a time. useOneAtATime (src/islands/admin/shared.tsx) takes the gate
// before it sends a request and releases it when the request is done, however it ends; a press while the gate is held
// sends nothing. It is a plain object, not React state, so a second click inside the same frame (before a render
// could disable the button) is refused too. A plain module, so the tests read it without a build
// (tests/admin-gate.test.mjs).

/**
 * A gate: `take()` is true for the first caller and false for every caller after it until `release()`; `held` says
 * whether it is taken.
 * @returns {{ readonly held: boolean, take: () => boolean, release: () => void }}
 */
export function oneAtATime() {
  let held = false;
  return {
    get held() {
      return held;
    },
    take() {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
  };
}
