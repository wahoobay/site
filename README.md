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

Page copy goes in `src/content/` as Markdown, JSON or YAML, one file per page or entry, with the URL following the file's path: `src/content/pages/about/mission.md` is `/about/mission/`, `src/content/pages/about/index.md` is `/about/`. A page's front matter gives its `title` (the heading), `description`, `section` (`visit`, `learn`, `live`, `get-involved` or `about`), and optionally `nav` (its label in the section's "In this section" links), `order` (its place there), `hero` (a banner photo) and `actions` (up to three buttons under the introduction, each `label`, `href` and `variant`: `action`, `ghost`, or `accent` for Donate alone); `src/content.config.ts` has the schema. Its body starts at `##` headings, since the title is the page's only `#`. Pages in `src/pages/` and components in `src/components/` render the copy, `src/layouts/Page.astro` lays out a Markdown page, and `src/layouts/Base.astro` is the shell every page uses (head, navigation, footer). The home page and the footer are the exception: their copy is edited in `src/pages/index.astro` and `src/components/Footer.astro`. Images and files served as they are go in `public/`: a page's photos in `public/images/<section>/`, made with `sips -Z 1600 -s format jpeg --setProperty formatOptions 74 <original> --out <photo>.jpg` (1600 px on the long side, quality 74), or the original file itself whenever that comes out larger; downloads in `public/docs/`. Styling comes from the design system's tokens and classes; `src/styles/site.css` holds layout rules only, with no colours. Changes arrive as pull requests; see `CLAUDE.md` for the ground rules.

## Deploying

The `deploy` workflow (`.github/workflows/deploy.yml`) is the only way to deploy. A push to `main` builds, tests and deploys to staging (`staging.wahoobay.net`, behind Basic auth), then verifies it. Production is a manual dispatch with a commit SHA that is already on `main` and the word `deploy` to confirm; it records a `site-prod-…` release.

It reads these repository variables: `STAGING_ROLE_ARN`, `STAGING_BUCKET`, `STAGING_DISTRIBUTION_ID`, `STAGING_KVS_ARN`, `STAGING_HOSTNAME`, and the secret `STAGING_BASIC_AUTH`; production uses the `PROD_*` variables (`PROD_ROLE_ARN`, `PROD_BUCKET`, `PROD_DISTRIBUTION_ID`, `PROD_KVS_ARN`, `PROD_DISTRIBUTION_DOMAIN`). Their values are the outputs of the `site-wahoobay-staging` and `site-wahoobay-prod` stacks.
