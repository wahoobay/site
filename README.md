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
npm run check:links # every internal link and image in dist/ resolves
npm run preview     # serve dist/ locally
```

CI runs `npm ci`, `npm run build`, `npm test`, `npm run check` and `npm run check:links` on every pull request and on every push to `main`; all five must pass. Deploys (`deploy:staging`, `deploy:prod`) go through GitHub Actions only, never from a laptop.

## Where things go

Page copy goes in `src/content/` as Markdown, JSON or YAML, one file per page or entry, with the URL following the file's path: `src/content/pages/about/mission.md` is `/about/mission/`, `src/content/pages/about/index.md` is `/about/`. A page's front matter gives its `title` (the heading), `description`, `section` (`visit`, `learn`, `live`, `get-involved` or `about`), and optionally `nav` (its label in the section's "In this section" links), `order` (its place there), `hero` (a banner photo) and `actions` (up to three buttons under the introduction, each `label`, `href` and `variant`: `action`, `ghost`, or `accent` for Donate alone); `src/content.config.ts` has the schema. Its body starts at `##` headings, since the title is the page's only `#`. Pages in `src/pages/` and components in `src/components/` render the copy, `src/layouts/Page.astro` lays out a Markdown page, and `src/layouts/Base.astro` is the shell every page uses (head, navigation, footer). The home page and the footer are the exception: their copy is edited in `src/pages/index.astro` and `src/components/Footer.astro`. Images and files served as they are go in `public/`: a page's photos in `public/images/<section>/`, made with `sips -Z 1600 -s format jpeg --setProperty formatOptions 74 <original> --out <photo>.jpg` (1600 px on the long side, quality 74), or the original file itself whenever that comes out larger; downloads in `public/docs/`. Styling comes from the design system's tokens and classes; `src/styles/site.css` holds layout rules only, with no colours. Changes arrive as pull requests; see `CLAUDE.md` for the ground rules.

## Adding content

Every change below is checked the same way before it merges: `npm run build && npm test && npm run check && npm run check:links` must all pass.

**A page.** Add a Markdown file under `src/content/pages/<section>/`, where `<section>` is one of `visit`, `learn`, `get-involved` or `about` (the `live` pages are the two files in `src/content/live/`). Its front matter needs `title`, `description` and `section` (the same as the folder); add `nav`, `order`, `hero` and `actions` as described above. `actions` is a list of up to three buttons, for example:

```yaml
actions:
  - { label: Plan your visit, href: /visit/, variant: action }
```

Start the body at `##`. Put the page's photos in `public/images/<section>/`, made with the `sips` command above (1600 px, quality 74; keep the original when it is smaller) and refer to them as `/images/<section>/<name>.jpg`. Copy is migrated or approved, not invented: where you are unsure of a fact, add `<!-- katie: review: what you are unsure of -->` next to it.

**A lesson.** Add a YAML file to `src/content/lessons/`, copying `coral-reefs.yaml`: `title`, `slug`, `grades` (one or more of the `slug` values in `src/content/grades.json`: `educators`, `art-and-science`, `collegiate`, `prek`, `fourth-grade`, `ninth-grade`) and `links` (each with a `label`, a `kind` of `pdf`, `doc`, `slides`, `form` or `site`, and a `url` starting `https://` or `/docs/`). The file name without `.yaml` is the lesson's URL slug (`/learn/courses/<slug>/`) and must equal `slug`. `tests/redirects.test.mjs` pins the 15 existing lessons to their old `/pages/courses/<slug>` addresses in `redirects.json`, so never rename one; a genuinely new lesson has no old address, and the test's count of 15 (and the redirect table) is then updated in the same pull request, with a sentence saying why.

**A news post.** Add `src/content/news/<slug>.md`, which becomes `/news/<slug>/`. Its front matter needs `title`, `date` (written `YYYY-MM-DD`; `/news/` lists newest first) and `description` (the line under the title in the list), and may have `image` (a path under `public/images/news/`). The body starts at `##`. No iframes: a test fails the build for any outside the two live pages, so link to a video instead of embedding it.

**Marks for Katie.** Collect every open question with `grep -rn "katie: review" src/`. A mark is an HTML comment (`<!-- katie: review: ... -->`) in Markdown and `.astro` files and a `#` comment in YAML. When Katie settles one, edit the copy and delete the mark.

## Contributing as a student

Fork the repository, make a branch, change files under `src/content/` (or whatever your task is), and open a pull request against `main`. CI runs the same four commands as above (`npm run build`, `npm test`, `npm run check`, `npm run check:links`, after `npm ci`), so run them locally first. Never commit a password, key or token; the site needs none to build. If you are not sure a sentence is true, say so with a `katie: review` mark rather than guessing. You need no AWS access and are given none: deploys happen only from GitHub Actions after a maintainer merges.

## What comes next

The site you see here is step 1 of the overhaul. Step 2 gives the live-reef pages a public face for the fish-ID data (live detections, a species explorer and trends), read from `/api/public/` on the same origin. Step 3 moves the Java API's sighting form into this site, and step 5 is the cutover that moves the `wahoobay.net` apex here. For the reasons and the full plan read `docs/superpowers/specs/2026-10-29-wahoobay-net-overhaul-design.md` (section 4.6 lists the steps) in the [infra repository](https://github.com/wahoobay/infra).

## Deploying

The `deploy` workflow (`.github/workflows/deploy.yml`) is the only way to deploy. A push to `main` builds, tests, runs the design check (`npm run check`) and the link check (`npm run check:links`), and deploys to staging (`staging.wahoobay.net`, behind Basic auth), then verifies it. Production is a manual dispatch with a commit SHA that is already on `main` and the word `deploy` to confirm; it records a `site-prod-…` release.

It reads these repository variables: `STAGING_ROLE_ARN`, `STAGING_BUCKET`, `STAGING_DISTRIBUTION_ID`, `STAGING_KVS_ARN`, `STAGING_HOSTNAME`, and the secret `STAGING_BASIC_AUTH`; production uses the `PROD_*` variables (`PROD_ROLE_ARN`, `PROD_BUCKET`, `PROD_DISTRIBUTION_ID`, `PROD_KVS_ARN`, `PROD_DISTRIBUTION_DOMAIN`). Their values are the outputs of the `site-wahoobay-staging` and `site-wahoobay-prod` stacks.
