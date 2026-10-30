// The species gallery (/live/species/): its categories, and the grouping and lookups the page draws from the committed
// snapshot in src/data/ (scripts/sync-species.mjs writes it). A plain module, so the tests read it without a build
// (tests/species.test.mjs).

/** The old gallery's categories, in its order (its filter, and the list its reviewers filed species under). */
export const CATEGORIES = ['Fish', 'Shark & Ray', 'Invertebrate', 'Reptile', 'Bird', 'Mammal', 'Other'];

/**
 * The species by category: a Map with every one of CATEGORIES, in that order, each species exactly once, in the order
 * given. A species with no category, or one outside CATEGORIES, is under "Other".
 * @template {{ category?: string | null }} T
 * @param {T[]} species
 * @returns {Map<string, T[]>}
 */
export const groupByCategory = (species) => {
  const groups = new Map(CATEGORIES.map((c) => [c, /** @type {T[]} */ ([])]));
  for (const s of species) groups.get(s.category && CATEGORIES.includes(s.category) ? s.category : 'Other')?.push(s);
  return groups;
};

/**
 * One species' clips, in the snapshot's order (newest first).
 * @template {{ species_id: number }} T
 * @param {number} speciesId
 * @param {T[]} media
 * @returns {T[]}
 */
export const mediaFor = (speciesId, media) => media.filter((m) => m.species_id === speciesId);

/**
 * A category's heading id and jump-list anchor: "Shark & Ray" is `shark-ray`.
 * @param {string} category
 */
export const categoryId = (category) => category.toLowerCase().replace(/[^a-z]+/g, '-');

/**
 * The initials square's letters: the first letters of a name's first and last words, "Bluehead wrasse" is BW.
 * @param {string} name
 */
export const initials = (name) => {
  const words = name.trim().split(/\s+/).filter((w) => /^[a-z]/i.test(w));
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked.map((w) => w[0].toUpperCase()).join('');
};
