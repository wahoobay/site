// The content collections. One Markdown file per page; the file's path under src/content/pages/ is its URL
// (about/mission.md → /about/mission/, about/index.md → /about/).
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
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
    /**
     * Up to three buttons under the lead: the page's main actions, where the old page led with buttons.
     * `accent` is for Donate or Give only (the design keeps that colour for giving and "live now").
     */
    actions: z
      .array(
        z.object({
          label: z.string(),
          href: z.string(),
          variant: z.enum(['action', 'accent', 'ghost']).default('action'),
        }),
      )
      .max(3)
      .optional(),
  }),
});

// News posts: src/content/news/<slug>.md is /news/<slug>/. They belong to no section, so no navigation lists them;
// /news/ lists them newest first.
const news = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    /** The line under the title in the list at /news/. */
    description: z.string(),
    /** A photo under public/, shown with the post. */
    image: z.string().optional(),
  }),
});

// The people at /about/board/, one JSON file each, shown in `order`. `photo` is a path under public/;
// a member without one shows initials.
const board = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/board' }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    photo: z.string().optional(),
    order: z.number(),
    bio: z.string().optional(),
  }),
});

// The logos at /get-involved/partners/, one JSON file each, grouped and shown in `order`. The groups are the
// old site's three logo folders. `url` is the partner's website; a partner without one shows its logo unlinked.
const partners = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/partners' }),
  schema: z.object({
    name: z.string(),
    url: z.string().url().optional(),
    logo: z.string(),
    group: z.enum(['university-education', 'community-government', 'environmental']),
    order: z.number(),
  }),
});

// The old site's six "Educational resources" groups, in its order, at /learn/<slug>/. `old` is the old name, in the
// old address /pages/education/<old> (for the redirects); `image` is the old tile under public/images/grades/.
const grades = defineCollection({
  loader: file('src/content/grades.json'),
  schema: z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    old: z.string(),
    image: z.string(),
  }),
});

// The courses, one YAML file each, at /learn/courses/<slug>/. `slug` is the old site's: lodash's kebabCase of the
// title, which made /pages/courses/<slug>. `grades` are the grade slugs (src/content/grades.json) that list it.
// `links` are its documents in the old page's order; `kind` is printed after each label.
const lessons = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    grades: z.array(z.string()).min(1),
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().regex(/^(https:\/\/|\/docs\/)/),
          kind: z.enum(['pdf', 'doc', 'slides', 'form', 'site']),
        }),
      )
      .min(1),
  }),
});

// The two Live reef pages' copy: src/content/live/camera.md is /live/, highlights.md is /live/highlights/.
// `video` is the YouTube video, or with `playlist` the playlist, that the page embeds above the copy.
const live = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/live' }),
  schema: z.object({
    title: z.string(),
    /** The meta description and the lead under the video. */
    description: z.string(),
    video: z.string(),
    playlist: z.boolean().default(false),
  }),
});

export const collections = { pages, news, board, partners, grades, lessons, live };
