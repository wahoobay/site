// A species' names as the admin reads them (src/lib/admin/names.mjs): the one test for the "[unverified] <name>"
// placeholder that SightingWriteService.resolveSpeciesId stores as a provisional species' scientific name, shared by the
// sighting screens (sightings.mjs, and through it the dashboard and the recycle bin) and the catalogue (catalogue.mjs).
// Finish review, fix 4: the queue showed the placeholder in italics as if it were a taxon. Pure, no build needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPlaceholder, isProvisional, scientificName, visitorsName } from '../src/lib/admin/names.mjs';

test('isPlaceholder: the server\'s "[unverified] …" mark, any case, spaces around it', () => {
  assert.equal(isPlaceholder('[unverified] Big silver fish with a yellow tail'), true);
  assert.equal(isPlaceholder('  [Unverified] Blue fish'), true);
  assert.equal(isPlaceholder('[unverified]'), true);
  assert.equal(isPlaceholder('Abudefduf saxatilis'), false);
  assert.equal(isPlaceholder('A fish [unverified]'), false, 'only at the start');
  assert.equal(isPlaceholder(null), false);
  assert.equal(isPlaceholder(undefined), false);
});

test('scientificName: a scientific name as text, or null for none and for the placeholder', () => {
  assert.equal(scientificName(' Abudefduf saxatilis '), 'Abudefduf saxatilis');
  assert.equal(scientificName('[unverified] Blue fish'), null);
  assert.equal(scientificName(''), null);
  assert.equal(scientificName(null), null);
});

test('isProvisional: name_status provisional, or the placeholder as its scientific name', () => {
  assert.equal(isProvisional({ name_status: 'provisional', scientific_name: 'Chromis cyanea' }), true);
  assert.equal(isProvisional({ name_status: null, scientific_name: '[unverified] Blue fish' }), true);
  assert.equal(isProvisional({ name_status: 'accepted', scientific_name: 'Abudefduf saxatilis' }), false);
  assert.equal(isProvisional(null), false);
});

test('visitorsName: what the visitor typed, for a provisional name only: the common name, else the placeholder\'s text', () => {
  // resolveSpeciesId: INSERT INTO species (scientific_name, common_name, name_status) VALUES ("[unverified] " + common, common, 'provisional')
  assert.equal(visitorsName({ name_status: 'provisional', common_name: 'Big silver fish with a yellow tail', scientific_name: '[unverified] Big silver fish with a yellow tail' }), 'Big silver fish with a yellow tail');
  assert.equal(visitorsName({ name_status: null, common_name: null, scientific_name: '[unverified]  Blue fish ' }), 'Blue fish', 'no common name: the placeholder\'s own words');
  assert.equal(visitorsName({ name_status: 'provisional', common_name: null, scientific_name: '[unverified]' }), null, 'nothing typed');
  assert.equal(visitorsName({ name_status: 'accepted', common_name: 'Sergeant major', scientific_name: 'Abudefduf saxatilis' }), null, 'a confirmed name is no visitor\'s');
  assert.equal(visitorsName(null), null);
});

test('one test for the placeholder: sightings.mjs and catalogue.mjs import it from names.mjs and carry no copy', () => {
  for (const file of ['src/lib/admin/sightings.mjs', 'src/lib/admin/catalogue.mjs']) {
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.match(code, /from '\.\/names\.mjs'/, `${file} imports the helper`);
    assert.doesNotMatch(code, /\\\[unverified\\\]/i, `${file} has no regular expression of its own for the placeholder`);
  }
});
