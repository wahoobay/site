// The live dashboards: the Power BI report and the Grafana water and air dashboards. The page embeds only those
// not flagged `offline` (see onlineDashboards below). All are public addresses (Power BI "Publish to web", Grafana
// kiosk); none carries a secret. The page says the same line under every title (Ruling AA), so a dashboard has no
// sentence of its own.
const POWERBI = 'https://app.powerbi.com/view?r=eyJrIjoiODc0MmQ3OWYtZjFjZC00YmI3LTgzMTgtOTA0ZTRhOTFhNGQxIiwidCI6IjI3MWMwMGZlLTUxODItNGM5OS1hOWU2LTJkYzNlMWFmMGExZSJ9&pageName=f006761480e7e73d969e';
const WATER = 'https://grafana.wahoobay.net/d/fdruz46pp5jpce/water-dashboard?orgId=1&refresh=1h&theme=light';
const AIR = 'https://grafana.wahoobay.net/d/fdrlbyd6ay1vkf/air-dashboard?orgId=1&refresh=1h&theme=light';

export const DASHBOARDS = [
  {
    id: 'powerbi',
    title: 'Wahoo Bay dashboard',
    src: POWERBI,
    open: POWERBI,
  },
  {
    id: 'water',
    // grafana.wahoobay.net did not resolve on public DNS on 2026-10-30 (scripts/check-embeds.mjs); flip to false when the host is back
    offline: true,
    title: 'Water dashboard',
    src: `${WATER}&kiosk`,
    open: WATER,
  },
  {
    id: 'air',
    // grafana.wahoobay.net did not resolve on public DNS on 2026-10-30 (scripts/check-embeds.mjs); flip to false when the host is back
    offline: true,
    title: 'Air dashboard',
    src: `${AIR}&kiosk`,
    open: AIR,
  },
];

// The dashboards whose host answers: the page renders only these.
export const onlineDashboards = () => DASHBOARDS.filter((d) => !d.offline);
