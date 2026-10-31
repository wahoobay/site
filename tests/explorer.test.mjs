// The species explorer's data (src/lib/explorer.mjs): the union of the fish-ID app's species (src/data/fish.json,
// `npm run sync:fish`) and the Java API's (src/data/species.json and media.json, `npm run sync:species`), merged on the
// scientific name as nomenclature writes it (src/lib/names.mjs), one entry and one page slug per species. Pure: no build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byCategory, categoryOf, slugify, unionSpecies } from '../src/lib/explorer.mjs';
import { binomial } from '../src/lib/names.mjs';
import { binomial as syncBinomial } from '../scripts/sync-species.mjs';
import { CATEGORIES } from '../src/lib/species.mjs';

const KEYS = ['also_listed_as', 'category', 'common', 'conservation_status', 'family', 'java_id', 'last_seen', 'latest_crop', 'latin', 'media', 'order', 'photo', 'sightings_7d', 'sightings_total', 'slug', 'species_id'];

// The fish-ID app's list (GET /api/public/species, as the sync writes it).
const fish = [
  {
    species_id: 'abudefduf-saxatilis',
    latin: 'Abudefduf saxatilis',
    common: 'Sergeant major',
    family: 'Pomacentridae',
    order: 'Ovalentaria incertae sedis',
    class: 'Teleostei',
    phylum: 'Chordata',
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
    class: 'Teleostei',
    phylum: 'Chordata',
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
  assert.equal(major.category, 'Fish', 'no Java category: the fish-ID class decides (Teleostei)');
  assert.equal(major.also_listed_as, null, 'the Java name is the accepted one');
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
    also_listed_as: null,
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

test('unionSpecies keeps a fish-ID-only species, filed by its class (Teleostei: Fish), with its counts', () => {
  const grunt = unionSpecies(fish, java, media).find((s) => s.species_id === 'c0ffee00-1111-2222-3333-444455556666');
  assert.deepEqual(grunt, {
    slug: 'haemulon-sciurus',
    latin: 'Haemulon sciurus',
    common: 'Bluestriped grunt',
    family: 'Haemulidae',
    order: 'Perciformes',
    also_listed_as: null,
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

test('byCategory groups the union in the gallery\'s categories: the manatee under Mammal, a fish-ID-only bony fish under Fish', () => {
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

// Ruling 36: the fish-ID app's species_id is the classifier's name, which for these four is the Java list's name, while
// its latin is the accepted (WoRMS) name; the union joins them on either.
const fishRow = (over) => ({
  family: null, order: null, class: 'Teleostei', phylum: 'Chordata', aphia_id: null, photo: null, latest_crop: null,
  sightings_total: 1, sightings_7d: 1, first_seen: null, last_seen: null, ...over,
});
const renamedFish = [
  fishRow({ species_id: 'Carangoides ruber', latin: 'Caranx ruber', common: 'Bar Jack', family: 'Carangidae' }),
  fishRow({ species_id: 'Haemulon chrysargyreum', latin: 'Brachygenys chrysargyrea', common: 'Smallmouth Grunt', family: 'Haemulidae' }),
  fishRow({ species_id: 'carangoides_bartholomaei', latin: 'Caranx bartholomaei', common: 'Yellow Jack - Juvi', family: 'Carangidae' }),
  fishRow({ species_id: 'Strombus alatus', latin: 'Strombus pugilis', common: 'Florida Fighting Conch', family: 'Strombidae', class: 'Gastropoda', phylum: 'Mollusca' }),
];
const renamedJava = [
  { id: 39, common_name: 'Bar Jack', scientific_name: 'Carangoides ruber', family: 'Carangidae', category: 'Fish', conservation_status: null },
  { id: 9, common_name: 'Smallmouth Grunt', scientific_name: 'Haemulon chrysargyreum', family: 'Haemulidae', category: 'Fish', conservation_status: null },
  { id: 27, common_name: 'Yellow Jack', scientific_name: 'Carangoides bartholomaei', family: 'Carangidae', category: 'Fish', conservation_status: null },
  { id: 89, common_name: 'Florida Fighting Conch', scientific_name: 'Strombus alatus', family: 'Strombidae', category: 'Invertebrate', conservation_status: null },
];

test('unionSpecies joins a Java species named as the fish-ID id: one entry, the accepted name, "also listed as" the Java name', () => {
  const list = unionSpecies(renamedFish, renamedJava, []);
  assert.equal(list.length, 4, 'four species, not eight');
  for (const s of list) assert.deepEqual(Object.keys(s).sort(), KEYS);
  const by = new Map(list.map((s) => [s.latin, s]));
  assert.deepEqual(
    [...by.values()].map((s) => [s.slug, s.latin, s.also_listed_as, s.species_id, s.java_id, s.common, s.category]).sort(),
    [
      ['brachygenys-chrysargyrea', 'Brachygenys chrysargyrea', 'Haemulon chrysargyreum', 'Haemulon chrysargyreum', 9, 'Smallmouth Grunt', 'Fish'],
      ['caranx-bartholomaei', 'Caranx bartholomaei', 'Carangoides bartholomaei', 'carangoides_bartholomaei', 27, 'Yellow Jack', 'Fish'],
      ['caranx-ruber', 'Caranx ruber', 'Carangoides ruber', 'Carangoides ruber', 39, 'Bar Jack', 'Fish'],
      ['strombus-pugilis', 'Strombus pugilis', 'Strombus alatus', 'Strombus alatus', 89, 'Florida Fighting Conch', 'Invertebrate'],
    ],
  );
  // A Java name that is the accepted name still joins on it, with no "also listed as".
  const [same] = unionSpecies([renamedFish[0]], [{ ...renamedJava[0], scientific_name: 'Caranx Ruber' }], []);
  assert.deepEqual([same.java_id, same.also_listed_as], [39, null]);
  // A fish-ID id that is its own accepted name adds nothing; a species on one list stays one entry.
  assert.equal(unionSpecies([renamedFish[0]], [], []).length, 1);
  assert.equal(unionSpecies([], renamedJava, []).length, 4);
});

test('unionSpecies: the Java species with the accepted name joins first; one named as the fish-ID id keeps its own entry then', () => {
  // Both names are on the Java list, in either order: the accepted name joins, the old name is a species of its own.
  for (const java of [[renamedJava[0], { ...renamedJava[0], id: 40, scientific_name: 'Caranx ruber' }], [{ ...renamedJava[0], id: 40, scientific_name: 'Caranx ruber' }, renamedJava[0]]]) {
    const list = unionSpecies([renamedFish[0]], java, []);
    assert.deepEqual(
      list.map((s) => [s.slug, s.java_id, s.species_id, s.also_listed_as]).sort(),
      [['carangoides-ruber', 39, null, null], ['caranx-ruber', 40, 'Carangoides ruber', null]],
    );
  }
});

// Ruling 37: a species' category is the Java list's where it has one; otherwise the fish-ID class decides.
test('categoryOf: the Java category wins; else the class: bony fish, sharks and rays, birds, mammals, reptiles, invertebrates, Other', () => {
  const taxon = (cls, phylum) => ({ fish: fishRow({ species_id: 'x', latin: 'X y', class: cls, phylum }) });
  assert.equal(categoryOf(taxon('Actinopterygii', 'Chordata')), 'Fish', 'a bony fish');
  assert.equal(categoryOf(taxon('Teleostei', 'Chordata')), 'Fish', 'the catalogue\'s class for bony fish');
  assert.equal(categoryOf(taxon('Actinopteri', 'Chordata')), 'Fish', 'WoRMS\'s class for ray-finned fish');
  assert.equal(categoryOf(taxon('Elasmobranchii', 'Chordata')), 'Shark & Ray', 'a shark (Carcharhinus limbatus)');
  assert.equal(categoryOf({ fish: fishRow({ species_id: 'Dasyatis centroura', latin: 'Bathytoshia centroura', class: 'Elasmobranchii', phylum: 'Chordata' }) }), 'Shark & Ray', 'the ray');
  assert.equal(categoryOf(taxon('Holocephali', 'Chordata')), 'Shark & Ray', 'a chimaera');
  assert.equal(categoryOf({ fish: fishRow({ species_id: 'Anhinga anhinga', latin: 'Anhinga anhinga', class: 'Aves', phylum: 'Chordata' }) }), 'Bird', 'the anhinga');
  assert.equal(categoryOf(taxon('Mammalia', 'Chordata')), 'Mammal');
  assert.equal(categoryOf(taxon('Reptilia', 'Chordata')), 'Reptile');
  assert.equal(categoryOf(taxon('Crocodylia', 'Chordata')), 'Reptile', 'the catalogue\'s class for the alligator');
  // Ruling 41: the catalogue's classes for turtles and for lizards and snakes.
  assert.equal(categoryOf(taxon('Testudines', 'Chordata')), 'Reptile', 'a turtle');
  assert.equal(categoryOf(taxon('Squamata', 'Chordata')), 'Reptile', 'a lizard or snake');
  assert.equal(categoryOf({ fish: renamedFish[3] }), 'Invertebrate', 'a conch (Gastropoda, Mollusca)');
  assert.equal(categoryOf(taxon('Malacostraca', 'Arthropoda')), 'Invertebrate');
  assert.equal(categoryOf(taxon('Ascidiacea', 'Chordata')), 'Other', 'a chordate class with no category of its own');
  assert.equal(categoryOf(taxon('Gastropoda', null)), 'Other', 'a class whose phylum is unknown');
  assert.equal(categoryOf(taxon(null, 'Chordata')), 'Other', 'no class');
  assert.equal(categoryOf({ fish: { species_id: 'x', latin: 'X y' } }), 'Other', 'a snapshot from before class and phylum');
  assert.equal(categoryOf({ java: { category: 'Fish' }, fish: fishRow({ species_id: 'x', latin: 'X y', class: 'Elasmobranchii' }) }), 'Fish', 'the Java category wins');
  assert.equal(categoryOf({ java: { category: null }, fish: fishRow({ species_id: 'x', latin: 'X y', class: 'Elasmobranchii' }) }), 'Shark & Ray', 'no Java category: the class');
  assert.equal(categoryOf({ java: { category: null } }), 'Other', 'Java only, no category');
  assert.equal(categoryOf({ java: { category: 'Mammal' } }), 'Mammal');
});

// The committed snapshots (src/data/fish.json, species.json, media.json) make one union.
test('the committed snapshots: distinct species after the union, every species of both lists once, a slug each; categories', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const [fishList, javaList, mediaList] = [read('src/data/fish.json'), read('src/data/species.json'), read('src/data/media.json')];
  const list = unionSpecies(fishList, javaList, mediaList);
  assert.equal(new Set(list.map((s) => s.slug)).size, list.length, 'a slug each');
  for (const s of list) assert.match(s.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, s.slug);
  assert.deepEqual(list.filter((s) => s.species_id !== null).map((s) => s.species_id).sort(), fishList.map((f) => f.species_id).sort());
  assert.deepEqual(list.filter((s) => s.java_id !== null).map((s) => s.java_id).sort((a, b) => a - b), javaList.map((j) => j.id).sort((a, b) => a - b));
  // Distinct species: every name an entry answers to (its accepted name, the Java name it is also listed as, its
  // fish-ID id as a name) belongs to that entry alone, so no species is in the list twice under two names.
  const owner = new Map();
  for (const s of list) {
    const names = new Set([s.latin, s.also_listed_as, s.species_id === null ? null : binomial(s.species_id.replace(/_/g, ' '))].filter((n) => n !== null));
    for (const name of names) {
      assert.ok(!owner.has(name), `${name} is both ${owner.get(name)} and ${s.slug}`);
      owner.set(name, s.slug);
    }
  }
  const joined = list.filter((s) => s.species_id !== null && s.java_id !== null).length;
  assert.equal(list.length, fishList.length + javaList.length - joined, 'each join is one species from the two lists');
  // Ruling 36's four, once each, the Java name beside the accepted one.
  for (const [latin, javaName] of [['Caranx ruber', 'Carangoides ruber'], ['Brachygenys chrysargyrea', 'Haemulon chrysargyreum'], ['Caranx bartholomaei', 'Carangoides bartholomaei'], ['Strombus pugilis', 'Strombus alatus']]) {
    const entries = list.filter((s) => s.latin === latin || s.latin === javaName);
    assert.equal(entries.length, 1, latin);
    assert.equal(entries[0].latin, latin);
    assert.equal(entries[0].also_listed_as, javaName);
    assert.ok(entries[0].species_id !== null && entries[0].java_id !== null, latin);
  }
  // Ruling 37: a category of the gallery's for each; the Java list's where it has one.
  const javaCategory = new Map(javaList.map((j) => [j.id, j.category]));
  for (const s of list) {
    assert.ok(CATEGORIES.includes(s.category), `${s.latin}: ${s.category}`);
    if (s.java_id !== null && javaCategory.get(s.java_id)) assert.equal(s.category, javaCategory.get(s.java_id), s.latin);
  }
  assert.equal(list.find((s) => s.latin === 'Trichechus manatus')?.category, 'Mammal');
  assert.equal([...byCategory(list).values()].flat().length, list.length, 'byCategory: each species once');
});
