// News dates are calendar days with no time: read and shown in UTC so the day never slips with the build's time zone.
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export const longDay = (date: Date) =>
  date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
