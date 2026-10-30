#!/usr/bin/env node
// By hand, never in CI or at build (it uses the network): `npm run sync:species` reads the Java API's public species
// and media lists and writes the snapshot the species gallery (/live/species/) is built from, src/data/species.json and
// src/data/media.json. It keeps only the whitelisted fields below; a field the API leaves out is written as null.
// It then asks for every thumbnail once (checkMedia), so the page carries none that fails; that takes a minute or two.
// Commit the two files after a sync. It prints counts and sizes only, never a response body.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.wahoobay.net';
const V1 = `${API}/api/v1`;
const TIMEOUT_MS = 20_000;
// The size budget: past it, media.json keeps the newest MEDIA_KEEP clips.
const MEDIA_BUDGET_BYTES = 400 * 1024;
const MEDIA_KEEP = 500;

// Rows of the species list that are test entries, not animals of the bay, and whose names could be a person's: id 205
// (category "human like") and id 210, both with no taxonomy and no clips. Checked by hand on 2026-10-30.
const NOT_A_SPECIES = new Set([205, 210]);

/** A string field, trimmed; missing or blank is null. */
const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// The old gallery (wahoobay-net-frontend, src/services/mediaService.js and adminService.js) hid a species still
// provisional or whose scientific name is a volunteer's "[unverified]" guess: its interim approval gate.
const isProvisional = (row) => row.name_status === 'provisional' || /^\s*\[unverified\]/i.test(row.scientific_name ?? '');

/** A species row of the API as the snapshot keeps it. */
export const toSpecies = (row) => ({
  id: number(row.species_id),
  common_name: text(row.common_name),
  scientific_name: text(row.scientific_name),
  family: text(row.family),
  category: text(row.category),
  conservation_status: text(row.conservation_status),
});

const byName = (a, b) =>
  (a.common_name ?? a.scientific_name ?? '').localeCompare(b.common_name ?? b.scientific_name ?? '', 'en', { sensitivity: 'base' }) ||
  (a.scientific_name ?? '').localeCompare(b.scientific_name ?? '', 'en') ||
  a.id - b.id;

/** The species the gallery lists: the old gallery's gate, then the whitelist, by the name the card shows. */
export const selectSpecies = (rows) =>
  rows
    .filter((row) => !isProvisional(row) && !NOT_A_SPECIES.has(row.species_id))
    .map(toSpecies)
    .filter((s) => s.id !== null)
    .sort(byName);

const driveId = (url) => url?.match(/(?:\/d\/|[?&]id=)([\w-]{20,})/)?.[1] ?? null;
const youtubeId = (url) => url?.match(/(?:[?&]v=|youtu\.be\/|\/embed\/)([\w-]{6,})/)?.[1] ?? null;

// The old gallery's video test (MediaGallery.isVideo); anything else is a photo.
const kindOf = (row) =>
  (row.media_kind ?? row.kind) === 'video' ||
  row.storage_type === 'youtube' ||
  /^(video|stream|youtube)/i.test(String(row.storage_type ?? ''))
    ? 'video'
    : 'image';

// The old gallery's "open original" link (mediaHref): an absolute address as it is, an upload under the API's /api.
const linkOf = (row) => {
  const url = text(row.url) ?? text(row.media_url);
  if (url && /^https?:\/\//i.test(url)) return url;
  if (url?.startsWith('/uploads/')) return `${API}/api${url}`;
  if (row.storage_type === 'youtube' && text(row.storage_key)) return `https://www.youtube.com/watch?v=${text(row.storage_key)}`;
  return null;
};

// A thumbnail on another host is dropped (the link stays): only the API, YouTube and Drive.
const THUMB_HOSTS = new Set(['api.wahoobay.net', 'img.youtube.com', 'i.ytimg.com', 'drive.google.com']);
const onThumbHost = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && THUMB_HOSTS.has(u.host) ? url : null;
  } catch {
    return null;
  }
};

// The old gallery's thumbnail (thumbFor), without a sign-in token: YouTube's own still; a Drive file's thumbnail
// through the API's image proxy (/api/v1/thumb?u=…; the old gallery's form, and the one the proxy answers); an
// uploaded photo itself, from the API; else the row's thumb_url.
const thumbOf = (row, kind) => {
  const url = text(row.url) ?? text(row.media_url);
  const key = text(row.storage_key);
  if (row.storage_type === 'youtube' && key) return `https://img.youtube.com/vi/${encodeURIComponent(key)}/hqdefault.jpg`;
  const yt = youtubeId(url);
  if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
  const drive = driveId(url);
  if (drive) return `${V1}/thumb?u=${encodeURIComponent(`https://drive.google.com/thumbnail?id=${drive}&sz=w640`)}`;
  if (url?.startsWith('/uploads/')) return kind === 'image' ? `${API}/api${url}` : null;
  const thumb = text(row.thumb_url);
  return thumb ? onThumbHost(thumb) : null;
};

