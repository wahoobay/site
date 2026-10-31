// One species under two ids (Ruling 32): the fish-ID app lists a species under its classifier's current label and an
// older one, and the snapshot keeps one entry for it (src/lib/fish-sync.mjs, used by scripts/sync-fish.mjs). Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSameSpecies } from '../src/lib/fish-sync.mjs';

const fish = (species_id, latin, total, week, first_seen, last_seen, extra = {}) => ({
  species_id,
  latin,
  common: null,
  family: null,
  order: null,
  aphia_id: null,
  photo: null,
  latest_crop: null,
  sightings_total: total,
  sightings_7d: week,
  first_seen,
  last_seen,
  ...extra,
});

// Staging's four on 2026-10-31: the current "Genus species" label and an old genus_species id last seen on 10-25.
const OLD_FIRST = '2026-10-20T15:00:00.000000+00:00';
const OLD_LAST = '2026-10-25T15:44:01.484629+00:00';
const NEW_FIRST = '2026-10-26T09:00:00.000000+00:00';
const staging = [
  fish('Sparisoma viride', 'Sparisoma viride', 87, 87, NEW_FIRST, '2026-10-30T20:40:51.973115+00:00', { common: 'Stoplight Parrotfish', latest_crop: '/api/public/detections/900/crop.jpg' }),
  fish('sparisoma_viride', 'Sparisoma viride', 9, 9, OLD_FIRST, OLD_LAST, { common: 'Stoplight Parrotfish', latest_crop: '/api/public/detections/100/crop.jpg' }),
  fish('lutjanus_griseus', 'Lutjanus griseus', 10, 10, OLD_FIRST, OLD_LAST, { latest_crop: '/api/public/detections/101/crop.jpg', photo: { url: '/api/public/species/lutjanus_griseus/photo.jpg', attribution: '(c) x' } }),
  fish('Lutjanus griseus', 'Lutjanus griseus', 1, 1, NEW_FIRST, '2026-10-29T12:01:14.858121+00:00', { common: 'Mangrove Snapper' }),
  fish('abudefduf_saxatilis', 'Abudefduf saxatilis', 8, 8, OLD_FIRST, OLD_LAST, { family: 'Pomacentridae' }),
  fish('Abudefduf saxatilis', 'Abudefduf saxatilis', 2, 2, NEW_FIRST, '2026-10-29T22:13:59.297526+00:00', { common: 'Sergeant Major' }),
  fish('acanthurus_coeruleus', 'Acanthurus coeruleus', 4, 4, OLD_FIRST, OLD_LAST),
  fish('Acanthurus coeruleus', 'Acanthurus coeruleus', 2, 2, NEW_FIRST, '2026-10-30T20:29:21.686680+00:00'),
  fish('Diplodus argenteus', 'Diplodus argenteus', 5, 1, NEW_FIRST, '2026-10-30T10:00:00+00:00', { latest_crop: '/api/public/detections/7/crop.jpg' }),
];

test('the four species of staging under two ids each become one entry each, under the id seen most recently', () => {
  const merged = mergeSameSpecies(staging);
  assert.equal(merged.length, 5);
  const by = new Map(merged.map((f) => [f.latin, f]));
  assert.deepEqual(
    [...by.values()].map((f) => [f.latin, f.species_id, f.sightings_total, f.sightings_7d]),
    [
      ['Sparisoma viride', 'Sparisoma viride', 96, 96],
      ['Lutjanus griseus', 'Lutjanus griseus', 11, 11],
      ['Abudefduf saxatilis', 'Abudefduf saxatilis', 10, 10],
      ['Acanthurus coeruleus', 'Acanthurus coeruleus', 6, 6],
      ['Diplodus argenteus', 'Diplodus argenteus', 5, 1],
    ],
  );
  for (const latin of ['Sparisoma viride', 'Lutjanus griseus', 'Abudefduf saxatilis', 'Acanthurus coeruleus']) {
    assert.equal(by.get(latin).first_seen, OLD_FIRST, `${latin}: the earliest first seen`);
    assert.notEqual(by.get(latin).last_seen, OLD_LAST, `${latin}: the latest last seen`);
  }
  assert.equal(by.get('Sparisoma viride').last_seen, '2026-10-30T20:40:51.973115+00:00');
});

test('photo and latest crop come from the newest id when it has them, else from the other', () => {
  const by = new Map(mergeSameSpecies(staging).map((f) => [f.latin, f]));
  assert.equal(by.get('Sparisoma viride').latest_crop, '/api/public/detections/900/crop.jpg', 'the newest id\'s');
  assert.equal(by.get('Lutjanus griseus').latest_crop, '/api/public/detections/101/crop.jpg', 'the newest has none: the old id\'s');
  assert.deepEqual(by.get('Lutjanus griseus').photo, { url: '/api/public/species/lutjanus_griseus/photo.jpg', attribution: '(c) x' });
  assert.equal(by.get('Abudefduf saxatilis').latest_crop, null, 'neither has one');
  // The names are the newest id's, a missing one taken from the other.
  assert.equal(by.get('Abudefduf saxatilis').common, 'Sergeant Major');
  assert.equal(by.get('Abudefduf saxatilis').family, 'Pomacentridae');
});

test('a species under one id is untouched; the names match once normalised; the inputs are not changed', () => {
  const before = structuredClone(staging);
  assert.deepEqual(mergeSameSpecies([staging[8]]), [staging[8]]);
  const [one] = mergeSameSpecies([fish('a', 'Haemulon Sciurus', 3, null, null, null), fish('b', 'haemulon sciurus', null, 2, NEW_FIRST, OLD_LAST)]);
  assert.equal(one.species_id, 'b', 'a last seen beats none');
  assert.deepEqual([one.sightings_total, one.sightings_7d, one.first_seen], [3, 2, NEW_FIRST], 'a missing count adds nothing');
  const [none] = mergeSameSpecies([fish('a', 'X y', null, null, null, null), fish('b', 'X y', null, null, null, null)]);
  assert.deepEqual([none.sightings_total, none.sightings_7d], [null, null], 'no counts on either: none');
  assert.deepEqual(staging, before);
});
