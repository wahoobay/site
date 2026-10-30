import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The workflow is checked as text: its shape matters more than a YAML parse.
const yml = readFileSync('.github/workflows/deploy.yml', 'utf8');

test('concurrency groups are per environment', () => {
  assert.match(yml, /group: wahoobay-site-staging/);
  assert.match(yml, /group: wahoobay-site-prod/);
});

test('staging verify expects 401 without credentials on three HTML pages', () => {
  assert.match(yml, /for page in \/ \/about\/ \/learn\/; do/);
  assert.match(yml, /"https:\/\/\$HOST\$page"\)" = "401"/);
});

test('staging verify authenticates as wahoobay and keeps the secret out of the log', () => {
  assert.match(yml, /wahoobay:\$AUTH/);
  assert.doesNotMatch(yml, /shipwreck/i);
  assert.doesNotMatch(yml, /echo[^\n]*\$AUTH/);
  assert.doesNotMatch(yml, /set -x/);
});

test('production release tags use the site-prod- prefix', () => {
  assert.match(yml, /tag="site-prod-/);
});

test('node comes from .nvmrc and the build step runs before any deploy', () => {
  assert.match(yml, /node-version-file: \.nvmrc/);
  assert.match(yml, /npm ci && npm run build && npm test && npm run check && npm run check:links/);
  assert.ok(yml.indexOf('npm run check') < yml.indexOf('scripts/deploy.sh staging'));
});

test('deploys read the repository variables and secret by their agreed names', () => {
  for (const n of ['STAGING_ROLE_ARN', 'STAGING_BUCKET', 'STAGING_DISTRIBUTION_ID', 'STAGING_KVS_ARN', 'STAGING_HOSTNAME', 'STAGING_BASIC_AUTH', 'PROD_ROLE_ARN', 'PROD_BUCKET', 'PROD_DISTRIBUTION_ID', 'PROD_KVS_ARN']) {
    assert.ok(yml.includes(n), n);
  }
});

test('deploy builds from dist/, not _site/', () => {
  assert.doesNotMatch(yml, /_site/);
});
