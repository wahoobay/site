// The pages collection's addresses and its "In this section" lists.
import { getCollection, type CollectionEntry } from 'astro:content';

export type PageEntry = CollectionEntry<'pages'>;

/** An entry's URL. The glob loader's id is the file's path without the extension or a trailing /index. */
export const urlOf = (entry: PageEntry) => `/${entry.id}/`;

/** The pages of one section, in their `order` (pages without one go last, then by title). */
export async function sectionPages(section: PageEntry['data']['section']) {
  const pages = await getCollection('pages', (entry) => entry.data.section === section);
  return pages.sort(
    (a, b) =>
      (a.data.order ?? Infinity) - (b.data.order ?? Infinity) || a.data.title.localeCompare(b.data.title),
  );
}
