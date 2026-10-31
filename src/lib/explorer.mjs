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
 * @typedef {{ id: number, species_id: number, kind: string, url: string, thumb: string | null, title?: string | null, date?: string | null }} Media
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

/**
 * Ruling 42: the fish-ID species whose numbers the site does not show, by accepted name. The fish-ID catalogue lists
 * the West Indian manatee (Trichechus manatus) with 41 "sightings" in a week, and every crop of them is a fish: a
 * wrong classifier label, which the public site must not present as the camera's record. unionSpecies treats a
 * doubtful species as if the fish-ID app did not list it (no id, no counts, no crop, no photo, so no "Seen N times",
 * no island and no charts); on the Java list it keeps its own entry, photographs, words and category. The snapshot
 * (src/data/fish.json) still carries the row. The fix is the fish-ID reviewers' (retire or retrain the label); a
 * species leaves this list when they have.
 */
export const DOUBTFUL = Object.freeze(new Set(['Trichechus manatus']));

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
 * and no counts (0, last seen null); a fish-ID-only species has no Java id and no clips. A fish-ID species on DOUBTFUL
 * (Ruling 42) is read as if the fish-ID app did not list it: a Java species of that name is Java-only, and one the Java
 * list does not have is left out. Two species that would share a page (one scientific name twice in a list, or two
 * names with one slug) throw: no other species is dropped or doubled silently.
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
  for (const f of fish.filter((x) => !DOUBTFUL.has(keyOf(x.latin) ?? ''))) {
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
      // The Java list has some clips twice (another id, the same file): each file once, its first entry.
      media: j ? mediaFor(j.id, media).filter((m, i, all) => all.findIndex((x) => x.url === m.url) === i) : [],
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

/** @typedef {{ src: string, credit: string | null, sameOrigin: boolean }} Picture */

/**
 * A species' picture, on its card and its page (Rulings 13, 17, AE, 48 and 61): the fish-ID catalogue's reference
 * photo with its attribution as the credit line, else the first volunteer photo (its first clip of kind image with a
 * thumbnail), else the camera's latest crop (small and often blurred), else the first video's thumbnail (often a
 * frame of empty water, with the camera's overlay burned in), else null, a card of words only. `sameOrigin` is a
 * picture on the site's own origin, the fish-ID app's /api/public/ path, which the page hides when it does not load
 * (the app can be down, or have no such picture).
 * @param {Pick<Species, 'photo' | 'latest_crop' | 'media'>} species
 * @returns {Picture | null}
 */
export const pictureOf = ({ photo, latest_crop, media }) => {
  const pick = (/** @type {string} */ src, /** @type {string | null} */ credit) => ({ src, credit, sameOrigin: src.startsWith('/api/public/') });
  if (photo?.url) return pick(photo.url, photo.attribution ?? null);
  const image = media.find((m) => m.kind === 'image' && m.thumb)?.thumb;
  if (image) return pick(image, null);
  if (latest_crop) return pick(latest_crop, null);
  const video = media.find((m) => m.kind === 'video' && m.thumb)?.thumb;
  return video ? pick(video, null) : null;
};

/**
 * A species page's gallery of the volunteers' clips (Ruling 48): every clip but the one the page's picture is (its
 * first volunteer photo, or a video's thumbnail, when that is the picture, and any other entry with the same
 * thumbnail), in the snapshot's order, and that clip (`pictureClip`), which the page's picture links to instead; the
 * page shows a video's thumbnail whole (Ruling 61).
 * @param {Pick<Species, 'photo' | 'latest_crop' | 'media'>} species
 * @returns {{ pictureClip: Media | null, clips: Media[] }}
 */
export const galleryOf = (species) => {
  const picture = pictureOf(species);
  const pictureClip = (picture && !picture.sameOrigin && !species.photo?.url && species.media.find((m) => m.thumb === picture.src)) || null;
  return { pictureClip, clips: species.media.filter((m) => !pictureClip || m.thumb !== pictureClip.thumb) };
};

// A clip's date as the Java list writes it ("2026-03-29T00:00", the volunteer's own clock): read as written.
const CLIP_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
// katie: review: new words (a volunteer's photo, under it in a species page's gallery, when the list has no date for it)
const VOLUNTEER_PHOTO = 'Volunteer photo';
// katie: review: new words (the same for a video's thumbnail)
const VOLUNTEER_VIDEO = 'Volunteer video';

/**
 * A clip's caption in a species page's gallery (Ruling 48): its date ("Mar 29, 2026"), else what it is.
 * @param {Pick<Media, 'kind'> & { date?: string | null }} clip
 */
export const clipCaption = ({ kind, date }) => {
  const day = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (day) return CLIP_DATE.format(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
  return kind === 'video' ? VOLUNTEER_VIDEO : VOLUNTEER_PHOTO;
};

/**
 * How often the camera has seen a species, as its card says it: "Seen once", "Seen 1,204 times"; null for never (a
 * species the camera has not seen, or one the fish-ID app does not list), so the card says nothing.
 * @param {number | null | undefined} total
 */
export const seenTimes = (total) => {
  if (typeof total !== 'number' || !(total > 0)) return null;
  // katie: review: new words (a species card: how often the reef camera has seen it, "Seen once")
  if (total === 1) return 'Seen once';
  // katie: review: new words ("Seen 412 times")
  return `Seen ${total.toLocaleString('en-US')} times`;
};
