#!/usr/bin/env node
// CDN preflight + integrity check for the commentary corpus.
//
// Walks the CORPUS_COMMIT pin in src/constants/corpus.ts, fetches the
// commentary tree from jsDelivr, and asserts:
//   1. commentary/en/LICENSE references CC BY-SA 4.0 + Tyndale
//   2. commentary/en/index.json is present and well-formed
//   3. For every KJV chapter the user's reader can open:
//      - the matching commentary chapter exists at the new SHA
//      - every verse number from KJV has a non-empty text entry
//      - no entry is shorter than ~15 chars or longer than 600 words
//
// Run after pushing the new corpus commit, before bumping CORPUS_COMMIT.
//
// Usage: node scripts/verify_commentary.mjs
//        node scripts/verify_commentary.mjs --book=genesis,exodus  # subset

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const args = parseArgs(process.argv.slice(2));
const BOOK_FILTER = args.book ? String(args.book).split(',') : null;
const SAMPLE_ONLY = !!args.sample;   // when set, only audit 30 representative chapters

const REPRESENTATIVE = [
  ['genesis', 1], ['genesis', 3], ['exodus', 20], ['exodus', 36],   // Ex 36 is 100% Claude
  ['leviticus', 19], ['numbers', 6], ['deuteronomy', 6],
  ['joshua', 1], ['judges', 4], ['ruth', 1],
  ['psalms', 1], ['psalms', 23], ['psalms', 91], ['psalms', 119],
  ['proverbs', 31], ['ecclesiastes', 3], ['isaiah', 53], ['jeremiah', 29],
  ['ezekiel', 36], ['daniel', 3],
  ['matthew', 5], ['mark', 1], ['luke', 15], ['john', 3], ['john', 14],
  ['acts', 2], ['romans', 8], ['romans', 12], ['i-corinthians', 13],
  ['ephesians', 2], ['philippians', 4], ['hebrews', 11], ['james', 1],
  ['revelation-of-john', 21],
];

async function main() {
  const corpusTs = await readFile(path.join(REPO_ROOT, 'src/constants/corpus.ts'), 'utf8');
  const m = corpusTs.match(/CORPUS_COMMIT\s*=\s*['"]([a-f0-9]+)['"]/);
  if (!m) die('CORPUS_COMMIT not found in src/constants/corpus.ts');
  const sha = m[1];
  const root = `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${sha}`;
  console.log(`Verifying ${root}`);

  let failures = 0;
  failures += await checkLicense(root) ? 0 : 1;
  failures += await checkIndex(root) ? 0 : 1;
  failures += await checkChapters(root);

  if (failures > 0) {
    console.error(`\n✗ ${failures} check(s) failed. Do not ship this SHA.`);
    process.exit(1);
  }
  console.log('\n✓ All commentary checks passed.');
}

async function checkLicense(root) {
  const url = `${root}/commentary/en/LICENSE`;
  const res = await fetch(url);
  if (!res.ok) { console.error(`  ✗ LICENSE missing (HTTP ${res.status})`); return false; }
  const txt = await res.text();
  if (!/CC[ -]BY[ -]SA[ -]?4\.0/i.test(txt) && !/by-sa\/4\.0/i.test(txt)) {
    console.error('  ✗ LICENSE does not reference CC BY-SA 4.0'); return false;
  }
  if (!/tyndale/i.test(txt)) {
    console.error('  ✗ LICENSE does not credit Tyndale'); return false;
  }
  console.log('  ✓ LICENSE present and credits Tyndale + CC BY-SA 4.0');
  return true;
}

async function checkIndex(root) {
  const url = `${root}/commentary/en/index.json`;
  try {
    const data = await fetchJson(url);
    const need = ['source', 'license', 'generatedAt', 'stats'];
    for (const k of need) if (!(k in data)) { console.error(`  ✗ index.json missing "${k}"`); return false; }
    if (!/by-sa/i.test(data.license)) { console.error('  ✗ index.json license not CC-BY-SA-4.0'); return false; }
    console.log(`  ✓ index.json — source=${data.source}, license=${data.license}`);
    console.log(`    stats: ${JSON.stringify(data.stats)}`);
    return true;
  } catch (e) {
    console.error(`  ✗ index.json missing or invalid: ${e.message}`);
    return false;
  }
}

async function checkChapters(root) {
  const kjvIndex = await fetchJson(`${root}/bibles/en/index.json`);
  const books = kjvIndex.books.filter(b => !BOOK_FILTER || BOOK_FILTER.includes(b.slug));
  const targets = SAMPLE_ONLY
    ? REPRESENTATIVE.filter(([s]) => books.some(b => b.slug === s))
    : books.flatMap(b => Array.from({ length: b.chapters }, (_, i) => [b.slug, i + 1]));

  console.log(`Auditing ${targets.length} chapters...`);
  let failed = 0;
  for (const [slug, ch] of targets) {
    const kjv = await fetchJson(`${root}/bibles/en/books/${slug}/chapters/${ch}.json`).catch(() => null);
    if (!kjv) { console.error(`  ✗ ${slug} ${ch}: KJV chapter missing`); failed++; continue; }
    const comm = await fetchJson(`${root}/commentary/en/books/${slug}/chapters/${ch}.json`).catch(() => null);
    if (!comm) { console.error(`  ✗ ${slug} ${ch}: commentary chapter missing`); failed++; continue; }

    const kjvVerses = new Set(kjv.verses.map(v => v.verse));
    const commVerses = new Map(comm.verses.map(v => [v.verse, v.text]));
    if (kjvVerses.size !== commVerses.size) {
      console.error(`  ✗ ${slug} ${ch}: count mismatch (KJV=${kjvVerses.size}, comm=${commVerses.size})`);
      failed++; continue;
    }
    let bad = null;
    for (const v of kjvVerses) {
      const t = commVerses.get(v);
      if (typeof t !== 'string' || t.trim().length < 15) { bad = `v${v} too short or missing`; break; }
      const wc = t.split(/\s+/).filter(Boolean).length;
      if (wc > 600) { bad = `v${v} too long (${wc} words)`; break; }
      if (/A short reflection on this verse will appear here/i.test(t)) { bad = `v${v} placeholder`; break; }
    }
    if (bad) { console.error(`  ✗ ${slug} ${ch}: ${bad}`); failed++; continue; }
  }
  const pass = targets.length - failed;
  console.log(`  ${pass}/${targets.length} chapters OK${failed ? `, ${failed} FAILED` : ''}`);
  return failed;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    out[a.slice(2)] = true;
  }
  return out;
}

function die(m) { console.error(m); process.exit(2); }

main().catch(e => { console.error(e); process.exit(1); });
