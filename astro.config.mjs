// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import publicImages from './src/lib/markdown-public-images.mjs';

// The dev server's proxy (below) first: Astro's dev server answers a path with no trailing slash with its own 404
// (trailingSlash: 'always') ahead of Vite's proxy, and the API's paths have none. Once Astro has put its own
// middleware at the front, this moves Vite's proxy ahead of it. `npm run dev` only.
const devProxyFirst = {
  name: 'wahoobay:dev-proxy-first',
  enforce: /** @type {const} */ ('post'),
  /** @param {import('vite').ViteDevServer} server */
  configureServer(server) {
    return () => {
      const { stack } = server.middlewares;
      const at = stack.findIndex((layer) => typeof layer.handle === 'function' && layer.handle.name === 'viteProxyMiddleware');
      if (at > 0) stack.unshift(...stack.splice(at, 1));
    };
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://wahoobay.net',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [react(), sitemap()],
  // Astro's default Markdown processor, with the size and lazy loading of the pages' photos.
  markdown: { processor: satteri({ hastPlugins: [publicImages()] }) },
  // `npm run dev` only (the build is static): the islands fetch /api/public/... on the site's own origin, which the
  // deployed site's distribution sends to the environment's fish-ID app; the dev server sends it to staging's.
  vite: {
    plugins: [devProxyFirst],
    server: { proxy: { '/api/public': { target: 'https://staging-ai.wahoobay.net', changeOrigin: true } } },
  },
});
