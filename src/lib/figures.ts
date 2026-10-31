// The impact figures' build-time sources (Rulings 51 and 58): a figure named by its source rather than written down.
// Species documented is the species explorer's count, the species /live/species/ lists (unionSpecies over the
// committed snapshots), so the home page's figure (src/components/Figures.astro, `from: explorer` in
// src/content/figures.json) and the Support page's list (src/content/pages/get-involved/support.md, where the Markdown
// writes {species-documented}) never disagree with the explorer.
import fish from '../data/fish.json';
import species from '../data/species.json';
import media from '../data/media.json';
import { unionSpecies } from './explorer.mjs';

/** Each source's value at build time. */
export const FIGURE_SOURCES = {
  explorer: () => unionSpecies(fish, species, media).length,
} as const;

/** The token a page's Markdown writes for a figure, and its source. */
const TOKENS: Record<string, keyof typeof FIGURE_SOURCES> = { '{species-documented}': 'explorer' };

const fmt = new Intl.NumberFormat('en-US');

/** A page's rendered HTML with each figure token as its value ("211"). */
export const fillFigures = (html: string): string =>
  Object.entries(TOKENS).reduce((out, [token, source]) => out.replaceAll(token, fmt.format(FIGURE_SOURCES[source]())), html);
