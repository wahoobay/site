// The content collections. One Markdown file per page; the file's path under src/content/pages/ is its URL
// (about/mission.md → /about/mission/, about/index.md → /about/).
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    /** The page's h1 and the first part of its <title>. */
    title: z.string(),
    /** The meta description; also the page's lead paragraph unless the body opens with its own. */
    description: z.string(),
    /** The navigation section the page belongs to; its "In this section" list shows the section's pages. */
    section: z.enum(['visit', 'learn', 'live', 'get-involved', 'about']),
    /** A shorter label for the section navigation; the title is used when it is absent. */
    nav: z.string().optional(),
    /** The page's place in the section navigation, lowest first. */
    order: z.number().optional(),
    /** A photo under public/ shown as the page's banner and used as its social-card image. */
    hero: z.string().optional(),
  }),
});

export const collections = { pages };
