// The fish-ID species snapshot's one rule beyond the whitelist (Ruling 32): the fish-ID app can list one species under
// two ids (its classifier's current label, "Sparisoma viride", and an older one, "sparisoma_viride"), and the explorer
// gives a species one page, so the snapshot keeps one entry for it. scripts/sync-fish.mjs applies it before it writes
// src/data/fish.json. A plain module, so the tests read it without a build (tests/fish-sync.test.mjs).
import { binomial } from './names.mjs';

const time = (/** @type {string | null} */ iso) => {
  const ms = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

// The id seen most recently first (its profile is the live one); no last seen after any; then more sightings, then id.
const newestFirst = (a, b) =>
  (time(b.last_seen) ?? -Infinity) - (time(a.last_seen) ?? -Infinity) ||
  (b.sightings_total ?? 0) - (a.sightings_total ?? 0) ||
  a.species_id.localeCompare(b.species_id, 'en');

/** The sum of two counts; a missing count adds nothing, and none on either is null. */
const add = (a, b) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

/** The earlier (or later) of two times, as written; a missing time loses. */
const pick = (a, b, later) => {
  if (time(a) === null) return b;
  if (time(b) === null) return a;
  return later === (time(b) > time(a)) ? b : a;
};

/**
 * One entry a species: entries whose scientific names match once normalised (src/lib/names.mjs) become one, under the
 * id seen most recently; its sightings, in total and this week, are summed; first seen is the earliest and last seen
 * the latest; its photo and latest crop are the newest id's when it has them, else the next's; its other fields the
 * newest id's, a missing one taken from the next. A species under one id is returned as it is, and the entries keep
 * the order of their species' first appearance. The inputs are not changed.
 * @template {{ species_id: string, latin: string, sightings_total: number | null, sightings_7d: number | null,
 *   first_seen: string | null, last_seen: string | null }} T
 * @param {T[]} fish
 * @returns {T[]}
 */
export const mergeSameSpecies = (fish) => {
  /** @type {Map<string | null, T[]>} */
  const groups = new Map();
  for (const f of fish) {
    const key = binomial(f.latin);
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const [newest, ...rest] = [...group].sort(newestFirst);
    return rest.reduce(
      (merged, other) => {
        /** @type {any} */
        const out = { ...merged };
        for (const [key, value] of Object.entries(other)) if (out[key] === null || out[key] === undefined) out[key] = value;
        out.sightings_total = add(merged.sightings_total, other.sightings_total);
        out.sightings_7d = add(merged.sightings_7d, other.sightings_7d);
        out.first_seen = pick(merged.first_seen, other.first_seen, false);
        out.last_seen = pick(merged.last_seen, other.last_seen, true);
        out.species_id = newest.species_id;
        return out;
      },
      /** @type {T} */ ({ ...newest }),
    );
  });
};
