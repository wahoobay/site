# wahoobay.net

The Wahoo Bay website: an [Astro](https://astro.build) static site styled entirely by the Wahoo Bay design system, [`wahoobay/design`](https://github.com/wahoobay/design), which it installs from a release tag.

## Run, build, test, check

Node 22 or later (`.nvmrc`).

```sh
npm ci              # install, exactly as the lockfile says
npm run dev         # local server with live reload, http://localhost:4321; it sends /api/public/ to the staging fish-ID app
npm run build       # type-check (astro check), then build the site into dist/
npm test            # node --test 'tests/*.test.mjs', against dist/ (build first)
npm run check       # the Impeccable design detector on dist/
npm run check:links # every internal link and image in dist/ resolves (a path under /api/public/ is the fish-ID app's: skipped, and counted)
npm run preview     # serve dist/ locally
npm run sync:species # by hand only, never in CI: re-read the Java API's species and media lists into src/data/ for /live/species/; commit the two files
npm run sync:datasources # by hand only, never in CI: re-read the Java API's list of sites into src/data/datasources.json for the map at /visit/map/; commit the file
npm run sync:fish   # by hand only, never in CI: re-read the fish-ID app's public species list (SYNC_API, default https://staging-ai.wahoobay.net) into src/data/fish.json for the species explorer at /live/species/; commit the file
```

The live pages' islands read the fish-ID app's public API at `/api/public/` on the site's own origin: the deployed site's distribution sends that path to the environment's fish-ID app, and `npm run dev` sends it to staging's, `https://staging-ai.wahoobay.net` (the dev server's proxy in `astro.config.mjs`; the built site is static and has none). `npm run sync:fish` writes one entry a species: where the fish-ID app lists a species under two ids (its classifier's current label and an older one), the snapshot keeps the id seen most recently, sums the two ids' sightings, and keeps the earliest first sighting and the latest last one. The snapshot keeps every species the API lists; the explorer leaves out the fish-ID numbers of the species on `DOUBTFUL` in `src/lib/explorer.mjs` (a classifier label the reviewers have yet to fix: the manatee, whose "sightings" are fish), showing such a species from the Java list alone.

`src/data/fish.json` is a snapshot of staging's fish-ID app: staging's species ids, counts, dates and crop ids. Production has its own database, so before any production build run `SYNC_API=https://ai.wahoobay.net npm run sync:fish` and commit the result; until production's fish-ID app has data, that snapshot is empty and the explorer shows the volunteers' list alone.

CI runs `npm ci`, `npm run build`, `npm test`, `npm run check` and `npm run check:links` on every pull request and on every push to `main`; all five must pass. Deploys (`deploy:staging`, `deploy:prod`) go through GitHub Actions only, never from a laptop.

## Where things go

Page copy goes in `src/content/` as Markdown, JSON or YAML, one file per page or entry, with the URL following the file's path: `src/content/pages/about/mission.md` is `/about/mission/`, `src/content/pages/about/index.md` is `/about/`. A page's front matter gives its `title` (the heading), `description`, `section` (`visit`, `learn`, `live`, `get-involved` or `about`), and optionally `nav` (its label in the section's "In this section" links), `order` (its place there), `hero` (a banner photo, shown in a band that crops it), `heroPosition` (`top` or `bottom` keeps that edge of the banner in the band; `center` is the default) and `actions` (up to three buttons under the introduction, each `label`, `href` and `variant`: `action`, `ghost`, or `accent` for Donate alone); `src/content.config.ts` has the schema. Its body starts at `##` headings, since the title is the page's only `#`. Pages in `src/pages/` and components in `src/components/` render the copy, `src/layouts/Page.astro` lays out a Markdown page, and `src/layouts/Base.astro` is the shell every page uses (head, navigation, footer). The home page and the footer are the exception: their copy is edited in `src/pages/index.astro` and `src/components/Footer.astro`. Images and files served as they are go in `public/`: a page's photos in `public/images/<section>/`, made with `sips -Z 1600 -s format jpeg --setProperty formatOptions 74 <original> --out <photo>.jpg` (1600 px on the long side, quality 74), or the original file itself whenever that comes out larger; downloads in `public/docs/`. Styling comes from the design system's tokens and classes; `src/styles/site.css` holds layout rules only, with no colours. Changes arrive as pull requests; see `CLAUDE.md` for the ground rules.

The Live reef pages are Astro pages of their own under `src/pages/live/`, each with the Live reef navigation (`liveNav` in `src/lib/nav.mjs`): the camera (`/live/`) and reef highlights (`/live/highlights/`), whose copy is in `src/content/live/`; the species explorer (`/live/species/`, and a page per species from the snapshots in `src/data/`); trends (`/live/trends/`); the data dashboards (`/live/data/`); the open data (`/live/downloads/`, the fish-ID app's public exports as the `exports` list in the front matter of `src/content/pages/live/downloads.md` gives them); and log a sighting (`/live/log-a-sighting/`). A Markdown file under `src/content/pages/live/` is a live page's copy, never a page of its own.

## Adding content

Every change below is checked the same way before it merges: `npm run build && npm test && npm run check && npm run check:links` must all pass.

**A page.** Add a Markdown file under `src/content/pages/<section>/`, where `<section>` is one of `visit`, `learn`, `get-involved` or `about` (the `live` pages are built by their own pages under `src/pages/live/`, above). Its front matter needs `title`, `description` and `section` (the same as the folder); add `nav`, `order`, `hero`, `heroPosition` and `actions` as described above. `actions` is a list of up to three buttons, for example:

```yaml
actions:
  - { label: Plan your visit, href: /visit/, variant: action }
```

Start the body at `##`. Put the page's photos in `public/images/<section>/`, made with the `sips` command above (1600 px, quality 74; keep the original when it is smaller) and refer to them as `/images/<section>/<name>.jpg`. Copy is migrated or approved, not invented: where you are unsure of a fact, add `<!-- katie: review: what you are unsure of -->` next to it.

**A lesson.** Add a YAML file to `src/content/lessons/`, copying `coral-reefs.yaml`: `title`, `slug`, `grades` (one or more of the `slug` values in `src/content/grades.json`: `educators`, `art-and-science`, `collegiate`, `prek`, `fourth-grade`, `ninth-grade`) and `links` (each with a `label`, a `kind` of `pdf`, `doc`, `slides`, `form` or `site`, and a `url` starting `https://` or `/docs/`). The file name without `.yaml` is the lesson's URL slug (`/learn/courses/<slug>/`) and must equal `slug`. A new lesson needs no redirect. The 15 original course slugs are pinned by the tests because their old `/pages/courses/<slug>` addresses redirect to them, so do not rename those files.

**A news post.** Add `src/content/news/<slug>.md`, which becomes `/news/<slug>/`. Its front matter needs `title`, `date` (written `YYYY-MM-DD`; `/news/` lists newest first) and `description` (the line under the title in the list), and may have `image` (a path under `public/images/news/`). The body starts at `##`. No iframes: a test fails the build for any outside the two live pages, so link to a video instead of embedding it.

**Marks for Katie.** Collect every open question with `grep -rn "katie: review" src/`. A mark is an HTML comment (`<!-- katie: review: ... -->`) in Markdown and `.astro` files and a `#` comment in YAML. When Katie settles one, edit the copy and delete the mark.

## Contributing as a student

Fork the repository, make a branch, change files under `src/content/` (or whatever your task is), and open a pull request against `main`. CI runs the same four commands as above (`npm run build`, `npm test`, `npm run check`, `npm run check:links`, after `npm ci`), so run them locally first. Never commit a password, key or token; the site needs none to build. If you are not sure a sentence is true, say so with a `katie: review` mark rather than guessing. You need no AWS access and are given none: deploys happen only from GitHub Actions after a maintainer merges.

## What comes next

The site you see here is step 1 of the overhaul. Step 2 gives the live-reef pages a public face for the fish-ID data (live detections, a species explorer and trends), read from `/api/public/` on the same origin. Step 3 moves the Java API's sighting form into this site, and step 5 is the cutover that moves the `wahoobay.net` apex here. For the reasons and the full plan read `docs/superpowers/specs/2026-10-29-wahoobay-net-overhaul-design.md` (section 4.6 lists the steps) in the [infra repository](https://github.com/wahoobay/infra).

## Deploying

The `deploy` workflow (`.github/workflows/deploy.yml`) is the only way to deploy. A push to `main` builds, tests, runs the design check (`npm run check`) and the link check (`npm run check:links`), and deploys to staging (`staging.wahoobay.net`, behind Basic auth), then verifies it. Production is a manual dispatch with a commit SHA that is already on `main` and the word `deploy` to confirm; it records a `site-prod-…` release.

It reads these repository variables: `STAGING_ROLE_ARN`, `STAGING_BUCKET`, `STAGING_DISTRIBUTION_ID`, `STAGING_KVS_ARN`, `STAGING_HOSTNAME`, and the secret `STAGING_BASIC_AUTH`; production uses the `PROD_*` variables (`PROD_ROLE_ARN`, `PROD_BUCKET`, `PROD_DISTRIBUTION_ID`, `PROD_KVS_ARN`, `PROD_DISTRIBUTION_DOMAIN`). Their values are the outputs of the `site-wahoobay-staging` and `site-wahoobay-prod` stacks. The build itself reads three public settings. `PUBLIC_AI_URL` is the address of the fish-ID app that the navigation's Fish ID link opens: the workflow sets `https://staging-ai.wahoobay.net/` for staging and `https://ai.wahoobay.net/` for production, and a build without it (local, CI) links staging. `PUBLIC_MAPBOX_TOKEN` turns on the interactive map at `/visit/map/`: the workflow reads it from the repository variable `MAPBOX_TOKEN`, a public Mapbox token (`pk.…`, never a secret one, which stops the build) restricted to `staging.wahoobay.net`, `wahoobay.net` and `www.wahoobay.net`; a build without it shows the map as a picture. `PUBLIC_SITE_ENV` is `staging` or `production`, the environment the build is for.
