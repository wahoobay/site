// The park map (/visit/map/): a Mapbox GL map at the old page's view, with a marker per place of the datasource
// snapshot (src/data/datasources.json, through markersFrom in src/lib/map.mjs). Hydrated when it scrolls into view
// (client:visible); Mapbox GL and its stylesheet, the site's one third-party stylesheet, load with it and nowhere else.
// The stylesheet is imported as a URL and linked when the island runs: Astro drops a stylesheet that an island
// imports dynamically from the build (it takes it for one the server render already put on the page), and a static
// import would put it on every page of [...slug].astro.
// The frame is the design's .wb-map; a camera's marker is the design's live badge, a sensor's its chip, and a
// marker's popup its raised panel (a surface over a photograph) with the place's name and one link. Colour and type
// are the design's classes; the island sets no style of its own (Mapbox GL positions its markers and popups itself).
import { useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap, Marker as MapboxMarker, Popup as MapboxPopup } from 'mapbox-gl';
import mapboxCss from 'mapbox-gl/dist/mapbox-gl.css?url';
import { MAP_CENTER, MAP_STYLE, MAP_ZOOM } from '../lib/map.mjs';

export interface Marker {
  id: number;
  name: string;
  kind: 'camera' | 'sensor';
  lat: number;
  lon: number;
  href: string;
}

interface Props {
  /** The public, URL-restricted Mapbox token (PUBLIC_MAPBOX_TOKEN at build time). */
  token: string;
  markers: Marker[];
}

// katie: review: the island's own words while the map loads, and if it cannot.
const LOADING = 'Loading the map…';
// katie: review
const FAILED = 'The map could not load.';

// katie: review: the popup links' labels: the /live/ page, a camera's stream on YouTube, the data dashboards.
const WATCH_LIVE = 'Watch live';
// katie: review
const ON_YOUTUBE = 'Open on YouTube';
// katie: review
const SEE_DATA = 'See the data';
const linkLabel = (href: string) => (href === '/live/' ? WATCH_LIVE : href.startsWith('https://') ? ON_YOUTUBE : SEE_DATA);

// Places closer than this stack one under another, so no marker hides another at the opening zoom: two of the park's
// sensors share one place, and the reef camera is some 30 m from them.
const STACK_METRES = 250;
const STACK_STEP = 32; // px, a little more than a marker's height
// Between a marker's edge and its popup.
const GAP = 6;

const metres = (a: Marker, b: Marker) =>
  Math.hypot((a.lon - b.lon) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180), a.lat - b.lat) * 111_320;

/** Each marker's vertical offset in its stack, centred on the stack's first place. */
const stackOffsets = (markers: Marker[]) => {
  const stacks: Marker[][] = [];
  for (const m of markers) {
    const stack = stacks.find((s) => metres(s[0], m) < STACK_METRES);
    if (stack) stack.push(m);
    else stacks.push([m]);
  }
  const offsets = new Map<Marker, number>();
  for (const stack of stacks) stack.forEach((m, i) => offsets.set(m, (i - (stack.length - 1) / 2) * STACK_STEP));
  return offsets;
};

/** Mapbox GL's stylesheet, linked once, before the map is made (Mapbox GL warns without it). */
const linkStylesheet = () =>
  new Promise<void>((resolve, reject) => {
    if (document.querySelector(`link[href="${mapboxCss}"]`)) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = mapboxCss;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error('the Mapbox GL stylesheet did not load'));
    document.head.append(link);
  });

/** The marker: the place's name on the design's live badge (a camera) or chip (a sensor). */
const markerElement = (m: Marker) => {
  const el = document.createElement('div');
  el.className = `${m.kind === 'camera' ? 'wb-live' : 'wb-chip'} site-map__marker`;
  if (m.kind === 'camera') el.dataset.impeccableIgnore = 'pulsing-dot';
  el.textContent = m.name;
  // Mapbox GL names a marker "Map marker" unless it has a name; it makes it a button once it has a popup.
  el.setAttribute('aria-label', m.name);
  return el;
};

