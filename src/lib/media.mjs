// A page's banner and a news post's photo: @wahoobay/design's .wb-media (the 12px corners), cropped where the band
// is shorter than the photo. A plain module, so the tests read it without a build (tests/heroes.test.mjs).
import { z } from 'astro/zod';

/**
 * Which edge of the photo stays in the band when it is cropped: `top` or `bottom` keeps a subject at that edge in
 * frame; `center`, the default, crops both edges evenly.
 */
export const heroPosition = z.enum(['top', 'center', 'bottom']).optional();

/**
 * The design's classes for a banner or a post's photo at this position.
 * @param {'top' | 'center' | 'bottom' | undefined} position
 */
export const mediaClass = (position) =>
  position === 'top' ? 'wb-media wb-media--top' : position === 'bottom' ? 'wb-media wb-media--bottom' : 'wb-media';
