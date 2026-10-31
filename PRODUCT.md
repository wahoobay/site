# Product

<!-- impeccable:product-schema 1 -->

Derived from the approved design, 2026-10-29: `wahoobay/infra`, `docs/superpowers/specs/2026-10-29-wahoobay-net-overhaul-design.md`, §1–§3 (approved by Dan Zimmerman on 2026-10-29). Not taken from an interview: every fact below is the design's, and a change to it is a change to that design first.

## Platform

web

## Stack

Astro, static output, on the `@wahoobay/design` package (decided in the approved design, §4.2). React islands only where a page is interactive.

## Users

- People who visit Wahoo Bay, the public marine education park at the Hillsboro Inlet in Pompano Beach, or want to: when it is open, how to get there, the ways to visit.
- Schools and teachers: field experiences (book, guide, video, request form) and the educational resources by grade, course and lesson.
- Anyone watching the reef from elsewhere: the live underwater cameras with the fish named, the species record and trends, the environment data and the open-data downloads.
- Volunteers (the ambassador programme, the sighting review tool) and donors (Zeffy).
- The people who keep it: Katie owns the content and the decisions; Troy supplies photographs and video; Dan is a volunteer; students contribute by fork and pull request and never get AWS access.

## Product Purpose

wahoobay.net is rebuilt as one product with one look, replacing a patchwork (one React application assembled by several developers since 2022, per-page stylesheets, a hidden admin panel with its own design, hand deploys). The public pages, the interactive pieces and the fish-ID system's public face must read as a single thing, deployed from GitHub through staging and production.

It succeeds when, in order: a design system is shared by the site and the fish-ID application; the new site serves its content from Markdown; the fish-ID system's public face is on wahoobay.net; the public "log a sighting" flow and its review keep working; and wahoobay.net moves to the new site with every old URL redirected.

It fails, even if it works, if it becomes another patchwork (two front-end frameworks, per-page stylesheets, a second set of colours, fish-ID pages in a different design), if anything is deployed by hand or with a long-lived key, if a data page depends on a service or account Wahoo Bay does not control, if a volunteer's name or e-mail address is reachable from a public page or a download, if it only looks right on one screen size or fails WCAG AA contrast, or if its cost grows.

## Positioning

A real park with its own reef under a live camera: the fish-ID system names the fish on the stream and keeps the species record, and that record, the environment data and the downloads are public. Lessons and field experiences come from the same place.

## Operating Context

- Content is Markdown in this repository, edited through pull requests; there is no CMS.
- GitHub Actions builds and deploys: staging (behind Basic auth) on merge to `main`, production by dispatch. The infrastructure is defined in `wahoobay/infra`.
- Anything that needs more than one person to keep working is a liability.

## Capabilities and Constraints

- Must keep working through the rebuild: the Instagram feed, the YouTube camera embeds (SeaHIVE `oBTGY6Ax870`, pier `mV8zVsX_o_0`), the sensor data, sighting uploads, Zeffy donations, the field-trip and ambassador pages, and every URL a search engine or a printed flyer knows.
- Not in scope: a CMS, translations, changes to the Shipwreck Park site, a native app, and features beyond what exists plus the fish-ID public face (the donation map, school leaderboard, photo votes and best-of-reel admin are dropped unless Katie asks for them).
- Budget: within the current monthly budget; the live video's egress is the one line that scales with popularity.
- The Live reef pages exist, under one Live reef navigation: the camera with the fish named, reef highlights, the species explorer with a page per species, trends, the data dashboards, the open-data downloads and log a sighting, with Fish ID linking the fish-ID app. They read the fish-ID app's public API on the site's own origin; the downloads carry no reviewer data and name a camera by its id only.

## Brand Commitments

- One logo: the lockup and the mark alone, shipped in `@wahoobay/design` (`logo/wahoobay-logo.svg`, `logo/wahoobay-mark.svg`). Never recoloured except to white.
- One brand colour, `#0088D6`, display only (3.8:1 on white): the logo, large headings and numbers, chart lines; never small text or button labels, which use action blue `#0072B5`.
- Decided on mockups with Dan, 2026-10-29, and not open for revisiting: the Clear Water direction, the Seagrass accent, and dark pages only for the live cameras. The values live in `@wahoobay/design`.
- There is no other brand material.

## Evidence on Hand

- The current site's copy, about 20 pages and 5,000 words, migrated into Markdown for Katie's review; no new claims are written.
- Real photographs: the current site's park aerials and the manatee, with more from Troy; detection crops from the fish-ID system; YouTube and stream stills. No stock imagery.
- The headline and numbers in the mockups are placeholders, not facts.

## Product Principles

- One product, one look: every page, the fish-ID public pages included, is built from the one design system.
- Migrated, not invented: copy comes from the old site or from Katie; uncertain passages are marked for her review.
- Nothing by hand: every change reaches the site through a pull request and GitHub Actions.
- Public by default, except people: the reef, the species and the data are public; volunteer names and addresses never are.
- Keepable by one volunteer.

## Accessibility & Inclusion

WCAG AA: every text and background pair at least 4.5:1, no functional text under 12 px, and every page works at every screen size.
