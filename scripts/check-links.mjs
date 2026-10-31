#!/usr/bin/env node
// Link checker for the built site in dist/.
//  1. Every internal href/src/srcset target must resolve to a file in dist, except a path under /api/public/: the
//     site's distribution sends those to the fish-ID app (a species' latest crop, its reference photo, the open-data
//     page's files). They are skipped, and the summary says how many, beside the internal links checked.
//  2. Every <img> has an alt attribute.
// Exit code 1 if anything fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Optional first argument: the directory to check (default: dist/ at the repo root).
const OUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

if (!fs.existsSync(OUT)) {
  console.error(`Build output not found at ${OUT}. Run "npm run build" first.`);
  process.exit(1);
}

const files = walk(OUT);
const htmlFiles = files.filter((f) => f.endsWith(".html"));

const errors = [];
let linksChecked = 0;
let apiSkipped = 0;

function resolveTarget(fromFile, target) {
  const clean = target.split("#")[0].split("?")[0];
  if (!clean) return true; // pure fragment or query on the same page
  let fsPath = clean.startsWith("/")
    ? path.join(OUT, decodeURIComponent(clean))
    : path.resolve(path.dirname(fromFile), decodeURIComponent(clean));
  if (fs.existsSync(fsPath)) {
    if (fs.statSync(fsPath).isDirectory()) {
      if (!clean.endsWith("/")) return false; // directory link without trailing slash
      return fs.existsSync(path.join(fsPath, "index.html"));
    }
    return true;
  }
  return false;
}

const isApi = (u) => u.startsWith("/api/public/");
const isExternal = (u) => /^(https?:)?\/\//i.test(u) || /^(mailto|tel|data|javascript):/i.test(u);
/** A link this checker leaves alone: another site's, or the fish-ID app's under /api/public/ (counted). */
function skipped(url) {
  if (isApi(url)) {
    apiSkipped++;
    return true;
  }
  return isExternal(url);
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(OUT, file);

  // href / src attributes
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/g)) {
    const url = m[1].trim();
    if (!url || skipped(url)) continue;
    linksChecked++;
    if (!resolveTarget(file, url)) errors.push(`${rel}: broken link "${url}"`);
  }
  // srcset
  for (const m of html.matchAll(/\bsrcset\s*=\s*"([^"]*)"/g)) {
    for (const part of m[1].split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (!url || skipped(url)) continue;
      linksChecked++;
      if (!resolveTarget(file, url)) errors.push(`${rel}: broken srcset "${url}"`);
    }
  }
  // images need alt attributes
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=/.test(m[0])) errors.push(`${rel}: <img> without alt: ${m[0].slice(0, 120)}`);
  }
}

console.log(`Checked ${htmlFiles.length} HTML files, ${linksChecked} internal links; skipped ${apiSkipped} links under /api/public/ (the fish-ID app's).`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("All internal links resolve, all images have alt text.");
