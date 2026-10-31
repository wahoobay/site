// A YouTube video or playlist from youtube-nocookie.com: no cookies until it plays, and it never starts by itself. The
// one builder of the embed, for src/components/YouTube.astro and the live camera's player (src/islands/LivePlayer.tsx,
// through renderState in src/lib/live.mjs), so the page and the island embed the same frame. A plain module, so the
// tests read it without a build (tests/live.test.mjs).

/**
 * The embed's address: the video's, or with `playlist` the playlist's.
 * @param {string} id the video's id, or the playlist's
 * @param {{ playlist?: boolean }} [options]
 */
export const embedUrl = (id, { playlist = false } = {}) =>
  playlist
    ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}&rel=0`
    : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;

/** What the embed may use: no autoplay. */
export const EMBED_ALLOW = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share';
