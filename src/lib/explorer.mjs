// The species explorer (/live/species/ and a page a species): one list of every species from the site's two committed
// snapshots, the fish-ID app's (src/data/fish.json, `npm run sync:fish`) and the Java API's (src/data/species.json and
// media.json, `npm run sync:species`), merged on the scientific name as nomenclature writes it (src/lib/names.mjs). A
// plain module, so the tests read it without a build (tests/explorer.test.mjs).
import { binomial } from './names.mjs';
import { groupByCategory, mediaFor } from './species.mjs';

/**
 * @typedef {{ url: string, attribution: string | null }} Photo
 * @typedef {{ species_id: string, latin: string, common: string | null, family: string | null, order: string | null,
 *   photo: Photo | null, latest_crop: string | null, sightings_total: number | null, sightings_7d: number | null,
 *   last_seen: string | null }} Fish
 * @typedef {{ id: number, common_name: string | null, scientific_name: string | null, family: string | null,
 *   category: string | null, conservation_status: string | null }} JavaSpecies
 * @typedef {{ id: number, species_id: number }} Media
 * @typedef {{ slug: string, latin: string | null, common: string | null, family: string | null, order: string | null,
 *   category: string | null, conservation_status: string | null, photo: Photo | null, latest_crop: string | null,
 *   media: Media[], species_id: string | null, java_id: number | null, sightings_total: number, sightings_7d: number,
 *   last_seen: string | null }} Species
 */

/**
 * A species page's address from its scientific name: lower case, every run of other characters one hyphen, a letter's
 * accent dropped ("Abudefduf saxatilis" is `abudefduf-saxatilis`, "Ophiothrix sp." is `ophiothrix-sp`).
 * @param {string} latin
 */
export const slugify = (latin) =>
  latin
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The name both lists are merged on; null for no name. */
const keyOf = (/** @type {string | null | undefined} */ latin) => (typeof latin === 'string' && latin.trim() !== '' ? binomial(latin.trim()) : null);

// The order a card shows them in, as the 2a gallery's (scripts/sync-species.mjs, byName): the common name, else the
// scientific one, then the scientific name.
const byName = (/** @type {Species} */ a, /** @type {Species} */ b) =>
  (a.common ?? a.latin ?? '').localeCompare(b.common ?? b.latin ?? '', 'en', { sensitivity: 'base' }) ||
  (a.latin ?? '').localeCompare(b.latin ?? '', 'en') ||
  a.slug.localeCompare(b.slug, 'en');

/**
 * Every species of both lists exactly once, by the name a card shows. A species on both (the same scientific name once
 * normalised) is one entry: its common name, category, conservation status and clips are the Java list's, as the 2a
 * gallery showed them; its order, photo, latest crop and counts are the fish-ID app's, and its family the fish-ID
 * catalogue's where it has one. A common name or family missing from one list is taken from the other. A fish-ID
 * species with no Java category is a Fish. A Java-only species has no fish-ID id, no photo of its own and no counts (0,
 * last seen null); a fish-ID-only species has no Java id and no clips. Two species that would share a page (one
 * scientific name twice in a list, or two names with one slug) throw: no species is ever dropped or doubled silently.
 * @param {Fish[]} fish
 * @param {JavaSpecies[]} javaSpecies
 * @param {Media[]} media
 * @returns {Species[]}
 */
export const unionSpecies = (fish, javaSpecies, media) => {
  /** @type {Map<string, { fish?: Fish, java?: JavaSpecies }>} */
  const byKey = new Map();
  /** @type {{ fish?: Fish, java?: JavaSpecies }[]} */
  const entries = [];
  const add = (/** @type {string | null} */ key, /** @type {'fish' | 'java'} */ side, /** @type {any} */ row) => {
    const entry = key === null ? undefined : byKey.get(key);
    if (entry?.[side]) throw new Error(`unionSpecies: ${slugify(key ?? '')} is listed twice in the ${side === 'fish' ? 'fish-ID' : 'Java'} list`);
    if (entry) entry[side] = row;
    else {
      const fresh = { [side]: row };
      entries.push(fresh);
      if (key !== null) byKey.set(key, fresh);
    }
  };
  for (const f of fish) add(keyOf(f.latin), 'fish', f);
  for (const j of javaSpecies) add(keyOf(j.scientific_name), 'java', j);

  const list = entries.map(({ fish: f, java: j }) => {
    const latin = keyOf(f?.latin ?? j?.scientific_name);
    const common = j?.common_name ?? f?.common ?? null;
    return {
      slug: slugify(latin ?? common ?? ''),
      latin,
      common,
      family: f?.family ?? j?.family ?? null,
      order: f?.order ?? null,
      category: j?.category ?? (f ? 'Fish' : null),
      conservation_status: j?.conservation_status ?? null,
      photo: f?.photo ?? null,
      latest_crop: f?.latest_crop ?? null,
      media: j ? mediaFor(j.id, media) : [],
      species_id: f?.species_id ?? null,
      java_id: j?.id ?? null,
      sightings_total: f?.sightings_total ?? 0,
      sightings_7d: f?.sightings_7d ?? 0,
      last_seen: f?.last_seen ?? null,
    };
  });

  const slugs = new Set();
  for (const s of list) {
    if (s.slug === '' || slugs.has(s.slug)) throw new Error(`unionSpecies: two species would share the page "${s.slug}"`);
    slugs.add(s.slug);
  }
  return list.sort(byName);
};

/**
 * The union by category: a Map with every one of the gallery's CATEGORIES (src/lib/species.mjs), in its order, each
 * species once in the order given; a species with no category, or one outside CATEGORIES, is under "Other" (a fish-ID
 * species with no Java category is already a Fish, unionSpecies).
 * @param {Species[]} list
 */
export const byCategory = (list) => groupByCategory(list);
