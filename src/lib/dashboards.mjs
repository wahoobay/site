// The three live dashboards the page embeds: the Power BI report and the Grafana water and air dashboards.
// All three are public addresses (Power BI "Publish to web", Grafana kiosk); none carries a secret.
// `note` is one plain sentence of context, new words for Katie to review (see the page).
const POWERBI = 'https://app.powerbi.com/view?r=eyJrIjoiODc0MmQ3OWYtZjFjZC00YmI3LTgzMTgtOTA0ZTRhOTFhNGQxIiwidCI6IjI3MWMwMGZlLTUxODItNGM5OS1hOWU2LTJkYzNlMWFmMGExZSJ9&pageName=f006761480e7e73d969e';
const WATER = 'https://grafana.wahoobay.net/d/fdruz46pp5jpce/water-dashboard?orgId=1&refresh=1h&theme=light';
const AIR = 'https://grafana.wahoobay.net/d/fdrlbyd6ay1vkf/air-dashboard?orgId=1&refresh=1h&theme=light';

export const DASHBOARDS = [
  {
    id: 'powerbi',
    title: 'Wahoo Bay dashboard',
    src: POWERBI,
    open: POWERBI,
    note: 'The Wahoo Bay report, with its data and charts.',
  },
  {
    id: 'water',
    title: 'Water dashboard',
    src: `${WATER}&kiosk`,
    open: WATER,
    note: 'Water readings from the bay, updated hourly.',
  },
  {
    id: 'air',
    title: 'Air dashboard',
    src: `${AIR}&kiosk`,
    open: AIR,
    note: 'Air readings from the bay, updated hourly.',
  },
];
