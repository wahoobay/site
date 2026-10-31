#!/usr/bin/env node
// By hand, never in CI or at build (it uses the network): `npm run sync:fish` reads the fish-ID app's public species
// list (GET <SYNC_API>/api/public/species; SYNC_API defaults to staging, https://staging-ai.wahoobay.net) and writes the
// snapshot the species explorer (/live/species/) is built from, src/data/fish.json, sorted by scientific name. Commit
// the file after a sync.
//
// It keeps only the list's public keys (FISH_KEYS) and, of a photo, its url and attribution; a key the API leaves out
// is written as null (an API from before `class` and `phylum`, Ruling 37, gives null for both), a key it adds is not
// read, and a row with no species id or scientific name is left out. A picture is published only from
// the allow-list (cleanPhotoUrl): a path under /api/public/ on the fish-ID app, as the API gives it (the photo's own
// route), or an https address on one of PHOTO_HOSTS; a photo anywhere else is left out, and the latest crop must be a
// path under /api/public/detections/. Before writing, assertNoLeak refuses the whole file, and nothing is written, if
// any key is off the whitelist or any value holds a `key=` parameter, a user in a link's authority or an e-mail address
// (the step-2a pattern). It prints counts and sizes only, never a response body, a name or a link.
//
// One entry a species (Ruling 32): the fish-ID app can list one species under two ids, its classifier's current label
// ("Sparisoma viride") and an older one ("sparisoma_viride"), and the explorer gives a species one page. Entries whose
// scientific names match once normalised become one (mergeSameSpecies, src/lib/fish-sync.mjs): the id seen most
// recently (its profile is the live one), the sightings in total and this week summed, the earliest first seen and the
// latest last seen, and the newest id's photo and latest crop, else the other's. The API keeps both ids.
//
// The snapshot keeps every species the API lists, the doubtful ones too: DOUBTFUL in src/lib/explorer.mjs (Ruling 42,
// a classifier label the public site must not present, the manatee first) is read at build time, and the explorer
// treats a species on it as if the fish-ID app did not list it. The fish-ID reviewers own the fix.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeSameSpecies } from '../src/lib/fish-sync.mjs';

const SYNC_API = process.env.SYNC_API ?? 'https://staging-ai.wahoobay.net';
const TIMEOUT_MS = 20_000;

/** The keys of a species in GET /api/public/species (the fish-ID plan's Task 2, Rulings 17 and 37), the snapshot's only keys. */
export const FISH_KEYS = ['species_id', 'latin', 'common', 'family', 'order', 'class', 'phylum', 'aphia_id', 'photo', 'latest_crop', 'sightings_total', 'sightings_7d', 'first_seen', 'last_seen'];
const PHOTO_KEYS = ['url', 'attribution'];

/** The hosts a photo may be on: iNaturalist's two and the fish-ID app's, staging and production. */
const PHOTO_HOSTS = new Set(['inaturalist-open-data.s3.amazonaws.com', 'static.inaturalist.org', 'staging-ai.wahoobay.net', 'ai.wahoobay.net']);
// A path on the fish-ID app's public API: plain segments, no `..`, no query or fragment.
const PUBLIC_PATH = /^\/api\/public(?:\/(?!\.\.?(?:\/|$))[\w.~%-]+)+$/;
const CROP_PATH = /^\/api\/public\/detections\/[\w-]+\/crop\.jpg$/;

/** A string field, trimmed; missing or blank is null. */
const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * A photo's address as the snapshot may keep it, as given, or null: a path under /api/public/, or https on
 * PHOTO_HOSTS with no user or port.
 * @param {unknown} url
 */
export const cleanPhotoUrl = (url) => {
  if (typeof url !== 'string') return null;
  if (url.startsWith('/')) return PUBLIC_PATH.test(url) ? url : null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  return u.protocol === 'https:' && PHOTO_HOSTS.has(u.hostname) && !u.username && !u.password && !u.port ? url : null;
};

const toPhoto = (photo) => {
  const url = cleanPhotoUrl(photo?.url);
  return url === null ? null : { url, attribution: text(photo.attribution) };
};

