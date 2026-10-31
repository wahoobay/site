// Log a sighting at /live/log-a-sighting/: the pure functions of src/lib/sighting.mjs (the form's state, the payload
// the Java API's POST /sightings reads, the checks before sending, the species lookup), the island's conventions, and
// the built page (run `npm run build` first).
// The field names are the API's: SightingWriteService.createSighting and ClipService read them from the JSON body
// (wahoobay-net-api, src/main/java/org/shipwreck/wahoobay/), as the old form (wahoobay-net-frontend,
// src/pages/intake/IntakeForm.js) sent them. The kill switch is GET /intake/status, {enabled, message?}
// (IntakeStatusController); a photo is POST /upload, multipart field `file`, answering {storage_key, url}.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { API, LIFE_STAGES, MAX_NOTES, MAX_PHOTOS, MAX_PHOTO_BYTES, MESSAGES, PHOTO_TYPES, buildPayload, findSpecies, formState, localInput, photoProblem, speciesLabel, validate } from '../src/lib/sighting.mjs';

const read = (file) => readFileSync(file, 'utf8');
const species = JSON.parse(read('src/data/species.json'));
const datasources = JSON.parse(read('src/data/datasources.json'));
const ENV = process.env.PUBLIC_SITE_ENV ?? 'staging';
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the API is the production Java API, version 1', () => {
  assert.equal(API, 'https://api.wahoobay.net/api/v1');
});

test('formState: closed on an explicit close or a server error, open otherwise', () => {
  // The API's switch is `enabled` (the brief's `open`): IntakeStatusController answers {enabled, message?}.
  assert.equal(formState({ status: { enabled: false }, env: 'production' }), 'closed');
  assert.equal(formState({ status: { enabled: false, message: 'Paused.' } }), 'closed');
  assert.equal(formState({ status: null, failed: 503 }), 'closed');
  assert.equal(formState({ status: null, failed: 500 }), 'closed');
  assert.equal(formState({ status: null, failed: 404 }), 'open', 'no switch is an open form, as the old form had it');
  assert.equal(formState({ status: null, failed: 0 }), 'open', 'no answer at all: the submit says what went wrong');
  assert.equal(formState({ status: { enabled: true } }), 'open');
  assert.equal(formState({ status: {} }), 'open', 'a switch that says nothing is open');
  assert.equal(formState({}), 'open', 'before the status is known');
});

test('buildPayload labels staging submissions and carries the moment', () => {
  const photos = [
    { storage_key: '20261030140000_0a1b2c3d.jpg', url: '/uploads/20261030140000_0a1b2c3d.jpg' },
    { storage_key: '20261030140001_4e5f6a7b.png', url: '/uploads/20261030140001_4e5f6a7b.png' },
  ];
  const wall = Date.UTC(2026, 9, 30, 14, 0, 0);
  // The mark set the "When did you see it?" box to its minute (local time), as the island does.
  const p = buildPayload({ speciesId: 12, cameraId: 8, videoId: 'oBTGY6Ax870', momentSeconds: 93.4, behindLive: 40, momentWall: wall, sightingTime: localInput(wall), lifeStage: 'Juvenile', notes: 'two of them', photos, env: 'staging' });
  assert.equal(p.notes, '[staging test] two of them');
  assert.equal(buildPayload({ speciesId: 12, cameraId: 8, notes: 'x', env: 'production' }).notes, 'x');
  // The exact Java field names (SightingWriteService.createSighting, ClipService.captureForSubmission).
  assert.deepEqual(p, {
    camera_id: 8,
    species_id: 12,
    life_stage: 'Juvenile',
    notes: '[staging test] two of them',
    contributor_type: 'volunteer',
    sighting_datetime: '2026-10-30T14:00:00.000Z',
    photos,
    youtube_video_id: 'oBTGY6Ax870',
    youtube_moment: 93,
    youtube_behind_live: 40,
    youtube_moment_wall: wall,
    auto_frames: true,
  });
});

