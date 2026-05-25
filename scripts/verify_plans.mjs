#!/usr/bin/env node
// Sanity-check the Featured Plans corpus before bundling/publishing:
//
//   • per language: count == 54, every slug also exists in en/.
//   • per file: required fields present (id, slug, category, duration_days,
//     cover.color_primary / color_secondary, days[].sections shape).
//   • every verse.book_code resolves to a slug (matches our reader).
//   • every verse.text and every paragraphs[] non-empty.
//
// Run after every plan-source edit (and listed in the data-pipeline
// memory note so it doesn't get skipped):
//   node scripts/verify_plans.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '/Users/liwencao/claude_herbible_plan/featured_plans';
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'];

// Mirror BOOK_CODE_TO_SLUG in src/constants/bibleBookCode.ts so we don't
// need a TS loader. Update both sides if you add a code.
const BOOK_CODE_TO_SLUG = {
  GEN: 'genesis', EXO: 'exodus', LEV: 'leviticus', NUM: 'numbers',
  DEU: 'deuteronomy', JOS: 'joshua', JDG: 'judges', RUT: 'ruth',
  '1SA': 'i-samuel', '2SA': 'ii-samuel', '1KI': 'i-kings', '2KI': 'ii-kings',
  '1CH': 'i-chronicles', '2CH': 'ii-chronicles',
  EZR: 'ezra', NEH: 'nehemiah', EST: 'esther',
  JOB: 'job', PSA: 'psalms', PRO: 'proverbs', ECC: 'ecclesiastes', SNG: 'song-of-solomon',
  ISA: 'isaiah', JER: 'jeremiah', LAM: 'lamentations', EZK: 'ezekiel', DAN: 'daniel',
  HOS: 'hosea', JOL: 'joel', AMO: 'amos', OBA: 'obadiah', JON: 'jonah',
  MIC: 'micah', NAM: 'nahum', HAB: 'habakkuk', ZEP: 'zephaniah',
  HAG: 'haggai', ZEC: 'zechariah', MAL: 'malachi',
  MAT: 'matthew', MRK: 'mark', LUK: 'luke', JHN: 'john', ACT: 'acts',
  ROM: 'romans', '1CO': 'i-corinthians', '2CO': 'ii-corinthians',
  GAL: 'galatians', EPH: 'ephesians', PHP: 'philippians', COL: 'colossians',
  '1TH': 'i-thessalonians', '2TH': 'ii-thessalonians',
  '1TI': 'i-timothy', '2TI': 'ii-timothy', TIT: 'titus', PHM: 'philemon',
  HEB: 'hebrews', JAS: 'james', '1PE': 'i-peter', '2PE': 'ii-peter',
  '1JN': 'i-john', '2JN': 'ii-john', '3JN': 'iii-john',
  JUD: 'jude', REV: 'revelation-of-john',
};

let warnings = 0;
const warn = (m) => { warnings++; console.log(`  ⚠️  ${m}`); };

function checkVerse(v, ctx) {
  if (!v) return warn(`${ctx}: verse missing`);
  if (!v.book_code || !BOOK_CODE_TO_SLUG[v.book_code]) warn(`${ctx}: unknown book_code "${v.book_code}"`);
  if (!v.chapter) warn(`${ctx}: missing chapter`);
  if (v.verses == null || v.verses === '') warn(`${ctx}: missing verses`);
  if (!v.text || !v.text.trim()) warn(`${ctx}: empty text`);
}

function checkPlan(file, raw) {
  const p = raw.plan;
  if (!p) return warn(`${file}: missing 'plan' root`);
  for (const k of ['id', 'slug', 'title', 'duration_days']) {
    if (!p[k]) warn(`${file}: missing plan.${k}`);
  }
  if (!p.category?.primary) warn(`${file}: missing category.primary`);
  if (!p.cover?.color_primary || !p.cover?.color_secondary) warn(`${file}: missing cover gradient colors`);
  if (!Array.isArray(raw.days) || raw.days.length === 0) {
    warn(`${file}: empty days[]`); return;
  }
  if (raw.days.length !== p.duration_days) {
    warn(`${file}: days.length (${raw.days.length}) ≠ duration_days (${p.duration_days})`);
  }
  for (const day of raw.days) {
    if (!day.day || !day.title) warn(`${file}: day ${day.day || '?'}: missing day/title`);
    if (!Array.isArray(day.sections) || day.sections.length === 0) {
      warn(`${file}: day ${day.day}: empty sections[]`); continue;
    }
    for (const s of day.sections) {
      const ctx = `${file} day${day.day} ${s.type}`;
      if (s.type === 'scripture_focus') checkVerse(s.verse, ctx);
      else if (s.type === 'teaching') {
        if (!Array.isArray(s.paragraphs) || s.paragraphs.some(p => !p?.trim())) warn(`${ctx}: empty paragraph`);
      } else if (s.type === 'prayer') {
        if (!s.body?.trim()) warn(`${ctx}: empty prayer body`);
      } else if (s.type === 'verse_wall') {
        if (!Array.isArray(s.verses) || s.verses.length === 0) warn(`${ctx}: empty verses[]`);
        else s.verses.forEach((v, i) => checkVerse(v, `${ctx}[${i}]`));
      }
    }
  }
}

function loadLang(lang) {
  const dir = join(SRC, lang);
  let files;
  try { files = readdirSync(dir).filter(f => f.endsWith('.json')); }
  catch { return null; }
  return files;
}

console.log('═══ Featured Plans verification ═══');

const enFiles = loadLang('en');
if (!enFiles) {
  console.error('  ⚠️  en/ directory missing — cannot verify slug parity');
  process.exit(1);
}
const enSlugs = new Set(enFiles.map(f => f.replace(/\.json$/, '')));

for (const lang of LANGS) {
  const files = loadLang(lang);
  if (!files) { warn(`${lang}: directory missing`); continue; }
  console.log(`\n  ${lang}: ${files.length} files`);
  if (files.length !== 54) warn(`${lang}: expected 54 plans, got ${files.length}`);
  const slugs = new Set(files.map(f => f.replace(/\.json$/, '')));
  for (const s of enSlugs) if (!slugs.has(s)) warn(`${lang}: missing slug ${s}`);
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(SRC, lang, f), 'utf8'));
    checkPlan(`${lang}/${f}`, raw);
  }
}

console.log(`\n${warnings === 0 ? '✓ all checks passed' : `⚠️  ${warnings} warning(s)`}`);
process.exit(warnings === 0 ? 0 : 1);
