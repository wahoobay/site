// The live islands' VDOM: renderState (src/lib/live.mjs) and the species chart (src/lib/live-chart.mjs) describe what
// the islands draw as { type, props, children } nodes with React's prop names, which the islands hand to React
// (toReact, src/islands/live-shared.ts). A plain module, so the tests read the trees without React.

/** @typedef {{ type: string, props: Record<string, any>, children: Array<VNode | string> }} VNode */

/**
 * A VDOM node: React's prop names; children flattened, numbers as text, null, undefined and false left out.
 * @param {string} type
 * @param {Record<string, any> | null} props
 * @param {...any} children
 * @returns {VNode}
 */
export const h = (type, props, ...children) => ({
  type,
  props: props ?? {},
  children: children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false)
    .map((c) => (typeof c === 'object' ? c : String(c))),
});