/** A media row of the API as the snapshot keeps it, or null when it has no https link to open. */
export const toMedia = (row) => {
  const url = linkOf(row);
  if (!url?.startsWith('https://')) return null;
  const kind = kindOf(row);
  return {
    id: number(row.media_id),
    species_id: number(row.species_id),
    kind,
    url,
    thumb: thumbOf(row, kind),
    title: text(row.title),
    date: text(row.media_date),
  };
};

// Newest first; a clip without a date after every dated one, the newest id first.
const newestFirst = (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.id ?? 0) - (a.id ?? 0);

/** The clips of the listed species, newest first. */
export const selectMedia = (rows, species) => {
  const listed = new Set(species.map((s) => s.id));
  return rows
    .map(toMedia)
    .filter((m) => m !== null && m.id !== null && listed.has(m.species_id))
    .sort(newestFirst);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isImage = (a) => a.status === 200 && a.type.startsWith('image/');

/** The status and content type an address answers with; the body is never read. */
async function answer(url, get) {
  try {
    const res = await get(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel();
    return { status: res.status, type: res.headers.get('content-type') ?? '' };
  } catch {
    return { status: 0, type: '' };
  }
}

/**
 * The page has no script to hide a picture that fails, so the sync asks for each thumbnail, one at a time (the image
 * proxy answers 404 to a burst), and once more after a pause if it fails. A thumbnail that still does not answer
 * with an image is dropped (the card shows the initials); if the clip's own link is gone too (404 or 410), so is the
 * clip.
 */
export async function checkMedia(media, { get = fetch, pause = 250 } = {}) {
  const kept = [];
  let dropped = 0;
  let gone = 0;
  for (const m of media) {
    if (m.thumb === null) {
      kept.push(m);
      continue;
    }
    let a = await answer(m.thumb, get);
    if (!isImage(a)) {
      await sleep(pause * 8);
      a = await answer(m.thumb, get);
    }
    if (isImage(a)) kept.push(m);
    else {
      const link = await answer(m.url, get);
      if (link.status === 404 || link.status === 410) gone += 1;
      else {
        dropped += 1;
        kept.push({ ...m, thumb: null });
      }
    }
    await sleep(pause);
  }
  return { media: kept, dropped, gone };
}

const asArray = (x) => (Array.isArray(x) ? x : Array.isArray(x?.rows) ? x.rows : Array.isArray(x?.items) ? x.items : []);

async function getRows(path) {
  const res = await fetch(`${V1}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return asArray(JSON.parse(await res.text()));
}

const EMAIL = /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i;
const json = (rows) => `${JSON.stringify(rows, null, 2)}\n`;
const nulls = (rows) =>
  Object.keys(rows[0] ?? {})
    .map((key) => `${key} ${rows.filter((r) => r[key] === null).length}`)
    .join(', ');

export async function main(out = new URL('../src/data/', import.meta.url)) {
  const [speciesRows, mediaRows] = await Promise.all([getRows('/species'), getRows('/media?limit=1000')]);
  const species = selectSpecies(speciesRows);
  const checked = await checkMedia(selectMedia(mediaRows, species));
  console.log(`thumbnails: ${checked.dropped} dropped (no image), ${checked.gone} clips left out (thumbnail and link both gone)`);
  let media = checked.media;
  let body = json(media);
  if (Buffer.byteLength(body) > MEDIA_BUDGET_BYTES) {
    console.log(`media: ${Buffer.byteLength(body)} bytes is over the ${MEDIA_BUDGET_BYTES}-byte budget; keeping the newest ${MEDIA_KEEP}`);
    media = media.slice(0, MEDIA_KEEP);
    body = json(media);
  }
  for (const row of [...species, ...media]) {
    for (const value of Object.values(row)) {
      if (typeof value === 'string' && EMAIL.test(value)) throw new Error('a field holds an e-mail address; nothing written');
    }
  }
  writeFileSync(new URL('species.json', out), json(species));
  writeFileSync(new URL('media.json', out), body);
  console.log(`species: ${speciesRows.length} from the API, ${species.length} kept, ${Buffer.byteLength(json(species))} bytes; null: ${nulls(species)}`);
  console.log(`media: ${mediaRows.length} from the API, ${media.length} kept, ${Buffer.byteLength(body)} bytes; null: ${nulls(media)}`);
  console.log(`media kinds: ${media.filter((m) => m.kind === 'image').length} image, ${media.filter((m) => m.kind === 'video').length} video`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
