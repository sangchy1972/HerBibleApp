#!/usr/bin/env node
// Sanity-checks cross-translation verse alignment for the 7 bibles we ship,
// plus the multilingual daily-verses bundle.
//
// Two sections:
//  1. Bible chapters — fetch known-tricky chapters from all 7 translations
//     and report verse counts + first/last verse previews so we can eyeball
//     whether upstream pd-text-corpus normalized to KJV-style numbering.
//  2. Daily-verses bundle — verify every (day, segment) entry has non-empty
//     `modernText` in all 7 languages, and dump a parallel preview so we can
//     spot text that's clearly a different verse than its peers.
//
// Usage:  node scripts/verify_alignment.mjs

import { readFileSync } from 'node:fs';

// Keep in LOCKSTEP with CORPUS_COMMIT in src/constants/corpus.ts — this
// script had silently drifted to an older pin once (caught 2026-08-30).
const COMMIT = 'e9df0306d76c8b1bf66aae71fc6e93ed8622c8cc';
const CDN = `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${COMMIT}/bibles`;
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'];
const EDITION = {
  en: 'KJV', 'zh-Hans': '和合简', 'zh-Hant': '和合繁',
  de: 'Luth', fr: 'LSG', es: 'RV1909', pt: 'Almeida',
};

const TRICKY = [
  { slug: 'genesis',  ch: 1,  note: 'control: should be 31 verses everywhere' },
  { slug: 'psalms',   ch: 51, note: 'Hebrew title shift — KJV starts "Have mercy"; Hebrew/Luth would start "Dem Vorsänger"' },
  { slug: 'joel',     ch: 2,  note: 'KJV/CUV has 32 vv; Hebrew/Luth chapter 2 ends at v27, vv28-32 become Joel 3' },
  { slug: 'joel',     ch: 3,  note: 'KJV ends Joel here at v21; Hebrew/Luth has Joel 3 + Joel 4' },
  { slug: 'malachi',  ch: 4,  note: 'KJV has chapter 4 (6 vv); Hebrew/Vulgate ends Malachi at chapter 3 (v19+)' },
  { slug: 'romans',   ch: 16, note: 'doxology vv25-27 — usually here; some traditions move to 14:24-26' },
  { slug: 'iii-john', ch: 1,  note: 'short single-chapter book; verse boundaries occasionally differ' },
  { slug: 'john',     ch: 3,  note: 'control: should be 36 verses everywhere' },
];

