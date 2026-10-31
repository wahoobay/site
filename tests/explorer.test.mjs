// The species explorer's data (src/lib/explorer.mjs): the union of the fish-ID app's species (src/data/fish.json,
// `npm run sync:fish`) and the Java API's (src/data/species.json and media.json, `npm run sync:species`), merged on the
// scientific name as nomenclature writes it (src/lib/names.mjs), one entry and one page slug per species. Pure: no build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byCategory, slugify, unionSpecies } from '../src/lib/explorer.mjs';
import { binomial } from '../src/lib/names.mjs';
import { binomial as syncBinomial } from '../scripts/sync-species.mjs';
import { CATEGORIES } from '../src/lib/species.mjs';

const KEYS = ['category', 'common', 'conservation_status', 'family', 'java_id', 'last_seen', 'latest_crop', 'latin', 'media', 'order', 'photo', 'sightings_7d', 'sightings_total', 'slug', 'species_id'];

// The fish-ID app's list (GET /api/public/species, as the sync writes it).
const fish = [
  {
    species_id: 'abudefduf-saxatilis',
    latin: 'Abudefduf saxatilis',
    common: 'Sergeant major',
    family: 'Pomacentridae',
    order: 'Ovalentaria incertae sedis',
    aphia_id: 159795,
    photo: { url: '/api/public/species/abudefduf-saxatilis/photo.jpg', attribution: '(c) A. Diver, some rights reserved (CC BY)' },
    latest_crop: '/api/public/detections/987/crop.jpg',
    sightings_total: 412,
    sightings_7d: 18,
    first_seen: '2026-03-01T10:00:00-05:00',
    last_seen: '2026-10-31T08:15:00-04:00',
  },
  {
    species_id: 'c0ffee00-1111-2222-3333-444455556666',
    latin: 'Haemulon sciurus',
    common: 'Bluestriped grunt',
    family: 'Haemulidae',
    order: 'Perciformes',
    aphia_id: 276251,
    photo: null,
    latest_crop: null,
    sightings_total: 3,
    sightings_7d: 0,
    first_seen: '2026-09-02T10:00:00-04:00',
    last_seen: '2026-09-03T10:00:00-04:00',
  },
];

// The Java API's list and clips (src/data/species.json and media.json).
const java = [
  { id: 11, common_name: 'Sergeant Major', scientific_name: 'Abudefduf Saxatilis', family: 'Pomacentridae', category: null, conservation_status: null },
  { id: 12, common_name: 'West Indian Manatee', scientific_name: 'Trichechus manatus', family: 'Trichechidae', category: 'Mammal', conservation_status: 'Vulnerable' },
  { id: 13, common_name: 'Spiny Brittle Star', scientific_name: 'Ophiothrix sp.', family: 'Ophiotrichidae', category: 'Invertebrate', conservation_status: null },
];
const media = [
  { id: 3, species_id: 12, kind: 'video', url: 'https://youtu.be/abcdefghijk', thumb: 'https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg', title: null, date: '2026-05-01T09:00' },
  { id: 2, species_id: 11, kind: 'image', url: 'https://api.wahoobay.net/api/uploads/2.jpg', thumb: 'https://api.wahoobay.net/api/uploads/2.jpg', title: null, date: '2026-04-01T09:00' },
  { id: 1, species_id: 12, kind: 'image', url: 'https://api.wahoobay.net/api/uploads/1.jpg', thumb: null, title: 'Calf', date: null },
];

