---
# /live/downloads/ (src/pages/live/downloads/index.astro): the fish-ID app's public exports, a card each with its CSV
# and Parquet links, under the lead and this text. The list below is the fish-ID app's own (GET /api/public/exports,
# PUBLIC_EXPORTS in the ai repository), copied once, in its order; the page does not fetch it. When the fish-ID app
# adds, drops or changes an export, change it here.
# katie: review: a new page; its title (the navigation's word, Downloads; it was "Open data"), its description (also its
# lead) and the sentences below are new words.
title: Downloads
description: The reef camera's detections and sightings and the water and weather sensors' readings at Wahoo Bay, as CSV and Parquet files to download.
section: live
# katie: review: each file's line is the fish-ID app's own description of it (GET /api/public/exports), copied as it is.
exports:
  - name: events
    description: "One row per detection per frame: the box, the classifier's candidates, provenance."
    default_days: 7
    allowed_days: [7, 30]
  - name: species_counts
    description: "Detections per species with confidence statistics (prefer sightings)."
    default_days: 90
    allowed_days: [7, 30, 90, 365]
  - name: sightings
    description: "One row per tracked fish seen in at least three frames: species and duration."
    default_days: 90
    allowed_days: [7, 30, 90, 365]
  - name: hourly_summary
    description: "Detections and sightings per species per hour, beside the water's means."
    default_days: 90
    allowed_days: [7, 30, 90, 365]
  - name: water_quality
    description: "The sonde: temperature, pH, oxygen, chlorophyll, turbidity, conductivity."
    default_days: 90
    allowed_days: [7, 30, 90, 365]
  - name: weather
    description: "The weather station's readings and the forecast layer, merged per reading."
    default_days: 90
    allowed_days: [7, 30, 90, 365]
  - name: frame_stats
    description: "About one row per second of video: brightness, colour and detection rate."
    default_days: 7
    allowed_days: [7, 30]
  - name: tracks_timeline
    description: "Each tracked fish's detections in order, with the box's centre and size."
    default_days: 7
    allowed_days: [7, 30]
  - name: topk_long
    description: "One row per detection and classifier candidate, ranked, for calibration."
    default_days: 7
    allowed_days: [7, 30]
---

<!-- katie: review: a new sentence (the exports have no data licence yet, so the API's licence is empty: Katie and Dan decide one) -->
Licence: see the [README](/api/public/exports/README.md), which also explains each file's columns and caveats.

<!-- katie: review: a new sentence (the public exports leave out the reviewers' columns and give a camera's id, never its address) -->
The files carry no reviewer data and name each camera by its id only.