/** A species of the API as the snapshot keeps it (FISH_KEYS, in that order), or null with no species id or name. */
export const toFish = (row) => {
  const species_id = text(row.species_id);
  const latin = text(row.latin);
  if (species_id === null || latin === null) return null;
  return {
    species_id,
    latin,
    common: text(row.common),
    family: text(row.family),
    order: text(row.order),
    class: text(row.class),
    phylum: text(row.phylum),
    aphia_id: number(row.aphia_id),
    photo: toPhoto(row.photo),
    latest_crop: typeof row.latest_crop === 'string' && CROP_PATH.test(row.latest_crop) ? row.latest_crop : null,
    sightings_total: number(row.sightings_total),
    sightings_7d: number(row.sightings_7d),
    first_seen: text(row.first_seen),
    last_seen: text(row.last_seen),
  };
};

/**
 * The species the snapshot keeps, one entry a species (the header), by scientific name; how many rows were left out
 * (no id or name), and how many were merged into another id of their species.
 */
export const selectFish = (rows) => {
  const kept = rows.map(toFish).filter((f) => f !== null);
  const fish = mergeSameSpecies(kept).sort((a, b) => a.latin.localeCompare(b.latin, 'en') || a.species_id.localeCompare(b.species_id, 'en'));
  return { fish, dropped: rows.length - kept.length, merged: kept.length - fish.length };
};

// A key in a query (?key=, &api_key=), and a user in a link's authority (https://user@host, //user:pw@host).
const KEY_PARAM = /[?&][\w-]*key=/i;
const USER_IN_LINK = /\/\/[^\s/?#]*@/;
const EMAIL = /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i;
// A species id the message may name: the classifier's labels ("Sparisoma viride", "sparisoma_viride"), nothing more.
const ID = /^[\w .-]+$/;

/**
 * Throws, and nothing is written, if a species carries a key off the whitelist (FISH_KEYS; url and attribution of a
 * photo) or a value holding a `key=` parameter, a user in a link's authority or an e-mail address. The message names
 * the species id and the key, never the value.
 */
export const assertNoLeak = (fish) => {
  fish.forEach((f, i) => {
    const who = typeof f.species_id === 'string' && ID.test(f.species_id) ? f.species_id : `#${i + 1}`;
    const check = (key, value) => {
      if (typeof value === 'string' && (KEY_PARAM.test(value) || USER_IN_LINK.test(value) || EMAIL.test(value))) {
        throw new Error(`species ${who}: "${key}" holds a key= parameter, a user in a link or an e-mail address; nothing written`);
      }
    };
    for (const [key, value] of Object.entries(f)) {
      if (!FISH_KEYS.includes(key)) throw new Error(`species ${who}: key "${key}" is not on the whitelist; nothing written`);
      if (key === 'photo' && value !== null) {
        for (const [inner, v] of Object.entries(value)) {
          if (!PHOTO_KEYS.includes(inner)) throw new Error(`species ${who}: key "photo.${inner}" is not on the whitelist; nothing written`);
          check(`photo.${inner}`, v);
        }
      } else check(key, value);
    }
  });
};

const json = (rows) => `${JSON.stringify(rows, null, 2)}\n`;

export async function main({ api = SYNC_API, out = new URL('../src/data/fish.json', import.meta.url), get = fetch } = {}) {
  const res = await get(`${api.replace(/\/+$/, '')}/api/public/species`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`/api/public/species: HTTP ${res.status}; nothing written`);
  let rows;
  try {
    rows = JSON.parse(await res.text())?.species;
  } catch {
    // JSON.parse's own message quotes the body.
    throw new Error('/api/public/species: not JSON; nothing written');
  }
  if (!Array.isArray(rows)) throw new Error('/api/public/species: not a list; nothing written');
  const { fish, dropped, merged } = selectFish(rows);
  if (fish.length === 0) throw new Error('no species in the list; nothing written');
  assertNoLeak(fish);
  const body = json(fish);
  writeFileSync(out, body);
  // Photos by row, before the merge: a photo off the allow-list is the only one left out.
  const offered = rows.filter((r) => toFish(r) !== null && r.photo).length;
  const photos = rows.filter((r) => toFish(r)?.photo).length;
  console.log(`species: ${rows.length} from the API, ${fish.length} kept, ${dropped} left out (no id or name), ${merged} merged (one species under two ids); ${Buffer.byteLength(body)} bytes`);
  console.log(`photos: ${photos} kept, ${offered - photos} left out (not on the allow-list); species with a photo: ${fish.filter((f) => f.photo !== null).length}, with a latest crop: ${fish.filter((f) => f.latest_crop !== null).length}`);
  console.log(`sightings: ${fish.filter((f) => (f.sightings_total ?? 0) > 0).length} species seen, ${fish.filter((f) => (f.sightings_7d ?? 0) > 0).length} this week`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
