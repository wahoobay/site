// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import publicImages from './src/lib/markdown-public-images.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://wahoobay.net',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [react(), sitemap()],
  // Astro's default Markdown processor, with the size and lazy loading of the pages' photos.
  markdown: { processor: satteri({ hastPlugins: [publicImages()] }) },
});
