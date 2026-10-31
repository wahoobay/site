// The live badge beside the camera page's h1 and on the home band's still: "Live" while the camera's stream is on,
// "Offline" when it is not (the design's .wb-live and .wb-live--off), and nothing until the status is known, so it never
// says Live before it knows. Hydrated at once (client:load); the status is the one the live islands share
// (src/islands/live-shared.ts), asked again every 30 s. The badge itself is renderState's (src/lib/live.mjs).
import { renderState } from '../lib/live.mjs';
import { toReact, useCameraState } from './live-shared';

interface Props {
  /** The camera's id in the public API (REEF_CAMERA). */
  camera: string;
}

export default function LiveBadge({ camera }: Props) {
  const { status } = useCameraState(camera);
  return toReact(renderState(status).badge);
}
