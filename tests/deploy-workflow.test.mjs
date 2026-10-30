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

// Each job's build step and the public settings in its env block, one `NAME: value` a line.
const staging = yml.slice(yml.indexOf('\n  staging:\n'), yml.indexOf('\n  production:\n'));
const production = yml.slice(yml.indexOf('\n  production:\n'));
const buildEnv = (job) => {
  const block = job.match(/- run: npm ci && npm run build && [^\n]*\n {8}env:\n((?: {10}[A-Z_]+: [^\n]+\n)+)/)?.[1] ?? '';
  return Object.fromEntries(block.trim().split('\n').filter(Boolean).map((line) => line.trim().split(/: (.*)/s).slice(0, 2)));
};

test('the build step names the fish-ID app per environment: staging-ai on staging, ai in production', () => {
  assert.equal(buildEnv(staging).PUBLIC_AI_URL, '"https://staging-ai.wahoobay.net/"');
  assert.equal(buildEnv(production).PUBLIC_AI_URL, '"https://ai.wahoobay.net/"');
  assert.doesNotMatch(staging, /https:\/\/ai\.wahoobay\.net/);
  assert.doesNotMatch(production, /staging-ai/);
});

test('both deploy builds pass PUBLIC_MAPBOX_TOKEN and PUBLIC_SITE_ENV', () => {
  assert.equal((yml.match(/PUBLIC_MAPBOX_TOKEN: \$\{\{ vars\.MAPBOX_TOKEN \}\}/g) || []).length, 2);
  assert.match(yml, /PUBLIC_SITE_ENV: staging/); assert.match(yml, /PUBLIC_SITE_ENV: production/);
});

test('each job\'s build step reads the map token from the repository variable and names its environment', () => {
  // The token is a public, URL-restricted Mapbox token: a repository variable, never a secret, and never written here.
  assert.deepEqual(buildEnv(staging), {
    PUBLIC_AI_URL: '"https://staging-ai.wahoobay.net/"',
    PUBLIC_MAPBOX_TOKEN: '${{ vars.MAPBOX_TOKEN }}',
    PUBLIC_SITE_ENV: 'staging',
  });
  assert.deepEqual(buildEnv(production), {
    PUBLIC_AI_URL: '"https://ai.wahoobay.net/"',
    PUBLIC_MAPBOX_TOKEN: '${{ vars.MAPBOX_TOKEN }}',
    PUBLIC_SITE_ENV: 'production',
  });
  assert.doesNotMatch(yml, /secrets\.MAPBOX|pk\.[A-Za-z0-9]/, 'no token in the workflow, and none from a secret');
});
