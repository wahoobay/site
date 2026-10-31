// The species explorer (/live/species/ and a page a species): one list of every species from the site's two committed
// snapshots, the fish-ID app's (src/data/fish.json, `npm run sync:fish`) and the Java API's (src/data/species.json and
// media.json, `npm run sync:species`), merged on the scientific name as nomenclature writes it (src/lib/names.mjs). A
// plain module, so the tests read it without a build (tests/explorer.test.mjs).
import { binomial } from './names.mjs';
import { groupByCategory, mediaFor } from './species.mjs';

/**
 * @typedef {{ url: string, attribution: string | null }} Photo
 * @typedef {{ species_id: string, latin: string, common: string | null, family: string | null, order: string | null,
 *   class?: string | null, phylum?: string | null, photo: Photo | null, latest_crop: string | null,
 *   sightings_total: number | null, sightings_7d: number | null, last_seen: string | null }} Fish
 * @typedef {{ id: number, common_name: string | null, scientific_name: string | null, family: string | null,
 *   category: string | null, conservation_status: string | null }} JavaSpecies
 * @typedef {{ id: number, species_id: number }} Media
 * @typedef {{ slug: string, latin: string | null, also_listed_as: string | null, common: string | null,
 *   family: string | null, order: string | null, category: string, conservation_status: string | null,
 *   photo: Photo | null, latest_crop: string | null, media: Media[], species_id: string | null, java_id: number | null,
 *   sightings_total: number, sightings_7d: number, last_seen: string | null }} Species
 */

/**
 * A species page's address from its scientific name: lower case, every run of other characters one hyphen, a letter's
 * accent dropped ("Abudefduf saxatilis" is `abudefduf-saxatilis`, "Ophiothrix sp." is `ophiothrix-sp`).
 * @param {string} latin
 */
export const slugify = (latin) =>
  latin
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The name both lists are merged on; null for no name. */
const keyOf = (/** @type {string | null | undefined} */ latin) => (typeof latin === 'string' && latin.trim() !== '' ? binomial(latin.trim()) : null);

/** A fish-ID id as a name: the classifier's ("Carangoides ruber", or "carangoides_ruber" in its older form). */
const idName = (/** @type {string} */ id) => keyOf(id.replace(/_/g, ' '));

// The fish-ID classes the gallery's categories take (Ruling 37). Actinopterygii is the ray-finned fishes' usual name;
// the fish-ID catalogue (WoRMS, the ai repository's assets/taxonomy.csv) files bony fish under Teleostei and WoRMS's
// own class is Actinopteri, so all three are Fish; Crocodylia is the catalogue's class for the alligator, and Testudines
// and Squamata its classes for turtles and for lizards and snakes (Ruling 41).
const CLASS_CATEGORY = new Map([
  ['Actinopterygii', 'Fish'],
  ['Teleostei', 'Fish'],
  ['Actinopteri', 'Fish'],
  ['Elasmobranchii', 'Shark & Ray'],
  ['Holocephali', 'Shark & Ray'],
  ['Aves', 'Bird'],
  ['Mammalia', 'Mammal'],
  ['Reptilia', 'Reptile'],
  ['Crocodylia', 'Reptile'],
  ['Testudines', 'Reptile'],
  ['Squamata', 'Reptile'],
]);

/**
 * A species' category in the gallery (Ruling 37): the Java list's, where the species is on it with one; otherwise its
 * fish-ID class: bony fish are Fish; sharks, rays and chimaeras Shark & Ray; birds Bird; mammals Mammal; reptiles
 * Reptile; any other class of a phylum other than Chordata Invertebrate; anything else, or no class (a snapshot written
 * before the API carried class and phylum), Other.
 * @param {{ fish?: { class?: string | null, phylum?: string | null }, java?: { category: string | null } }} entry
 * @returns {string}
 */
export const categoryOf = ({ fish, java }) => {
  if (java?.category) return java.category;
  const cls = fish?.class ?? null;
  const phylum = fish?.phylum ?? null;
  if (cls === null) return 'Other';
  return CLASS_CATEGORY.get(cls) ?? (phylum !== null && phylum !== 'Chordata' ? 'Invertebrate' : 'Other');
};