test('slugify: a scientific name as a page address', () => {
  assert.equal(slugify('Abudefduf saxatilis'), 'abudefduf-saxatilis');
  assert.equal(slugify('Ocyropsis maculata immaculata'), 'ocyropsis-maculata-immaculata');
  assert.equal(slugify('Ophiothrix sp.'), 'ophiothrix-sp');
  assert.equal(slugify('Anilocra  spp.'), 'anilocra-spp');
  assert.equal(slugify(' Diodon Hystrix '), 'diodon-hystrix');
  assert.equal(slugify('Gobiosoma oceanops (Jordan, 1904)'), 'gobiosoma-oceanops-jordan-1904');
  assert.equal(slugify('Labrisomus nuchipinnis × L. sp.'), 'labrisomus-nuchipinnis-l-sp');
  assert.equal(slugify('Bodianus rufus é'), 'bodianus-rufus-e', 'a letter with an accent keeps its letter');
});

test('the explorer and the species sync share one binomial normaliser (src/lib/names.mjs)', () => {
  assert.equal(syncBinomial, binomial);
  assert.equal(binomial('Abudefduf Saxatilis'), 'Abudefduf saxatilis');
});

test('unionSpecies: every species of both lists exactly once, merged on the normalised binomial', () => {
  const list = unionSpecies(fish, java, media);
  for (const s of list) assert.deepEqual(Object.keys(s).sort(), KEYS);
  assert.deepEqual(list.map((s) => s.slug).sort(), ['abudefduf-saxatilis', 'haemulon-sciurus', 'ophiothrix-sp', 'trichechus-manatus']);
  assert.equal(list.length, 4, 'the sergeant major once, though both lists have it');
  assert.equal(new Set(list.map((s) => s.slug)).size, list.length, 'one slug a species');

  const major = list.find((s) => s.slug === 'abudefduf-saxatilis');
  assert.equal(major.latin, 'Abudefduf saxatilis');
  assert.equal(major.species_id, 'abudefduf-saxatilis');
  assert.equal(major.java_id, 11);
  assert.equal(major.common, 'Sergeant Major', 'the common name the Java list (the 2a gallery) gives');
  assert.equal(major.family, 'Pomacentridae');
  assert.equal(major.order, 'Ovalentaria incertae sedis', 'the order is the fish-ID catalogue\'s');
  assert.equal(major.category, 'Fish', 'no Java category: a fish-ID species is a Fish');
  assert.deepEqual(major.photo, fish[0].photo);
  assert.equal(major.latest_crop, '/api/public/detections/987/crop.jpg');
  assert.deepEqual([major.sightings_total, major.sightings_7d, major.last_seen], [412, 18, '2026-10-31T08:15:00-04:00']);
  assert.deepEqual(major.media.map((m) => m.id), [2], 'its Java clips come with it');
});

test('unionSpecies keeps a Java-only species (the manatee) with its category, status and clips', () => {
  const manatee = unionSpecies(fish, java, media).find((s) => s.java_id === 12);
  assert.deepEqual(manatee, {
    slug: 'trichechus-manatus',
    latin: 'Trichechus manatus',
    common: 'West Indian Manatee',
    family: 'Trichechidae',
    order: null,
    category: 'Mammal',
    conservation_status: 'Vulnerable',
    photo: null,
    latest_crop: null,
    media: [media[0], media[2]],
    species_id: null,
    java_id: 12,
    sightings_total: 0,
    sightings_7d: 0,
    last_seen: null,
  });
});

test('unionSpecies keeps a fish-ID-only species, under Fish, with its counts', () => {
  const grunt = unionSpecies(fish, java, media).find((s) => s.species_id === 'c0ffee00-1111-2222-3333-444455556666');
  assert.deepEqual(grunt, {
    slug: 'haemulon-sciurus',
    latin: 'Haemulon sciurus',
    common: 'Bluestriped grunt',
    family: 'Haemulidae',
    order: 'Perciformes',
    category: 'Fish',
    conservation_status: null,
    photo: null,
    latest_crop: null,
    media: [],
    species_id: 'c0ffee00-1111-2222-3333-444455556666',
    java_id: null,
    sightings_total: 3,
    sightings_7d: 0,
    last_seen: '2026-09-03T10:00:00-04:00',
  });
});

