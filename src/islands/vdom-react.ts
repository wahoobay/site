// The plain modules' VDOM (src/lib/vdom.mjs: { type, props, children } with React's prop names) as React elements.
// Its own module, importing nothing but React's createElement, so an island takes it without the live islands' camera
// store and public-API client (live-shared.ts re-exports it for the live islands).
import { createElement, type ReactNode } from 'react';
import type { VNode } from '../lib/vdom.mjs';

/** A VDOM tree as React elements. */
export const toReact = (node: VNode | string | null): ReactNode =>
  node === null ? null : typeof node === 'string' ? node : createElement(node.type, node.props, ...node.children.map(toReact));