// The order a card shows them in, as the 2a gallery's (scripts/sync-species.mjs, byName): the common name, else the
// scientific one, then the scientific name.
const byName = (/** @type {Species} */ a, /** @type {Species} */ b) =>
  (a.common ?? a.latin ?? '').localeCompare(b.common ?? b.latin ?? '', 'en', { sensitivity: 'base' }) ||
  (a.latin ?? '').localeCompare(b.latin ?? '', 'en') ||
  a.slug.localeCompare(b.slug, 'en');

/**
 * Every species of both lists exactly once, by the name a card shows. A species on both is one entry. A Java species
 * joins a fish-ID species when its scientific name, once normalised, is the fish-ID accepted name (`latin`), or else
 * the fish-ID id read as a name (Ruling 36: the id is the classifier's name, which the Java list can share while the
 * accepted name differs, "Carangoides ruber" for Caranx ruber); the accepted name joins first, so a Java species named
 * as the id joins only an entry still free. The entry's `latin` is the accepted name, and `also_listed_as` the Java
 * name where the two differ (else null). Its common name, conservation status and clips are the Java list's, as the 2a
 * gallery showed them; its order, photo, latest crop and counts are the fish-ID app's, and its family the fish-ID
 * catalogue's where it has one. A common name or family missing from one list is taken from the other. Its category is
 * categoryOf's (the Java category, else the fish-ID class). A Java-only species has no fish-ID id, no photo of its own
 * and no counts (0, last seen null); a fish-ID-only species has no Java id and no clips. Two species that would share a
 * page (one scientific name twice in a list, or two names with one slug) throw: no species is dropped or doubled
 * silently.
 * @param {Fish[]} fish
 * @param {JavaSpecies[]} javaSpecies
 * @param {Media[]} media
 * @returns {Species[]}
 */
export const unionSpecies = (fish, javaSpecies, media) => {
  /** @typedef {{ fish?: Fish, java?: JavaSpecies }} Entry */
  /** @type {Entry[]} */
  const entries = [];
  /** @type {Map<string, Entry>} the fish-ID entries by accepted name */
  const byLatin = new Map();
  for (const f of fish) {
    const key = keyOf(f.latin);
    if (key !== null && byLatin.has(key)) throw new Error(`unionSpecies: ${slugify(key)} is listed twice in the fish-ID list`);
    const entry = { fish: f };
    entries.push(entry);
    if (key !== null) byLatin.set(key, entry);
  }
  /** @type {Map<string, Entry>} the fish-ID entries by their id as a name, where that is not an accepted name */
  const byId = new Map();
  for (const entry of entries) {
    const name = entry.fish ? idName(entry.fish.species_id) : null;
    if (name !== null && !byLatin.has(name) && !byId.has(name)) byId.set(name, entry);
  }
  const javaKeys = new Set();
  /** @type {JavaSpecies[]} */
  const unmatched = [];
  for (const j of javaSpecies) {
    const key = keyOf(j.scientific_name);
    if (key !== null && javaKeys.has(key)) throw new Error(`unionSpecies: ${slugify(key)} is listed twice in the Java list`);
    if (key !== null) javaKeys.add(key);
    const entry = key === null ? undefined : byLatin.get(key);
    if (entry && !entry.java) entry.java = j;
    else unmatched.push(j);
  }
  for (const j of unmatched) {
    const key = keyOf(j.scientific_name);
    const entry = key === null ? undefined : byId.get(key);
    if (entry && !entry.java) entry.java = j;
    else entries.push({ java: j });
  }

  const list = entries.map(({ fish: f, java: j }) => {
    const latin = keyOf(f?.latin ?? j?.scientific_name);
    const javaName = keyOf(j?.scientific_name);
    const common = j?.common_name ?? f?.common ?? null;
    return {
      slug: slugify(latin ?? common ?? ''),
      latin,
      also_listed_as: f && j && javaName !== latin ? javaName : null,
      common,
      family: f?.family ?? j?.family ?? null,
      order: f?.order ?? null,
      category: categoryOf({ fish: f, java: j }),
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
 * species once in the order given, under its category (categoryOf); one outside CATEGORIES is under "Other".
 * @param {Species[]} list
 */
export const byCategory = (list) => groupByCategory(list);
