// A YouTube video or playlist from youtube-nocookie.com: no cookies until it plays, and it never starts by itself, with
// one exception: the home page's live band plays the SeaHIVE camera's YouTube live stream muted, starting by itself
// (Dan, 2026-11-24; `autoplay`). The one builder of the embed, for src/components/YouTube.astro and the live camera's player (src/islands/LivePlayer.tsx,
// through renderState in src/lib/live.mjs), so the page and the island embed the same frame. A plain module, so the
// tests read it without a build (tests/live.test.mjs).

/**
 * The embed's address: the video's, or with `playlist` the playlist's; with `autoplay`, muted, inline and starting by
 * itself (browsers start only a muted video by themselves).
 * @param {string} id the video's id, or the playlist's
 * @param {{ playlist?: boolean, autoplay?: boolean }} [options]
 */
export const embedUrl = (id, { playlist = false, autoplay = false } = {}) =>
  playlist
    ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}&rel=0`
    : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}${autoplay ? '?autoplay=1&mute=1&playsinline=1' : ''}`;

/** What the embed may use: no autoplay. */
export const EMBED_ALLOW = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share';

/** What the home band's live stream may use: autoplay too. */
export const EMBED_ALLOW_AUTOPLAY = `${EMBED_ALLOW}; autoplay`;