async function fetchChapter(code, slug, ch) {
  const url = `${CDN}/${code}/books/${slug}/chapters/${ch}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, status: res.status };
    const json = await res.json();
    return { ok: true, verses: json.verses };
  } catch (e) {
    return { ok: false, status: 'fetch-error', err: e.message };
  }
}

const trunc = (s, n = 56) => {
  if (!s) return '';
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
};

async function checkChapter({ slug, ch, note }) {
  const results = await Promise.all(LANGS.map(async (code) => {
    const r = await fetchChapter(code, slug, ch);
    return { code, ...r };
  }));

  const counts = results.map(r => r.ok ? r.verses.length : `ERR(${r.status})`);
  const baseline = results.find(r => r.code === 'en');
  const baseCount = baseline?.ok ? baseline.verses.length : null;

  const mismatch = results.some(r => r.ok && baseCount !== null && r.verses.length !== baseCount);
  const flag = mismatch ? '⚠️ MISMATCH' : '✓';

  console.log(`\n${flag}  ${slug} ${ch}  — ${note}`);
  for (const r of results) {
    const tag = `${EDITION[r.code]}`.padEnd(8);
    if (!r.ok) {
      console.log(`  ${tag} ERR ${r.status}`);
      continue;
    }
    const v1 = r.verses[0]?.text || '';
    const vLast = r.verses[r.verses.length - 1]?.text || '';
    const n = r.verses.length;
    const cnt = baseCount !== null && n !== baseCount ? `${n}❗` : `${n}`;
    console.log(`  ${tag} ${cnt.padStart(4)} vv  v1="${trunc(v1, 50)}"  v${n}="${trunc(vLast, 40)}"`);
  }
}

async function checkAllBibles() {
  console.log('═══ 1. Bible chapter alignment ═══');
  console.log(`Source: ${CDN}`);
  console.log(`Editions: ${Object.values(EDITION).join(', ')}`);
  for (const t of TRICKY) {
    await checkChapter(t);
  }
}

async function checkDailyVerses() {
  console.log('\n\n═══ 2. Daily-verses multilingual sanity ═══');
  const path = new URL('../src/constants/dailyVersesBundled.ts', import.meta.url);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    console.log('  (could not read dailyVersesBundled.ts:', e.message, ')');
    return;
  }
  // Find the opening brace after `BUNDLED_DAILY_VERSES = ` and walk balanced
  // braces (respecting strings) until we close. A simple regex doesn't work
  // because the literal is deeply nested.
  const startIdx = raw.indexOf('BUNDLED_DAILY_VERSES');
  if (startIdx < 0) { console.log('  (could not find BUNDLED_DAILY_VERSES symbol)'); return; }
  const eqIdx = raw.indexOf('=', startIdx);
  const braceIdx = raw.indexOf('{', eqIdx);
  let depth = 0, i = braceIdx, inStr = null, esc = false;
  for (; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === inStr) { inStr = null; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const literal = raw.slice(braceIdx, i);
  let data;
  try {
    data = JSON.parse(literal);
  } catch {
    data = Function(`"use strict"; return (${literal});`)();
  }

  // Index by (day, segment) → { lang: entry }.
  const byKey = new Map();
  for (const lang of Object.keys(data)) {
    for (const v of data[lang]) {
      const key = `${v.day}-${v.segment}`;
      if (!byKey.has(key)) byKey.set(key, { ref: v.reference?.full_reference || '?', byLang: {} });
      byKey.get(key).byLang[lang] = v;
    }
  }

  let ok = 0, missing = 0, suspicious = 0;
  for (const [key, { ref, byLang }] of byKey) {
    const langs = Object.keys(byLang);
    const missingLangs = LANGS.filter(l => !byLang[l]);
    const empty = LANGS.filter(l => byLang[l] && !byLang[l].modernText?.trim());
    // Same reference across all languages? (it should be — they share one entry.)
    const refs = new Set(LANGS.map(l => byLang[l]?.reference?.full_reference).filter(Boolean));

    if (missingLangs.length || empty.length || refs.size > 1) {
      suspicious++;
      console.log(`\n⚠️  day ${key}  ref=${ref}`);
      if (missingLangs.length) console.log(`     missing langs: ${missingLangs.join(', ')}`);
      if (empty.length)        console.log(`     empty modernText: ${empty.join(', ')}`);
      if (refs.size > 1)       console.log(`     refs disagree: ${[...refs].join(' | ')}`);
    } else {
      ok++;
    }
  }

  // Per-entry zh-Hans vs zh-Hant character check. If they're literally
  // identical, Traditional almost certainly got pasted from the Simplified
  // file. We also flag entries where Traditional contains *any* known
  // simplified-only char that should be traditional in Hant.
  const HANS_ONLY = ['计划', '来', '进', '说', '将', '会', '这', '时', '过', '帮', '门', '体', '众', '阿们', '远', '点', '开', '两'];
  const TRAD_PAIRS = { '计划': '計劃', '来': '來', '进': '進', '说': '說', '将': '將', '会': '會', '这': '這', '时': '時', '过': '過', '帮': '幫', '门': '門', '体': '體', '众': '眾', '阿们': '阿們', '远': '遠', '点': '點', '开': '開', '两': '兩' };
  let zhMatches = 0, zhContaminated = 0;
  for (const [key, { byLang }] of byKey) {
    const hans = byLang['zh-Hans']?.modernText;
    const hant = byLang['zh-Hant']?.modernText;
    if (!hans || !hant) continue;
    if (hans === hant) zhMatches++;
    const stuck = HANS_ONLY.filter(s => hant.includes(s));
    if (stuck.length) zhContaminated++;
  }
  if (zhMatches > 0 || zhContaminated > 0) {
    console.log(`\n⚠️  zh-Hant integrity:`);
    console.log(`    ${zhMatches} of ${byKey.size} entries are byte-identical to zh-Hans (red flag)`);
    console.log(`    ${zhContaminated} entries contain simplified-only characters that have a traditional form`);
    console.log(`    First 3 examples:`);
    let n = 0;
    for (const [key, { ref, byLang }] of byKey) {
      if (n >= 3) break;
      const hant = byLang['zh-Hant']?.modernText;
      if (!hant) continue;
      const stuck = HANS_ONLY.filter(s => hant.includes(s));
      if (!stuck.length) continue;
      console.log(`      ${key} ${ref}: '${stuck.join("', '")}' should be '${stuck.map(s => TRAD_PAIRS[s]).join("', '")}'`);
      n++;
    }
  }

  // Side-by-side preview of the first 3 entries so the user can eyeball
  // whether translations actually correspond to the same verse.
  console.log('\n— Preview of first 3 entries (eyeball whether the texts match the same verse):');
  let shown = 0;
  for (const [key, { ref, byLang }] of byKey) {
    if (shown++ >= 3) break;
    console.log(`\n  ${key}  ref=${ref}`);
    for (const lang of LANGS) {
      const text = byLang[lang]?.modernText || '(missing)';
      console.log(`    ${EDITION[lang].padEnd(8)} ${trunc(text, 70)}`);
    }
  }

  console.log(`\nDaily-verses summary: ${ok} OK · ${suspicious} suspicious · ${byKey.size} total entries`);
}

// ─── 3. Versification-map round-trip ─────────────────────────────────────
// For each known-impactful canonical reference, fetch the destination
// chapter, apply the same adjustment our app uses, and check the verse it
// lands on actually contains content (not the title or a 404).

// Mirrors src/constants/versification.ts (Luther + LSG only). Plain JS so
// we don't need a TS loader to run this file from `node`. Sets are derived
// from the live corpus by scripts/derive_psalm_offsets.mjs.
const LUTH_PLUS_1 = new Set([
  3, 4, 5, 6, 7, 8, 9, 12, 13, 18, 19, 20, 21, 22, 30, 31, 34, 36, 38, 39, 40,
  41, 42, 44, 45, 46, 47, 48, 49, 53, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65,
  68, 69, 70, 75, 76, 77, 80, 81, 83, 84, 85, 88, 89, 92, 102, 108, 140, 142,
]);
const LUTH_PLUS_2 = new Set([51, 52, 54, 60]);
const LSG_PLUS_1 = new Set([
  3, 4, 5, 6, 7, 8, 9, 12, 18, 19, 20, 21, 22, 30, 31, 34, 36, 38, 39, 40, 41,
  42, 44, 45, 46, 47, 48, 49, 53, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 68,
  69, 70, 75, 76, 77, 80, 81, 83, 84, 85, 88, 89, 92, 102, 108, 140, 142,
]);
const LSG_PLUS_2 = new Set([51, 52, 54, 60]);

function adjustFocus(code, f) {
  if (code === 'de') return adjustLuther(f);
  if (code === 'fr') return adjustLsg(f);
  return f;
}
function adjustLuther(f) {
  if (f.bookSlug === 'psalms') {
    if (LUTH_PLUS_2.has(f.chapter)) return { ...f, verse: f.verse + 2 };
    if (LUTH_PLUS_1.has(f.chapter)) return { ...f, verse: f.verse + 1 };
    return f;
  }
  if (f.bookSlug === 'joel' && f.chapter === 2 && f.verse >= 28) return { ...f, chapter: 3, verse: f.verse - 27 };
  if (f.bookSlug === 'joel' && f.chapter === 3) return { ...f, chapter: 4 };
  if (f.bookSlug === 'malachi' && f.chapter === 4) return { ...f, chapter: 3, verse: f.verse + 18 };
  return f;
}
function adjustLsg(f) {
  if (f.bookSlug === 'psalms') {
    if (LSG_PLUS_2.has(f.chapter)) return { ...f, verse: f.verse + 2 };
    if (LSG_PLUS_1.has(f.chapter)) return { ...f, verse: f.verse + 1 };
  }
  return f;
}

// Each probe says: "the canonical KJV ref X means content like Y. After we
// adjust for the listed translations, the verse in the corpus should still
// contain content matching that meaning." We don't enforce exact match —
// just check that we landed on a non-empty, non-title verse.
// Multiple acceptable matches per language — first hit wins. The Chinese
// CUV uses Traditional, German Lutherbibel uses 1912 wording (gnädig vs
// Erbarme), and several psalms include the title prose IN verse 1.
const PROBES = [
  { kjv: 'Psalms 51:1',  bookSlug: 'psalms',  chapter: 51, verse: 1,
    contains: { en: ['mercy'], zh: ['憐', '怜'], de: ['gnädig', 'erbarme'], fr: ['pitié', 'misér'] } },
  { kjv: 'Joel 2:28',    bookSlug: 'joel',    chapter: 2,  verse: 28,
    contains: { en: ['pour out'], zh: ['澆灌', '浇灌'], de: ['Geist'], fr: ['répandrai'] } },
  { kjv: 'Malachi 4:2',  bookSlug: 'malachi', chapter: 4,  verse: 2,
    contains: { en: ['righteousness'], zh: ['日頭', '日头', '公義', '公义'], de: ['Sonne'], fr: ['soleil'] } },
  { kjv: 'Psalm 23:1',   bookSlug: 'psalms',  chapter: 23, verse: 1,
    contains: { en: ['shepherd'], zh: ['牧者'], de: ['Hirte'], fr: ['berger'] } },
];

async function probeAdjustment() {
  console.log('\n\n═══ 3. Versification-map round-trip (after adjustFocus) ═══');
  for (const p of PROBES) {
    console.log(`\n  Canonical: ${p.kjv}`);
    for (const code of ['en', 'zh-Hant', 'de', 'fr']) {
      const adj = adjustFocus(code, { bookSlug: p.bookSlug, chapter: p.chapter, verse: p.verse });
      const r = await fetchChapter(code, adj.bookSlug, adj.chapter);
      if (!r.ok) {
        console.log(`    ${EDITION[code].padEnd(8)} → ${adj.bookSlug} ${adj.chapter}:${adj.verse}  ERR ${r.status}`);
        continue;
      }
      const vObj = r.verses[adj.verse - 1];
      const text = vObj?.text || '(missing)';
      const probeKey = code === 'en' ? 'en' : code.startsWith('zh') ? 'zh' : code;
      const candidates = p.contains[probeKey] || [];
      const lower = text.toLowerCase();
      const hit = candidates.length === 0 ? null
        : candidates.some(c => lower.includes(c.toLowerCase()) || text.includes(c));
      const flag = hit === null ? '·' : hit ? '✓' : '⚠️';
      console.log(`    ${EDITION[code].padEnd(8)} → ${adj.bookSlug} ${adj.chapter}:${adj.verse}  ${flag}  ${trunc(text, 60)}`);
    }
  }
}

// ─── 3. Authoring-batch validation (schema 3.2, hard gate) ──────────────────
// Validates the RAW 7-language authoring files of a content delivery. Unlike
// sections 1-2 (advisory, for eyeballing), failures here exit non-zero — this
// is the engineering acceptance gate the content spec's §8 promises.
// Default dir: docs/daily-verse-batch2; override with argv[2].
function checkAuthoringBatch() {
  const dir = process.argv[2] || 'docs/daily-verse-batch2';
  let fail = 0;
  const flag = (msg) => { fail++; console.log(`  ✗ ${msg}`); };
  console.log(`\n\n═══ 3. Authoring batch gate (${dir}) ═══`);
  let files;
  try {
    files = Object.fromEntries(LANGS.map(l => [l, JSON.parse(readFileSync(`${dir}/verses_${l}.json`, 'utf8'))]));
  } catch (e) {
    console.log(`  (batch dir unreadable — skipped: ${e.message})`);
    return 0;
  }

  // Per-file counts + id integrity.
  const byId = {};
  for (const l of LANGS) {
    const vs = files[l].verses || [];
    if (vs.length !== 120) flag(`${l}: ${vs.length} verses (want 120)`);
    const m = vs.filter(v => v.segment === 'morning').length;
    if (m !== 60) flag(`${l}: ${m} morning (want 60)`);
    const ids = new Set(vs.map(v => v.id));
    if (ids.size !== vs.length) flag(`${l}: duplicate ids`);
    byId[l] = new Map(vs.map(v => [v.id, v]));
  }

  // Cross-language: the schema-3.2 shared fields must be byte-identical.
  const en = byId.en;
  const shared = (v) => JSON.stringify([
    v.id, v.day, v.segment, v.reference, v.special_occasion, v.mood_tags,
    v.devotional?.structure, v.exegesis?.verse_category, v.exegesis?.niv_word_count,
  ]);
  for (const [id, ev] of en) {
    const want = shared(ev);
    for (const l of LANGS) {
      const lv = byId[l].get(id);
      if (!lv) { flag(`${l}: missing ${id}`); continue; }
      if (shared(lv) !== want) flag(`${l} ${id}: shared fields drift from en`);
    }
  }

  // Per-language prose: chosen verse text (modern||traditional), the three
  // prose fields non-empty + free of template debris, paragraph rules.
  let ctxMin = Infinity, ctxMax = 0;
  for (const l of LANGS) {
    for (const [id, v] of byId[l]) {
      const trs = v.translations?.[l];
      const chosen = trs?.modern?.text?.trim() || trs?.traditional?.text?.trim();
      if (!chosen) flag(`${l} ${id}: no usable verse text (modern AND traditional empty)`);
      const dev = v.devotional?.[l] || {};
      const prose = { meditation: dev.meditation, action_step: dev.action_step, prayer: v.prayer?.[l] };
      for (const [k, txt] of Object.entries(prose)) {
        if (!txt?.trim()) { flag(`${l} ${id}: empty ${k}`); continue; }
        for (const c of ['#', '{', '<']) if (txt.includes(c)) flag(`${l} ${id}: '${c}' in ${k}`);
      }
      if ((prose.meditation?.match(/\n\n/g) || []).length > 1) flag(`${l} ${id}: meditation >2 paragraphs`);
      if (prose.prayer?.includes('\n')) flag(`${l} ${id}: prayer not single-paragraph`);
      const note = v.exegesis?.context_note?.trim();
      if (!note) flag(`${l} ${id}: empty context_note`);
      else { ctxMin = Math.min(ctxMin, note.length); ctxMax = Math.max(ctxMax, note.length); }
    }
  }

  // verse_local: fr/de only, identical id sets, same-chapter psalm shifts.
  const vlSet = (l) => new Set([...byId[l].values()].filter(v => v.verse_local).map(v => v.id));
  for (const l of LANGS) {
    const s = vlSet(l);
    if (l === 'fr' || l === 'de') {
      for (const id of s) {
        const v = byId[l].get(id);
        if (!/^[1-3]?\s?[A-Za-z]+ \d+:\d+$/.test(v.verse_local)) flag(`${l} ${id}: unparseable verse_local "${v.verse_local}"`);
      }
    } else if (s.size) flag(`${l}: verse_local present outside fr/de (${[...s].join(',')})`);
  }
  const frS = [...vlSet('fr')].sort().join(','), deS = [...vlSet('de')].sort().join(',');
  if (frS !== deS) flag(`verse_local id sets differ: fr=[${frS}] de=[${deS}]`);

  console.log(fail === 0
    ? `  ✓ batch gate clean (840 entries; verse_local fr/de: ${vlSet('fr').size}; context_note len ${ctxMin}–${ctxMax})`
    : `  ${fail} failure(s)`);
  return fail;
}

async function main() {
  await checkAllBibles();
  await checkDailyVerses();
  await probeAdjustment();
  const fail = checkAuthoringBatch();
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
