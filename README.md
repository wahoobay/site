# wahoobay.net

The Wahoo Bay website: an [Astro](https://astro.build) static site styled entirely by the Wahoo Bay design system, [`wahoobay/design`](https://github.com/wahoobay/design), which it installs from a release tag.

## Run, build, test, check

Node 22 or later (`.nvmrc`).

```sh
npm ci              # install, exactly as the lockfile says
npm run dev         # local server with live reload, http://localhost:4321
npm run build       # type-check (astro check), then build the site into dist/
npm test            # node --test 'tests/*.test.mjs', against dist/ (build first)
npm run check       # the Impeccable design detector on dist/
npm run preview     # serve dist/ locally
```

CI runs `npm ci`, `npm run build`, `npm test` and `npm run check` on every pull request and on every push to `main`; all four must pass. Deploys (`deploy:staging`, `deploy:prod`) go through GitHub Actions only, never from a laptop.

## Where things go

Page copy goes in `src/content/` as Markdown, JSON or YAML, one file per page or entry, with the URL following the file's path (the collections arrive with the migrated pages); pages in `src/pages/` and components in `src/components/` render it, and `src/layouts/Base.astro` is the shell every page uses (head, navigation, footer). The home page and the footer are the exception: their copy is edited in `src/pages/index.astro` and `src/components/Footer.astro`. Images and files served as they are go in `public/`. Styling comes from the design system's tokens and classes; `src/styles/site.css` holds layout rules only, with no colours. Changes arrive as pull requests; see `CLAUDE.md` for the ground rules.
