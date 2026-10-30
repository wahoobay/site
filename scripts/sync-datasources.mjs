#!/usr/bin/env node
// By hand, never in CI or at build (it uses the network): `npm run sync:datasources` reads the Java API's list of
// active datasources and writes the snapshot the park map (/visit/map/) is built from, src/data/datasources.json.
// Commit the file after a sync.
//
// Some rows of that list carry a third-party API key (in a feed's link and elsewhere). The snapshot keeps only the
// whitelist below: id, name, type, the place (lat, and lng written as lon), and for a camera (type 8) its YouTube
// video id, from the old map's `link`; nothing else of a row is read into it. Before writing, the script checks that
// no other field's value, or any long piece of one, appears anywhere in the file (assertNoLeak); if one does, nothing
// is written. It prints counts, ids and sizes only, never a response body, a row or a field's value.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.wahoobay.net/api/v1';
const TIMEOUT_MS = 20_000;
const CAMERA = 8;

// The old site's code-level camera switch (wahoobay-net-frontend, src/utils/cameraSettings.js,
// DEFAULT_DISABLED_CAMERA_IDS): id 6, the Pompano Pier Camera, was taken down at the organisation's request, and the
// old public map left it out. Remove an id here, and re-sync, when that camera is back.
const TAKEN_DOWN = new Set([6]);

// A place name: no address, query or e-mail characters, at most 80 characters.
const NAME = /^[^\s:/?=&@]+(?: [^\s:/?=&@]+)*$/;
const YOUTUBE_ID = /^[\w-]{11}$/;

/** A camera's YouTube video id: the old map's `link` is the bare id; a YouTube address gives its id. Else null. */
const videoOf = (link) => {
  if (typeof link !== 'string') return null;
  const value = link.trim();
  if (YOUTUBE_ID.test(value)) return value;
  const id = value.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[?&#]|$)/)?.[1];
  return id ?? null;
};

const isCoordinate = (value, limit) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

/**
 * A datasource row as the snapshot keeps it, or null when it has no place on the map (no coordinates, or 0,0: a feed,
 * not a site), its name is not a plain name, or it is a camera without a YouTube video id.
 */
export const toDatasource = (row) => {
  const { id, type, lat } = row;
  const lon = row.lng ?? row.lon;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!Number.isInteger(id) || !Number.isInteger(type)) return null;
  if (!isCoordinate(lat, 90) || !isCoordinate(lon, 180) || (lat === 0 && lon === 0)) return null;
  if (name.length === 0 || name.length > 80 || !NAME.test(name)) return null;
  if (type !== CAMERA) return { id, name, type, lat, lon };
  const video = videoOf(row.link);
  return video ? { id, name, type, lat, lon, video } : null;
};

/** Why a row is left out, for the sync's log (by id; never the row's values). */
const reasonFor = (row) => {
  if (TAKEN_DOWN.has(row.id)) return 'camera taken down on the old site';
  const lon = row.lng ?? row.lon;
  if (!isCoordinate(row.lat, 90) || !isCoordinate(lon, 180) || (row.lat === 0 && lon === 0)) return 'no place on the map';
  if (row.type === CAMERA && !videoOf(row.link)) return 'camera without a YouTube video id';
  return 'no plain name';
};

/** The rows the map shows, by id, and the ids it leaves out with the reason. */
export const selectDatasources = (rows) => {
  const kept = [];
  const excluded = [];
  for (const row of rows) {
    const datasource = TAKEN_DOWN.has(row.id) ? null : toDatasource(row);
    if (datasource) kept.push(datasource);
    else excluded.push({ id: row.id, reason: reasonFor(row) });
  }
  const byId = (a, b) => a.id - b.id;
  return { kept: kept.sort(byId), excluded: excluded.sort(byId) };
};

// The fields the snapshot is made of; a camera's link is its video id.
const WHITELIST = new Set(['id', 'name', 'type', 'lat', 'lng', 'lon']);

/**
 * Throws, and nothing is written, if `body` holds the value of any field outside the whitelist, or any piece of one
 * 12 characters or longer (a key inside a feed's address). The message names the row's id and the field, never the
 * value.
 */
export const assertNoLeak = (rows, body) => {
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (WHITELIST.has(field) || (field === 'link' && row.type === CAMERA && videoOf(value))) continue;
      const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      const pieces = [text, ...text.split(/[^A-Za-z0-9_-]+/)].filter((piece) => piece.length >= 12);
      if (pieces.some((piece) => body.includes(piece))) {
        throw new Error(`datasource ${row.id}: the snapshot would hold its "${field}" field; nothing written`);
      }
    }
  }
};

const json = (rows) => `${JSON.stringify(rows, null, 2)}\n`;

export async function main(out = new URL('../src/data/datasources.json', import.meta.url)) {
  const res = await fetch(`${API}/datasource/AllActive`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`/datasource/AllActive: HTTP ${res.status}`);
  const rows = JSON.parse(await res.text());
  if (!Array.isArray(rows)) throw new Error('/datasource/AllActive: not a list; nothing written');
  const { kept, excluded } = selectDatasources(rows);
  for (const { id, reason } of excluded) console.log(`excluded: datasource ${id} (${reason})`);
  if (kept.length === 0) throw new Error('no datasource has a place on the map; nothing written');
  const body = json(kept);
  assertNoLeak(rows, body);
  writeFileSync(out, body);
  const cameras = kept.filter((r) => r.type === CAMERA).length;
  console.log(`datasources: ${rows.length} from the API, ${kept.length} kept; cameras ${cameras}, sensors ${kept.length - cameras}; ${Buffer.byteLength(body)} bytes`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
