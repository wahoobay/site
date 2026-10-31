# CLAUDE.md

wahoobay.net: an Astro static site on the `@wahoobay/design` system (pinned by Git tag in `package.json`). `PRODUCT.md` says who it is for and what it must keep; `README.md` says how to run it.

- Page copy lives in `src/content/**` as Markdown, JSON or YAML (`src/content.config.ts` has the collections; `src/content/pages/<section>/<page>.md` is `/<section>/<page>/`); pages and components render it. The exceptions are the home page (`src/pages/index.astro`) and the footer (`src/components/Footer.astro`), whose copy is edited in the component. Copy is migrated from the old site, not written: no new claims; mark anything uncertain `<!-- katie: review -->`.
- Styling only through `@wahoobay/design` tokens and classes (`var(--wb-…)`, `.wb-…`). No hex or other colour literals, no page-local colours, no `style=` attributes, no `font:` shorthand (it resets the design's ligature setting). `src/styles/site.css` is layout only. A missing token or component is a pull request to `wahoobay/design` first, then a version bump here.
- Dark theme (`theme="dark"` on `Base.astro`, or `data-theme="dark"` on a section) is for the live-camera pages and, on the home page only, the live band and the footer.
- Islands read the fish-ID app's public API by relative path under `/api/public/` (`fetchJson` in `src/lib/public-api.mjs`); they never call the fish-ID host, except for a camera's stream and snapshot images, at `PUBLIC_AI_URL` (`streamUrl`).
- The three syncs, `npm run sync:species`, `sync:datasources` and `sync:fish`, are run by hand, never in CI, and write the committed snapshots in `src/data/`; `astro dev` proxies `/api/public` to staging-ai (`astro.config.mjs`), and the built site has no proxy.
- Nothing secret in the repository, commits or chat. The site needs no credentials to build.
- Students contribute by fork and pull request; nobody needs AWS access to work on the site. Deploys go through GitHub Actions only.
- Tests first: write the failing `node --test` test in `tests/`, then the change.
- Before every pull request: `npm run build && npm test && npm run check` (check is the Impeccable detector on `dist/`; fix findings, do not waive them, unless the design system already sanctions the case: its docs page and tests name the allowed per-element waivers, and the site uses the same attribute on the same elements and nothing else).
