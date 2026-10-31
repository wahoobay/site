---
# The old site's map (src/pages/other/MapBox.js). The map itself is src/components/ParkMapSection.astro, between the
# lead and this text: with the build's PUBLIC_MAPBOX_TOKEN, an interactive map of the API's list of sites
# (/api/v1/datasource/AllActive, kept in src/data/datasources.json by `npm run sync:datasources`); without it, a still
# of that map (public/images/map.jpg, exported from the island at its opening view).
title: Map
description: The cameras and sensors on Wahoo Bay's map.
section: visit
order: 6
---

<!-- katie: review: these are the sites the old map marked, named as its data names them (api.wahoobay.net, 30 October 2026); the sentences on this page are new. -->
<!-- katie: review: the old site's map left out the Pompano Pier Camera (taken down at the organisation's request, in its src/utils/cameraSettings.js), and the interactive map leaves it out too; this list still names it. -->
- Wahoo Bay Camera
- Pompano Pier Camera
- Wahoo Bay Weather Station
- Wahoo Bay Water Quality