/** The popup: the design's raised panel with the place's name and its link. */
const panelElement = (m: Marker) => {
  const panel = document.createElement('div');
  panel.className = 'wb-panel wb-panel--raised';
  const title = document.createElement('p');
  title.className = 'wb-panel__title';
  title.textContent = m.name;
  const link = document.createElement('a');
  link.href = m.href;
  link.textContent = linkLabel(m.href);
  if (m.href.startsWith('https://')) {
    link.target = '_blank';
    link.rel = 'noopener';
    const note = document.createElement('span');
    note.className = 'wb-sr-only';
    note.textContent = ' (opens in a new tab)';
    link.append(note);
  }
  const line = document.createElement('p');
  line.append(link);
  panel.append(title, line);
  return panel;
};

export default function ParkMap({ token, markers }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let map: MapboxMap | undefined;
    let cancelled = false;
    const fail = () => {
      const failed = map;
      map = undefined;
      // After Mapbox GL's own error handling returns.
      setTimeout(() => failed?.remove());
      if (!cancelled) setState('failed');
    };
    (async () => {
      try {
        const [{ default: mapboxgl }] = await Promise.all([import('mapbox-gl'), linkStylesheet()]);
        if (cancelled || !canvas.current) return;
        map = new mapboxgl.Map({
          container: canvas.current,
          accessToken: token,
          style: MAP_STYLE,
          center: MAP_CENTER as [number, number],
          zoom: MAP_ZOOM,
          // The page scrolls past the map: the wheel never zooms it (the buttons and pinching do). Seen from above.
          scrollZoom: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));
        // The style failing (a token the hostname may not use, no network) is the map failing: the map goes, markers
        // and all, and the frame says so. A tile failing later is not.
        let styled = false;
        map.on('style.load', () => {
          styled = true;
        });
        map.on('error', () => {
          if (!styled) fail();
        });
        map.on('load', () => setState('ready'));

        const offsets = stackOffsets(markers);
        const placed: { marker: MapboxMarker; popup: MapboxPopup }[] = [];
        for (const m of markers) {
          const el = markerElement(m);
          const dy = offsets.get(m) ?? 0;
          const popup = new mapboxgl.Popup({ className: 'site-map__popup', closeButton: false }).setDOMContent(panelElement(m));
          const marker = new mapboxgl.Marker({ element: el, offset: [0, dy] }).setLngLat([m.lon, m.lat]).setPopup(popup).addTo(map);
          // The popup opens beside the marker, whichever side of it Mapbox GL puts it on.
          const x = el.offsetWidth / 2 + GAP;
          const y = el.offsetHeight / 2 + GAP;
          popup.setOffset({
            center: [0, dy],
            top: [0, dy + y],
            'top-left': [0, dy + y],
            'top-right': [0, dy + y],
            bottom: [0, dy - y],
            'bottom-left': [0, dy - y],
            'bottom-right': [0, dy - y],
            left: [x, dy],
            right: [-x, dy],
          });
          // One popup at a time; the marker says whether its popup is open.
          popup.on('open', () => {
            el.setAttribute('aria-expanded', 'true');
            for (const other of placed) if (other.popup !== popup) other.popup.remove();
          });
          popup.on('close', () => el.setAttribute('aria-expanded', 'false'));
          placed.push({ marker, popup });
        }
        // Escape closes an open popup and returns to its marker.
        map.getContainer().addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          for (const { marker, popup } of placed) {
            if (!popup.isOpen()) continue;
            popup.remove();
            marker.getElement().focus();
          }
        });
      } catch {
        fail();
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [token, markers]);

  return (
    <div className="wb-map site-map" role="region" aria-label="Map of Wahoo Bay">
      <div className="site-map__canvas" ref={canvas} />
      {state !== 'ready' && (
        <p className="site-map__status" role="status">
          {state === 'failed' ? FAILED : LOADING}
        </p>
      )}
    </div>
  );
}
