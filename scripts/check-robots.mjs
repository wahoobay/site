#!/usr/bin/env node
// Is robots.txt the staging "block everything" file or the real one?
// Usage: node scripts/check-robots.mjs <url> allow|disallow   (BASIC_AUTH=user:pass for the staging site)
import { fileURLToPath } from 'node:url';

export function robotsBlocksEverything(text) {
  return /^Disallow:\s*\/\s*$/m.test(text);
}

async function main([url, expect]) {
  if (!url || !['allow', 'disallow'].includes(expect)) {
    console.error('usage: check-robots.mjs <url> allow|disallow');
    return 2;
  }
  const headers = process.env.BASIC_AUTH ? { authorization: 'Basic ' + Buffer.from(process.env.BASIC_AUTH).toString('base64') } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`${url}: HTTP ${res.status}`);
    return 1;
  }
  const blocks = robotsBlocksEverything(await res.text());
  const state = blocks ? 'blocks everything' : 'allows indexing';
  if (blocks !== (expect === 'disallow')) {
    console.error(`${url}: robots.txt ${state}, expected ${expect}`);
    return 1;
  }
  console.log(`${url}: robots.txt ${state}, as expected`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
