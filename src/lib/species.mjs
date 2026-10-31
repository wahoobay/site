// The species explorer's categories (/live/species/, the step-2a gallery's), and the grouping and lookups it draws from
// the committed Java snapshot in src/data/ (scripts/sync-species.mjs writes it); src/lib/explorer.mjs merges that with
// the fish-ID app's. A plain module, so the tests read it without a build (tests/species.test.mjs).

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
