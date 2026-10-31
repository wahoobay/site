// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import publicImages from './src/lib/markdown-public-images.mjs';

// Why this plugin exists: with trailingSlash: 'always', Astro's dev server answers any path with no trailing slash and
// no file extension with its own trailing-slash 404, from middleware it puts at the front of the stack, so the
// /api/public proxy below never sees /api/public/cameras and the like. Once Astro has put its middleware there
// (enforce: 'post', so this runs after it), the plugin moves Vite's proxy middleware ahead of it. `npm run dev` only;
// the build is static and has no proxy.
// It finds the proxy by its function's name in Vite, viteProxyMiddleware (node_modules/vite/dist/node/chunks/node.js).
// If Vite renames it, the dev server warns at start that the /api/public proxy is not active: find the new name there
// (the middleware Vite adds for server.proxy) and put it in PROXY_MIDDLEWARE.
const PROXY_MIDDLEWARE = 'viteProxyMiddleware';
const devProxyFirst = {
  name: 'wahoobay:dev-proxy-first',
  enforce: /** @type {const} */ ('post'),
  /** @param {import('vite').ViteDevServer} server */
  configureServer(server) {
    return () => {
      const { stack } = server.middlewares;
      const at = stack.findIndex((layer) => typeof layer.handle === 'function' && layer.handle.name === PROXY_MIDDLEWARE);
      if (at > 0) stack.unshift(...stack.splice(at, 1));
      else if (at < 0) {
        server.config.logger.warn(
          `[wahoobay:dev-proxy-first] Vite's ${PROXY_MIDDLEWARE} is not in the dev server's middleware, so the /api/public proxy is not active: Astro's trailing-slash 404 will answer /api/public/... (see astro.config.mjs).`,
        );
      }
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
