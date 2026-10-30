// Log a sighting (/live/log-a-sighting/): what the form decides before it talks to the Java API. A plain module, so
// the tests read it without a build (tests/sighting.test.mjs); the island (src/islands/SightingForm.tsx) sends what it
// builds. The field names are the API's own: SightingWriteService.createSighting and ClipService read them from the
// JSON body of POST /sightings (wahoobay-net-api), as the old form (wahoobay-net-frontend,
// src/pages/intake/IntakeForm.js) sent them.

/** The Java API, version 1. Public: the three endpoints the form uses need no sign-in and are rate-limited there. */
export const API = 'https://api.wahoobay.net/api/v1';

/** The old form's life stages, in its order. */
export const LIFE_STAGES = ['Adult', 'Juvenile', 'Larval', 'Unknown'];

/** The photos a sighting keeps: the old form's limit, and the API's (SightingWriteService.MAX_PHOTOS). */
export const MAX_PHOTOS = 10;

/** The longest notes the form sends (MESSAGES.notes says the number). */
export const MAX_NOTES = 1000;

/** What validate() says, one sentence a field. */
export const MESSAGES = {
  species: 'Choose a species',
  camera: 'Choose a camera',
  // katie: review: a new sentence (the notes box stops at 1000 characters, so it shows only if that fails)
  notes: 'Shorten the notes to 1000 characters',
};

/** What every submission from a build that is not production's carries at the start of its notes. */
const TEST_LABEL = '[staging test]';

/**
 * Whether the form takes a sighting. GET /intake/status answers {enabled, message?} (IntakeStatusController): it is
 * closed when the switch says so, or when the API answers with a server error (it is down, and a sighting would not
 * send). Otherwise it is open: no switch (a 404), no answer at all, or before the answer comes; the old form failed
 * open, and the API enforces the switch itself (403 on POST /sightings).
 * @param {{ status?: { enabled?: boolean } | null, failed?: number, env?: string }} [state]
 * @returns {'open' | 'closed'}
 */
export const formState = ({ status, failed } = {}) => {
  if (status?.enabled === false) return 'closed';
  if (typeof failed === 'number' && failed >= 500) return 'closed';
  return 'open';
};

/**
 * The JSON body of POST /sightings.
 * - The species goes by its id; a name typed that is not in the list goes as `common_name`, and the API files it as
 *   a provisional species for the reviewers, as the old form's "not listed? just type it" did.
 * - A marked moment sends the camera's stream, the moment in the video (`youtube_moment`, whole seconds), how far it is
 *   behind the live edge now (`youtube_behind_live`: the API records its clip from there) and when it happened
 *   (`youtube_moment_wall`, and the sighting's time). With no mark and no photo the stream is linked alone; photos
 *   without a mark carry the sighting by themselves. `auto_frames` asks for the old form's still frames around it.
 * - Every build but production's labels its notes "[staging test]", so its submissions are told from real ones.
 * @param {{
 *   speciesId?: number | null, speciesName?: string, cameraId?: number | string | null, videoId?: string | null,
 *   momentSeconds?: number | null, behindLive?: number | null, momentWall?: number | null, lifeStage?: string,
 *   notes?: string, photos?: { storage_key: string, url: string }[], env?: string
 * }} fields
 */
export const buildPayload = ({ speciesId, speciesName, cameraId, videoId, momentSeconds, behindLive, momentWall, lifeStage, notes, photos, env }) => {
  const text = (notes ?? '').trim();
  /** @type {Record<string, unknown>} */
  const payload = {
    camera_id: cameraId === null || cameraId === undefined || cameraId === '' ? null : Number(cameraId),
    species_id: speciesId ?? null,
    life_stage: lifeStage || null,
    notes: env === 'production' ? text || null : `${TEST_LABEL} ${text}`.trim(),
    contributor_type: 'volunteer',
  };
  if (!speciesId && speciesName?.trim()) payload.common_name = speciesName.trim();
  if (photos?.length) payload.photos = photos;
  const marked = typeof momentSeconds === 'number' && Number.isFinite(momentSeconds);
  if (videoId && (marked || !photos?.length)) {
    payload.youtube_video_id = videoId;
    if (marked) {
      payload.youtube_moment = Math.floor(momentSeconds);
      if (typeof behindLive === 'number') payload.youtube_behind_live = Math.max(0, Math.round(behindLive));
      if (typeof momentWall === 'number') {
        payload.youtube_moment_wall = momentWall;
        payload.sighting_datetime = new Date(momentWall).toISOString();
      }
    }
    payload.auto_frames = true;
  }
  return payload;
};

/**
 * What stops the form from sending: a species (picked or typed) and a camera are required, photos are not, and the
 * notes are at most MAX_NOTES characters.
 * @param {{ speciesId?: number | null, speciesName?: string, cameraId?: number | string | null, notes?: string }} fields
 * @returns {string[]}
 */
export const validate = ({ speciesId, speciesName, cameraId, notes } = {}) => {
  const errors = [];
  if (!speciesId && !speciesName?.trim()) errors.push(MESSAGES.species);
  if (cameraId === null || cameraId === undefined || cameraId === '') errors.push(MESSAGES.camera);
  if ((notes ?? '').length > MAX_NOTES) errors.push(MESSAGES.notes);
  return errors;
};

/**
 * A species as the list offers it: its common name and, in brackets, its scientific name (two species of the
 * snapshot share a common name), or whichever of the two it has.
 * @param {{ common_name?: string | null, scientific_name?: string | null }} s
 */
export const speciesLabel = (s) =>
  s.common_name && s.scientific_name ? `${s.common_name} (${s.scientific_name})` : (s.common_name ?? s.scientific_name ?? '');

const fold = (/** @type {string | null | undefined} */ text) => (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The species a name in the species box means: an entry picked from the list, a common name that only one species
 * has, or a scientific name, in any case and spacing. Anything else is a name typed, and null.
 * @template {{ id: number, common_name?: string | null, scientific_name?: string | null }} T
 * @param {T[]} list
 * @param {string} text
 * @returns {T | null}
 */
export const findSpecies = (list, text) => {
  const want = fold(text);
  if (!want) return null;
  const byLabel = list.find((s) => fold(speciesLabel(s)) === want);
  if (byLabel) return byLabel;
  const byCommon = list.filter((s) => fold(s.common_name) === want);
  if (byCommon.length === 1) return byCommon[0];
  return list.find((s) => fold(s.scientific_name) === want) ?? null;
};