test('buildPayload: the sighting time is the "When did you see it?" box\'s, mark or not', () => {
  // Fix round 1, Ruling T: a photo-only report keeps the time the reader gives (reviewers cannot change it later).
  const photos = [{ storage_key: 'a.jpg', url: '/uploads/a.jpg' }];
  const time = '2026-10-29T09:05';
  assert.deepEqual(buildPayload({ speciesId: 12, cameraId: 5, videoId: 'oBTGY6Ax870', sightingTime: time, photos, env: 'production' }), {
    camera_id: 5,
    species_id: 12,
    life_stage: null,
    notes: null,
    contributor_type: 'volunteer',
    sighting_datetime: new Date(time).toISOString(),
    photos,
  });
  // A mark, and the box changed after it: the box wins; the moment's own time still goes with the moment.
  const wall = Date.UTC(2026, 9, 30, 14, 0, 0);
  assert.deepEqual(buildPayload({ speciesId: 12, cameraId: 5, videoId: 'oBTGY6Ax870', momentSeconds: 12, behindLive: 3, momentWall: wall, sightingTime: time, env: 'production' }), {
    camera_id: 5,
    species_id: 12,
    life_stage: null,
    notes: null,
    contributor_type: 'volunteer',
    sighting_datetime: new Date(time).toISOString(),
    youtube_video_id: 'oBTGY6Ax870',
    youtube_moment: 12,
    youtube_behind_live: 3,
    youtube_moment_wall: wall,
    auto_frames: true,
  });
  // The box emptied: the mark's time, else none (the API's now); a value that is not a time is not sent.
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, videoId: 'v', momentSeconds: 12, momentWall: wall, sightingTime: '', env: 'production' }).sighting_datetime, new Date(wall).toISOString());
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, sightingTime: '', env: 'production' }).sighting_datetime, undefined);
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, sightingTime: 'not a time', env: 'production' }).sighting_datetime, undefined);
  // The box's value: local time to the minute; it reads back as the same minute.
  const nine = new Date(2026, 9, 29, 9, 5, 42).getTime();
  assert.equal(localInput(nine), '2026-10-29T09:05');
  assert.equal(new Date(localInput(nine)).getTime(), new Date(2026, 9, 29, 9, 5).getTime());
});

test('photoProblem: the API\'s own refusals, before any photo is uploaded', () => {
  const MB = 1024 * 1024;
  assert.deepEqual(PHOTO_TYPES, ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif'], 'UploadService.ALLOWED_EXT');
  assert.equal(MAX_PHOTO_BYTES, 16 * MB, 'UploadService.MAX_BYTES');
  // Name: the extension decides, in any case; the file's type does not (the API never reads it).
  for (const name of ['reef.jpg', 'REEF.JPG', 'reef.jpeg', 'reef.png', 'IMG_0001.HEIC', 'reef.webp', 'reef.gif', 'two.dots.png']) {
    assert.equal(photoProblem({ name, size: MB, type: '' }), null, name);
  }
  for (const name of ['reef.avif', 'reef.tiff', 'reef.bmp', 'reef.heif', 'reef.jpg.zip', 'reef', 'reef.']) {
    assert.equal(photoProblem({ name, size: MB, type: 'image/jpeg' }), 'Unsupported image type.', name);
  }
  assert.equal(photoProblem({ name: 'reef.bmp', size: MB, type: 'image/bmp' }), 'Unsupported image type.', 'an image type the API refuses');
  // Size: up to and including 16 MB; an empty file is none.
  assert.equal(photoProblem({ name: 'reef.jpg', size: 16 * MB }), null);
  assert.equal(photoProblem({ name: 'reef.jpg', size: 16 * MB + 1 }), 'File too large.');
  assert.equal(photoProblem({ name: 'reef.tiff', size: 20 * MB }), 'File too large.', 'the API checks the size first');
  assert.equal(photoProblem({ name: 'reef.jpg', size: 0 }), 'No file provided.');
});

test('buildPayload: no mark and no photo links the camera\'s stream; photos without a mark do not', () => {
  // The old form: "Nothing marked yet — the live camera is linked by default", unless photos carry the sighting.
  const bare = buildPayload({ speciesId: 12, cameraId: '5', videoId: 'oBTGY6Ax870', env: 'production' });
  assert.deepEqual(bare, { camera_id: 5, species_id: 12, life_stage: null, notes: null, contributor_type: 'volunteer', youtube_video_id: 'oBTGY6Ax870', auto_frames: true });
  const photo = [{ storage_key: 'a.jpg', url: '/uploads/a.jpg' }];
  const withPhoto = buildPayload({ speciesId: 12, cameraId: 5, videoId: 'oBTGY6Ax870', photos: photo, env: 'production' });
  assert.deepEqual(withPhoto.photos, photo);
  for (const key of Object.keys(withPhoto)) assert.doesNotMatch(key, /^youtube_|^auto_frames$|^sighting_datetime$/, key);
  // A camera with no stream has no moment to send.
  const noVideo = buildPayload({ speciesId: 12, cameraId: 5, momentSeconds: 10, env: 'production' });
  for (const key of Object.keys(noVideo)) assert.doesNotMatch(key, /^youtube_|^auto_frames$/, key);
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, photos: [], env: 'production' }).photos, undefined, 'no empty photo list');
});

