// The live dashboards: the Power BI report (a public "Publish to web" address; no secret). The page embeds only those
// not flagged `offline` (see onlineDashboards below) and says the same line under every title (Ruling AA), so a
// dashboard has no sentence of its own.
// The old site's two Grafana dashboards (water, air, at grafana.wahoobay.net) were retired on 2026-10-31 on Dan's
// word: the host had not resolved since before 2026-10-24, its certificates had expired and were removed, and nothing
// in the account runs Grafana. The trends page (step 2b) charts the same sensor data from the fish-ID system.
const POWERBI = 'https://app.powerbi.com/view?r=eyJrIjoiODc0MmQ3OWYtZjFjZC00YmI3LTgzMTgtOTA0ZTRhOTFhNGQxIiwidCI6IjI3MWMwMGZlLTUxODItNGM5OS1hOWU2LTJkYzNlMWFmMGExZSJ9&pageName=f006761480e7e73d969e';

export const DASHBOARDS = [
  {
    id: 'powerbi',
    title: 'Wahoo Bay dashboard',
    src: POWERBI,
    open: POWERBI,
  },
];

// The dashboards whose host answers: the page renders only these.
export const onlineDashboards = () => DASHBOARDS.filter((d) => !d.offline);
