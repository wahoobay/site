// Scientific names, written one way across the site's two species lists: the Java API's (scripts/sync-species.mjs
// writes them so) and the fish-ID app's, which the species explorer merges on this form (src/lib/explorer.mjs). A plain
// module, so the sync and the tests read it without a build.

/**
 * A scientific name as nomenclature writes it: "Genus species", the genus capitalised, every other word lower case
 * ("Diodon Hystrix" is "Diodon hystrix", a subspecies' third word too), "sp." and "spp." left alone; null stays null.
 * @param {string | null} name
 */
export const binomial = (name) =>
  name === null
    ? null
    : name
        .split(/\s+/)
        .map((word, i) => (/^spp?\.$/i.test(word) ? word : i === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()))
        .join(' ');