test('buildPayload: a typed species not in the list goes as its common name; notes are trimmed; every non-production build is labelled', () => {
  const typed = buildPayload({ speciesName: '  Common snook ', cameraId: 5, env: 'production' });
  assert.equal(typed.species_id, null);
  assert.equal(typed.common_name, 'Common snook');
  assert.equal(buildPayload({ speciesId: 12, speciesName: 'ignored', cameraId: 5, env: 'production' }).common_name, undefined, 'a listed species goes by its id');
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, notes: '  x  ', env: 'production' }).notes, 'x');
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, notes: '   ', env: 'production' }).notes, null);
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, env: 'staging' }).notes, '[staging test]', 'labelled even with no notes');
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, notes: 'x', env: 'preview' }).notes, '[staging test] x', 'anything but production is a test');
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, notes: 'x' }).notes, '[staging test] x');
  assert.equal(buildPayload({ speciesId: 12, cameraId: 5, lifeStage: '', env: 'production' }).life_stage, null);
});

test('validate names the missing species and camera', () => {
  assert.deepEqual(validate({}), ['Choose a species', 'Choose a camera']);
  assert.deepEqual([MESSAGES.species, MESSAGES.camera], ['Choose a species', 'Choose a camera']);
  assert.deepEqual(validate({ speciesName: '  ', cameraId: 5 }), [MESSAGES.species]);
  assert.deepEqual(validate({ speciesName: 'snook', cameraId: 5 }), []);
  assert.deepEqual(validate({ speciesId: 12, cameraId: '' }), [MESSAGES.camera]);
  assert.equal(MAX_NOTES, 1000);
  assert.deepEqual(validate({ speciesId: 12, cameraId: 5, notes: 'x'.repeat(1000) }), []);
  assert.deepEqual(validate({ speciesId: 12, cameraId: 5, notes: 'x'.repeat(1001) }), [MESSAGES.notes]);
  assert.equal(MAX_PHOTOS, 10, 'the old form\'s and the API\'s limit');
  assert.deepEqual(LIFE_STAGES, ['Adult', 'Juvenile', 'Larval', 'Unknown'], 'the old form\'s life stages');
});

test('findSpecies: a picked entry, a common name that is one species\', or a scientific name; anything else is typed', () => {
  const list = [
    { id: 91, common_name: 'Cuban Stone Crab', scientific_name: 'Menippe nodifrons' },
    { id: 92, common_name: 'Cuban Stone Crab', scientific_name: 'Trachycaris rugosa' },
    { id: 147, common_name: 'American Octopus', scientific_name: 'Octopus americanus' },
    { id: 300, common_name: null, scientific_name: 'Testus nominis' },
  ];
  assert.equal(speciesLabel(list[2]), 'American Octopus (Octopus americanus)');
  assert.equal(speciesLabel(list[3]), 'Testus nominis');
  assert.equal(findSpecies(list, 'American Octopus (Octopus americanus)')?.id, 147);
  assert.equal(findSpecies(list, '  american   octopus ')?.id, 147);
  assert.equal(findSpecies(list, 'Octopus americanus')?.id, 147);
  assert.equal(findSpecies(list, speciesLabel(list[1]))?.id, 92);
  assert.equal(findSpecies(list, 'Cuban Stone Crab'), null, 'two species share the name: neither is guessed');
  assert.equal(findSpecies(list, 'snook'), null);
  assert.equal(findSpecies(list, ''), null);
  // Every entry of the snapshot has its own label, so each can be picked from the list.
  const labels = species.map(speciesLabel);
  assert.equal(new Set(labels).size, labels.length);
  for (const s of species) assert.equal(findSpecies(species, speciesLabel(s))?.id, s.id, speciesLabel(s));
});

