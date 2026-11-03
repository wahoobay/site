// A species' names as the admin reads them: the one place that knows the placeholder the Java API stores for a name a
// visitor typed. SightingWriteService.resolveSpeciesId, given a common name no species has, makes a provisional species
// with name_status 'provisional', that name as its common name, and "[unverified] <that name>" as its scientific name
// (the column is the species' natural key, so it cannot be empty). The placeholder is never a scientific name. Used by
// the sighting screens (sightings.mjs, and through sightingRow the dashboard and the recycle bin) and the catalogue
// (catalogue.mjs). A plain module, so the tests read it without a build (tests/admin-names.test.mjs).

/** The mark at the start of the placeholder, any case, with the spaces around it. */
const PLACEHOLDER = /^\s*\[unverified\]\s*/i;

/** A value as text, trimmed; nothing is "". @param {unknown} value */
const plain = (value) => (value === null || value === undefined ? '' : String(value).trim());

/** Whether a scientific name is the "[unverified] …" placeholder. @param {unknown} value */
export const isPlaceholder = (value) => PLACEHOLDER.test(plain(value));

/**
 * A scientific name as text, or null when there is none or it is the placeholder.
 * @param {unknown} value
 * @returns {string | null}
 */
export const scientificName = (value) => {
  const text = plain(value);
  return text && !isPlaceholder(text) ? text : null;
};

/**
 * A name a visitor typed, which no reviewer has confirmed: name_status 'provisional', or the placeholder as its
 * scientific name. A reviewer confirms it by clearing name_status and giving a real scientific name.
 * @param {any} s a species, or a sighting row carrying its species' fields
 */
export const isProvisional = (s) => s?.name_status === 'provisional' || isPlaceholder(s?.scientific_name);

/**
 * What the visitor typed, for a provisional name only: its common name (the words as sent), else the placeholder's own
 * words; null for a confirmed name, or when nothing was typed.
 * @param {any} s
 * @returns {string | null}
 */
export const visitorsName = (s) => {
  if (!isProvisional(s)) return null;
  const sci = plain(s?.scientific_name);
  return plain(s?.common_name) || (isPlaceholder(sci) ? sci.replace(PLACEHOLDER, '').trim() : '') || null;
};
