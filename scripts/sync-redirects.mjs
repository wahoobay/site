#!/usr/bin/env node
// Sync redirects.json into the CloudFront KeyValueStore the site's function reads.
// Pure functions are unit-tested; the apply step shells out to the AWS CLI, which carries the
// SigV4A signing the KeyValueStore data-plane API requires. Never touches the `auth` key.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function toKvsEntries(redirects) {
  const out = {};
  for (const { from, to } of redirects) {
    if (from.includes('?')) {
      out[`redirect:?${from.split('?', 2)[1]}`] = to;
    } else {
      const bare = from.length > 1 && from.endsWith('/') ? from.slice(0, -1) : from;
      out[`redirect:${bare}`] = to;
    }
  }
  return out;
}

export function planKvsChanges(desired, current) {
  const puts = [];
  for (const [key, value] of Object.entries(desired)) {
    if (current[key] !== value) puts.push({ key, value });
  }
  const deletes = Object.keys(current)
    .filter((key) => key.startsWith('redirect:') && !(key in desired))
    .map((key) => ({ key }));
  return { puts, deletes };
}

function aws(args) {
  return JSON.parse(execFileSync('aws', ['cloudfront-keyvaluestore', ...args, '--output', 'json'], { encoding: 'utf8' }));
}

// CloudFront KeyValueStore accepts at most 50 puts+deletes per update-keys call, and the ETag changes
// after each successful update, so re-read it before every batch.
export const MAX_BATCH = 50;

export function applyPlan(kvsArn, plan, run = aws) {
  const ops = [
    ...plan.puts.map(({ key, value }) => ({ kind: 'puts', item: { Key: key, Value: value } })),
    ...plan.deletes.map(({ key }) => ({ kind: 'deletes', item: { Key: key } })),
  ];
  for (let i = 0; i < ops.length; i += MAX_BATCH) {
    const batch = ops.slice(i, i + MAX_BATCH);
    const etag = run(['describe-key-value-store', '--kvs-arn', kvsArn]).ETag;
    const args = ['update-keys', '--kvs-arn', kvsArn, '--if-match', etag];
    for (const kind of ['puts', 'deletes']) {
      const items = batch.filter((o) => o.kind === kind).map((o) => o.item);
      if (items.length) args.push(`--${kind}`, JSON.stringify(items));
    }
    run(args);
  }
}

export function main(kvsArn, redirectsPath = 'redirects.json') {
  const desired = toKvsEntries(JSON.parse(readFileSync(redirectsPath, 'utf8')));
  const current = {};
  for (const item of aws(['list-keys', '--kvs-arn', kvsArn]).Items ?? []) current[item.Key] = item.Value;
  const plan = planKvsChanges(desired, current);
  if (plan.puts.length === 0 && plan.deletes.length === 0) {
    console.log('redirects: no changes');
    return plan;
  }
  applyPlan(kvsArn, plan);
  console.log(`redirects: ${plan.puts.length} put, ${plan.deletes.length} deleted`);
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const kvsArn = process.env.KVS_ARN;
  if (!kvsArn) { console.error('KVS_ARN is required'); process.exit(2); }
  main(kvsArn);
}