test('the island fetches the three endpoints, plays the stream from youtube-nocookie, and sets no style of its own', () => {
  const island = read('src/islands/SightingForm.tsx');
  assert.match(island, /`\$\{API\}\/intake\/status`/);
  assert.match(island, /`\$\{API\}\/upload`/);
  assert.match(island, /`\$\{API\}\/sightings`/);
  assert.match(island, /\.append\('file', /, 'the upload\'s multipart field is `file`');
  assert.match(island, /host: 'https:\/\/www\.youtube-nocookie\.com'/, 'the privacy-enhanced player');
  assert.match(island, /getCurrentTime\(\)/);
  // Fix round 1: an upload is kept per file, so a retry sends only the photos not yet uploaded; every photo is checked
  // against the API's limits before the first goes; any 2xx is a sent sighting, readable answer or not.
  assert.match(island, /useRef\(new Map<File, Photo>\(\)\)/);
  assert.match(island, /files\.map\(\(file\) => \[file, photoProblem\(file\)\] as const\)/);
  assert.ok(island.indexOf('photoProblem(file)') < island.indexOf('await upload(file)'), 'checked before uploading');
  assert.match(island, /uploaded\.current\.get\(file\) \?\? \(await upload\(file\)\)/);
  assert.equal((island.match(/uploaded\.current\.clear\(\)/g) || []).length, 2, 'cleared when the photos change and for another sighting');
  assert.match(island, /await res\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
  // The iframe's title is the old form's.
  assert.match(island, /'Wahoo Bay underwater camera'/);
  assert.doesNotMatch(island, /\bstyle=\{|\.style\.|setAttribute\(['"]style/, 'no inline styles of the island\'s own');
  assert.doesNotMatch(island, /autoplay/, 'the stream never starts by itself');
  // The IFrame API loads with the island and nowhere else.
  const files = readdirSync('src', { recursive: true }).filter((f) => /\.(astro|tsx?|mjs|css|md)$/.test(f));
  assert.deepEqual(files.filter((f) => /iframe_api/.test(read(join('src', f)))), [join('islands', 'SightingForm.tsx')]);
});

// The new words: the brief allows the closed, success and error notices and the no-script paragraph, each marked.
test('the island\'s new words are marked for Katie', () => {
  const island = read('src/islands/SightingForm.tsx');
  const lib = read('src/lib/sighting.mjs');
  for (const [source, words] of [
    [lib, 'Shorten the notes to 1000 characters'],
    [island, 'Something went wrong submitting your sighting. Please try again.'],
    [island, 'Sighting submissions are temporarily unavailable. Please check back soon.'],
    [island, 'Thank you for contributing to the Wahoo Bay marine database.'],
    [island, 'Sending…'],
  ]) {
    const at = source.indexOf(words);
    assert.ok(at > 0, words);
    assert.match(source.slice(Math.max(0, source.lastIndexOf('\n', at - 1) - 200), at), /katie: review/, `${words} is marked`);
  }
});

// Ruling V: the submit was disabled while the sighting sent and looked exactly as before, so the page seemed dead for
// the length of an upload. With @wahoobay/design 0.2.2 it is the busy button, disabled, saying so; closed, it is the
// disabled button the design now draws.
test('while it sends, the submit is the design\'s busy button, disabled, saying "Sending…"; closed, it is disabled', () => {
  const island = read('src/islands/SightingForm.tsx');
  const button = island.match(/<button className=\{`wb-btn wb-btn--action[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.match(button, /^<button className=\{`wb-btn wb-btn--action\$\{sending \? ' wb-btn--busy' : ''\}`\} type="submit" disabled=\{sending \|\| closed\}>/);
  assert.match(button, /\{closed \? PAUSED : sending \? SENDING : SUBMIT\}/);
  assert.match(island, /^const SENDING = 'Sending…';$/m);
  assert.match(island, /^const PAUSED = 'Submissions paused';$/m);
  const design = read('node_modules/@wahoobay/design/dist/components.css');
  assert.match(design, /\.wb-btn:disabled,\s*\.wb-btn\[aria-disabled="true"\]\s*\{[^}]*opacity:/);
  assert.match(design, /\.wb-btn--busy::after\s*\{[^}]*animation:\s*wb-spin/);
});

test('the page has the island, the no-script fallback, and is light', () => {
  const html = read('dist/live/log-a-sighting/index.html');
  assert.match(html, /<astro-island[^>]+client="load"/);
  assert.match(html, /<noscript>[\s\S]*?https:\/\/wahoobay\.net\/pages\/intake\/report[\s\S]*?<\/noscript>/);
  assert.match(html, /<noscript><p>This form needs JavaScript\. The previous form is still at <a href="https:\/\/wahoobay\.net\/pages\/intake\/report">https:\/\/wahoobay\.net\/pages\/intake\/report<\/a>\.<\/p><\/noscript>/);
  assert.doesNotMatch(html, /<html\b[^>]*data-theme=/, 'a light page');
  assert.doesNotMatch(html, /<iframe\b/, 'the player is made in the browser, not in the page');
  assert.doesNotMatch(html, /style="/);
  assert.match(html, /<h1>Log a sighting<\/h1>/);
  // The lead is the old form's own.
  assert.match(html, /<p class="wb-lead">Watch the reef in real time\. Spotted a species\? Rewind, mark the moment, and log it below — every entry is reviewed before it’s verified\.<\/p>/);
});

test('the form: every control has its label, the cameras are the snapshot\'s with a stream, the species list is the snapshot', () => {
  const html = read('dist/live/log-a-sighting/index.html');
  const island = html.match(/<astro-island\b[^>]*>[\s\S]*?<\/astro-island>/)?.[0] ?? '';
  for (const [id, label] of [['sighting-camera', 'Camera'], ['sighting-time', 'When did you see it?'], ['sighting-species', 'Species'], ['sighting-life-stage', 'Life stage'], ['sighting-notes', 'Notes (optional)'], ['sighting-photos', 'Photos (optional)']]) {
    assert.match(island, new RegExp(`<label class="wb-label" for="${id}">${escapeRe(label)}</label>`), label);
    assert.match(island, new RegExp(`<(input|select|textarea) class="wb-(input|select|textarea)"[^>]*\\bid="${id}"`), id);
  }
  const cameras = datasources.filter((d) => d.video);
  assert.ok(cameras.length > 0);
  const select = island.match(/<select[^>]*id="sighting-camera"[\s\S]*?<\/select>/)?.[0] ?? '';
  const options = [...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(options, [['', 'Select a camera…'], ...cameras.map((c) => [String(c.id), c.name])]);
  const list = island.match(/<datalist id="sighting-species-list">([\s\S]*?)<\/datalist>/)?.[1] ?? '';
  assert.equal((list.match(/<option /g) || []).length, species.length);
  assert.match(island, /<input class="wb-input" id="sighting-photos" type="file" accept="\.jpg,\.jpeg,\.png,\.heic,\.webp,\.gif" multiple=""/);
  // The old form's "When did you see it? — auto-set when you mark a moment": empty in the page, now once it runs.
  assert.match(island, /<input class="wb-input" id="sighting-time" type="datetime-local" aria-describedby="sighting-time-help" value=""\/>/);
  assert.match(island, /<p class="wb-help" id="sighting-time-help">Auto-set when you mark a moment<\/p>/);
  assert.match(island, /<textarea class="wb-textarea" id="sighting-notes"[^>]*maxLength="1000"/i);
  const stages = island.match(/<select[^>]*id="sighting-life-stage"[\s\S]*?<\/select>/)?.[0] ?? '';
  assert.deepEqual([...stages.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]), ['', ...LIFE_STAGES]);
  assert.match(island, /<button class="wb-btn wb-btn--action" type="submit"[^>]*>Submit Sighting<\/button>/);
  assert.doesNotMatch(island, /wb-btn--accent/, 'the accent is for Donate and live only');
  // The build's environment goes to the island, which labels every submission that is not production's.
  const props = island.match(/\bprops="([^"]*)"/)?.[1].replaceAll('&quot;', '"') ?? '';
  assert.ok(props.includes(`"env":[0,"${ENV}"]`), `env ${ENV}`);
});

test('the old form\'s address redirects here, and the student page links here', () => {
  const redirects = JSON.parse(read('redirects.json'));
  assert.equal(redirects.find((r) => r.from === '/pages/intake/report')?.to, '/live/log-a-sighting/');
  const md = read('src/content/pages/learn/student-conservation.md');
  assert.match(md, /^- \[Log a Sighting\]\(\/live\/log-a-sighting\/\)$/m);
  assert.doesNotMatch(md, /wahoobay\.net\/pages\/intake/);
  assert.match(read('dist/learn/student-conservation/index.html'), /<a href="\/live\/log-a-sighting\/">Log a Sighting<\/a>/);
});