test('unionSpecies sorts by the name a card shows, as the 2a gallery did', () => {
  const list = unionSpecies(fish, java, media);
  assert.deepEqual(list.map((s) => s.common), ['Bluestriped grunt', 'Sergeant Major', 'Spiny Brittle Star', 'West Indian Manatee']);
  const noCommon = unionSpecies([{ ...fish[1], common: null, latin: 'Aaa bbb' }], [], []);
  assert.equal(noCommon[0].common, null);
  assert.equal(noCommon[0].slug, 'aaa-bbb');
});

test('unionSpecies uses the fish-ID common name and family when the Java list has none', () => {
  const [one] = unionSpecies([fish[0]], [{ ...java[0], common_name: null, family: null }], []);
  assert.equal(one.common, 'Sergeant major');
  assert.equal(one.family, 'Pomacentridae');
  const [two] = unionSpecies([{ ...fish[0], family: null }], [java[0]], []);
  assert.equal(two.family, 'Pomacentridae', 'the Java family when the catalogue has none');
});

test('unionSpecies refuses two species that would share a page', () => {
  assert.throws(() => unionSpecies([fish[0], { ...fish[0], species_id: 'old-uuid' }], [], []), /abudefduf-saxatilis/);
  assert.throws(() => unionSpecies([], [java[1], { ...java[1], id: 99 }], []), /trichechus-manatus/);
});

test('byCategory groups the union in the gallery\'s categories: the manatee under Mammal, a fish-ID-only species under Fish', () => {
  const groups = byCategory(unionSpecies(fish, java, media));
  assert.deepEqual([...groups.keys()], CATEGORIES);
  assert.deepEqual(groups.get('Fish').map((s) => s.slug), ['haemulon-sciurus', 'abudefduf-saxatilis']);
  assert.deepEqual(groups.get('Mammal').map((s) => s.slug), ['trichechus-manatus']);
  assert.deepEqual(groups.get('Invertebrate').map((s) => s.slug), ['ophiothrix-sp']);
  assert.deepEqual([...groups.values()].flat().length, 4, 'each species once');
  // A Java-only species with no category stays under Other, as in the 2a gallery.
  const other = byCategory(unionSpecies([], [{ ...java[2], category: null }], []));
  assert.deepEqual(other.get('Other').map((s) => s.java_id), [13]);
});

// The committed snapshots (src/data/fish.json, species.json, media.json) make one union.
test('the committed snapshots: every species of both lists once, a slug each; the fish-ID species with no Java category are Fish', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const [fishList, javaList, mediaList] = [read('src/data/fish.json'), read('src/data/species.json'), read('src/data/media.json')];
  const list = unionSpecies(fishList, javaList, mediaList);
  assert.equal(new Set(list.map((s) => s.slug)).size, list.length, 'a slug each');
  for (const s of list) assert.match(s.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, s.slug);
  assert.deepEqual(list.filter((s) => s.species_id !== null).map((s) => s.species_id).sort(), fishList.map((f) => f.species_id).sort());
  assert.deepEqual(list.filter((s) => s.java_id !== null).map((s) => s.java_id).sort((a, b) => a - b), javaList.map((j) => j.id).sort((a, b) => a - b));
  const both = list.filter((s) => s.species_id !== null && s.java_id !== null).length;
  assert.equal(list.length, fishList.length + javaList.length - both);
  assert.ok(both > 0, 'the two lists share species');
  const manatee = list.find((s) => s.latin === 'Trichechus manatus');
  assert.equal(manatee?.category, 'Mammal');
  const javaCategory = new Map(javaList.map((j) => [j.id, j.category]));
  for (const s of list.filter((x) => x.species_id !== null && (x.java_id === null || javaCategory.get(x.java_id) === null))) assert.equal(s.category, 'Fish', s.latin);
  assert.equal([...byCategory(list).values()].flat().length, list.length, 'byCategory: each species once');
});
