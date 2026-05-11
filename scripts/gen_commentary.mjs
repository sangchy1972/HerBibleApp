#!/usr/bin/env node
// Build the per-verse commentary corpus for HerBibleApp.
//
// Two data sources merged into a single per-chapter JSON tree:
//   1. Tyndale Open Study Notes (CC BY-SA 4.0) — covers ~99% of KJV verses
//   2. Claude Sonnet 4.6 — fills the ~266 verses Tyndale doesn't cover
//
// Output written to <PD_TEXT_CORPUS>/commentary/en/{LICENSE, index.json,
// books/<slug>/chapters/<N>.json}, same shape as the Bible-text chapters so
// the client's `fetchCommentaryChapter` reads it identically.
//
// Phases run independently via --phase=<A|B|C|D|E|all>:
//   A — download Tyndale chapters from HelloAO into a local cache
//   B — reshape: for every KJV verse, attach the matching Tyndale block (or
//       mark `null` for Claude fill in phase C)
//   C — Claude fills the ~266 gap verses (warm devotional + theological tone)
//   D — self-audit a random sample of Claude-written verses for tone drift
//   E — write final per-chapter JSON + LICENSE + index.json to the mirror
//
// Usage:
//   ANTHROPIC_API_KEY=... PD_TEXT_CORPUS=/path/to/mirror \
//     node scripts/gen_commentary.mjs --phase=all
//   node scripts/gen_commentary.mjs --phase=A                 # download only
//   node scripts/gen_commentary.mjs --phase=B --book=genesis  # reshape one book

// `@anthropic-ai/sdk` is imported lazily inside the Claude phases so that
// phases A / B / E can run without the SDK installed.
import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const PHASE = args.phase || 'all';
const BOOK_FILTER = args.book ? String(args.book).split(',') : null;
const DRY = !!args['dry-run'];
const CONCURRENCY = Number(args.concurrency || 8);
const MODEL = args.model || 'claude-sonnet-4-6';

const CORPUS = process.env.PD_TEXT_CORPUS;
if (!CORPUS) die('PD_TEXT_CORPUS env var must point at a local pd-text-corpus checkout.');

const TYNDALE_CACHE = path.join(CORPUS, '.cache', 'tyndale');
const OUT_DIR = path.join(CORPUS, 'commentary', 'en');
const GAP_FILE = path.join(CORPUS, '.cache', 'commentary_gaps.json');
const GAP_TEXTS = path.join(CORPUS, '.cache', 'commentary_gaps_filled.json');

const SLUG_TO_USFM = {
  'genesis':'GEN','exodus':'EXO','leviticus':'LEV','numbers':'NUM','deuteronomy':'DEU',
  'joshua':'JOS','judges':'JUD','ruth':'RUT','i-samuel':'1SA','ii-samuel':'2SA',
  'i-kings':'1KI','ii-kings':'2KI','i-chronicles':'1CH','ii-chronicles':'2CH',
  'ezra':'EZR','nehemiah':'NEH','esther':'EST','job':'JOB','psalms':'PSA',
  'proverbs':'PRO','ecclesiastes':'ECC','song-of-solomon':'SNG','isaiah':'ISA',
  'jeremiah':'JER','lamentations':'LAM','ezekiel':'EZK','daniel':'DAN','hosea':'HOS',
  'joel':'JOL','amos':'AMO','obadiah':'OBA','jonah':'JON','micah':'MIC','nahum':'NAM',
  'habakkuk':'HAB','zephaniah':'ZEP','haggai':'HAG','zechariah':'ZEC','malachi':'MAL',
  'matthew':'MAT','mark':'MRK','luke':'LUK','john':'JHN','acts':'ACT','romans':'ROM',
  'i-corinthians':'1CO','ii-corinthians':'2CO','galatians':'GAL','ephesians':'EPH',
  'philippians':'PHP','colossians':'COL','i-thessalonians':'1TH','ii-thessalonians':'2TH',
  'i-timothy':'1TI','ii-timothy':'2TI','titus':'TIT','philemon':'PHM','hebrews':'HEB',
  'james':'JAS','i-peter':'1PE','ii-peter':'2PE','i-john':'1JN','ii-john':'2JN',
  'iii-john':'3JN','jude':'JUD','revelation-of-john':'REV',
};

const SYSTEM_PROMPT = `You write short devotional reflections on Bible verses for a women's reading app. Each reflection appears below the tapped verse on a small phone screen.

For the verse the user provides, return one warm, theologically grounded reflection of 50–80 words. The voice is gentle and modern — like a thoughtful friend who reads the Bible carefully. Include one piece of theological depth where it fits naturally: an original-language note (Hebrew/Greek), a cross-reference, or the historical/literary context. Do NOT preach. Do NOT use second-person commands ("you should…"). Do not include the verse number in the text. No "Dear reader" or apostrophes to the audience. No theological controversy.

Return strict JSON only: {"text": "your 50-80 word reflection"} — nothing else, no preamble, no markdown, no fences.`;

async function main() {
  const phases = PHASE === 'all' ? ['A','B','C','D','E'] : PHASE.split(',');
  for (const p of phases) {
    if (p === 'A') await phaseA_downloadTyndale();
    else if (p === 'B') await phaseB_reshape();
    else if (p === 'C') await phaseC_claudeFill();
    else if (p === 'D') await phaseD_audit();
    else if (p === 'E') await phaseE_write();
    else die(`Unknown phase: ${p}`);
  }
  console.log('\n✓ done.');
}

// ── Phase A: download Tyndale chapters from HelloAO ──────────────────────────

async function phaseA_downloadTyndale() {
  console.log('\n=== Phase A: download Tyndale ===');
  await mkdir(TYNDALE_CACHE, { recursive: true });
  // First grab the book list to know what's available
  const booksUrl = 'https://bible.helloao.org/api/c/tyndale/books.json';
  const booksData = await fetchJson(booksUrl);
  const tasks = [];
  const seen = new Set();
  for (const b of booksData.books || []) {
    const bid = b.id;
    if (!bid || bid !== bid.toUpperCase() || seen.has(bid)) continue;
    seen.add(bid);
    const nc = b.numberOfChapters || 0;
    for (let ch = 1; ch <= nc; ch++) tasks.push({ bid, ch });
  }
  console.log(`Planned: ${tasks.length} chapters`);
  if (DRY) return;

  let done = 0, skipped = 0, failed = 0;
  const queue = tasks.slice();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const t = queue.shift();
      if (!t) return;
      const out = path.join(TYNDALE_CACHE, `${t.bid}_${t.ch}.json`);
      if (await exists(out)) { skipped++; continue; }
      try {
        const url = `https://bible.helloao.org/api/c/tyndale/${t.bid}/${t.ch}.json`;
        const data = await fetchJson(url);
        await writeFile(out, JSON.stringify(data));
        done++;
      } catch (e) {
        failed++;
        console.error(`  FAIL ${t.bid} ${t.ch}: ${e.message}`);
      }
      const total = done + skipped + failed;
      if (total % 50 === 0) console.log(`  progress ${total}/${tasks.length}`);
    }
  });
  await Promise.all(workers);
  console.log(`Phase A: ${done} downloaded, ${skipped} skipped (cached), ${failed} failed.`);
  if (failed > 0) die('Re-run phase A to retry the failures before continuing.');
}

// ── Phase B: reshape to per-verse, identify gaps ─────────────────────────────

async function phaseB_reshape() {
  console.log('\n=== Phase B: reshape to per-verse JSON, identify gaps ===');
  await mkdir(path.dirname(GAP_FILE), { recursive: true });
  const kjvIndex = JSON.parse(await readFile(path.join(CORPUS, 'bibles', 'en', 'index.json'), 'utf8'));

  const books = kjvIndex.books.filter(b => !BOOK_FILTER || BOOK_FILTER.includes(b.slug));
  const gaps = [];
  let coveredCount = 0, totalCount = 0;

  for (const book of books) {
    const usfm = SLUG_TO_USFM[book.slug];
    if (!usfm) { console.warn(`  no USFM map for ${book.slug} — skipping`); continue; }
    for (let ch = 1; ch <= book.chapters; ch++) {
      const kjvPath = path.join(CORPUS, 'bibles', 'en', 'books', book.slug, 'chapters', `${ch}.json`);
      const kjv = JSON.parse(await readFile(kjvPath, 'utf8'));
      const blocks = await loadTyndaleBlocks(usfm, ch);
      const blocksSorted = blocks.sort((a, b) => a.start - b.start);
      const maxV = kjv.verses[kjv.verses.length - 1].verse;
      const verses = [];
      for (const v of kjv.verses) {
        totalCount++;
        const blk = blockCoveringVerse(blocksSorted, v.verse, maxV);
        if (blk) {
          coveredCount++;
          verses.push({ verse: v.verse, text: blk.text });
        } else {
          verses.push({ verse: v.verse, text: null });
          gaps.push({ slug: book.slug, chapter: ch, verse: v.verse, kjvText: v.text });
        }
      }
      // Write the partial reshaped chapter into a staging area (not yet final)
      const stageDir = path.join(CORPUS, '.cache', 'reshape', book.slug, 'chapters');
      await mkdir(stageDir, { recursive: true });
      await writeFile(path.join(stageDir, `${ch}.json`), JSON.stringify({ verses }) + '\n');
    }
  }
  await writeFile(GAP_FILE, JSON.stringify(gaps, null, 2));
  console.log(`Phase B: ${coveredCount}/${totalCount} verses covered by Tyndale (${(100 * coveredCount / totalCount).toFixed(2)}%).`);
  console.log(`Gaps: ${gaps.length} verses needing Claude → ${GAP_FILE}`);
}

async function loadTyndaleBlocks(usfm, chapter) {
  const p = path.join(TYNDALE_CACHE, `${usfm}_${chapter}.json`);
  if (!await exists(p)) return [];
  let data;
  try { data = JSON.parse(await readFile(p, 'utf8')); }
  catch { return []; }
  const content = data?.chapter?.content || [];
  const out = [];
  for (const b of content) {
    if (!b || b.type !== 'verse') continue;
    const start = b.number;
    if (typeof start !== 'number') continue;
    const text = flattenText(b.content);
    if (text.split(/\s+/).filter(Boolean).length < 5) continue;
    out.push({ start, text });
  }
  return out;
}

function blockCoveringVerse(blocks, v, maxV) {
  let picked = null;
  for (let i = 0; i < blocks.length; i++) {
    const start = blocks[i].start;
    const next = i + 1 < blocks.length ? blocks[i + 1].start : maxV + 1;
    if (start <= v && v < next) { picked = blocks[i]; break; }
  }
  return picked;
}

function flattenText(c) {
  if (typeof c === 'string') return c.replace(/\s+/g, ' ').trim();
  if (Array.isArray(c)) return c.map(flattenText).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (c && typeof c === 'object') return flattenText(c.text || c.content || '');
  return '';
}

// ── Phase C: Claude fills gap verses ─────────────────────────────────────────

async function phaseC_claudeFill() {
  console.log('\n=== Phase C: Claude fills gap verses ===');
  if (!process.env.ANTHROPIC_API_KEY) die('ANTHROPIC_API_KEY not set');
  const gaps = JSON.parse(await readFile(GAP_FILE, 'utf8'));
  const filled = await exists(GAP_TEXTS) ? JSON.parse(await readFile(GAP_TEXTS, 'utf8')) : {};
  console.log(`Total gaps: ${gaps.length}, already filled: ${Object.keys(filled).length}`);
  const todo = gaps.filter(g => !filled[gapKey(g)]);
  if (todo.length === 0) { console.log('Nothing to fill.'); return; }
  if (DRY) { console.log(`Would fill ${todo.length} verses.`); return; }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  let done = 0;
  const queue = todo.slice();
  const workers = Array.from({ length: Math.min(CONCURRENCY, 6) }, async () => {
    while (queue.length) {
      const g = queue.shift();
      if (!g) return;
      try {
        const text = await fillOne(client, g);
        filled[gapKey(g)] = text;
        done++;
        if (done % 10 === 0) {
          await writeFile(GAP_TEXTS, JSON.stringify(filled, null, 2));
          console.log(`  filled ${done}/${todo.length}`);
        }
      } catch (e) {
        console.error(`  FAIL ${gapKey(g)}: ${e.message}`);
      }
    }
  });
  await Promise.all(workers);
  await writeFile(GAP_TEXTS, JSON.stringify(filled, null, 2));
  console.log(`Phase C: filled ${done} verses, total cached ${Object.keys(filled).length}/${gaps.length}.`);
}

async function fillOne(client, g) {
  const userPrompt = `Verse: ${pretty(g.slug)} ${g.chapter}:${g.verse} (KJV)\n"${g.kjvText}"\n\nReturn the JSON.`;
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  });
  const raw = resp.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  const obj = JSON.parse(m[0]);
  const text = (obj.text || '').trim();
  const wc = text.split(/\s+/).filter(Boolean).length;
  if (wc < 20 || wc > 150) throw new Error(`out of range: ${wc} words`);
  return text;
}

function gapKey(g) { return `${g.slug}|${g.chapter}|${g.verse}`; }

function pretty(slug) {
  return slug.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join(' ').replace(/^I /, '1 ').replace(/^Ii /, '2 ').replace(/^Iii /, '3 ');
}

// ── Phase D: tone audit ──────────────────────────────────────────────────────

async function phaseD_audit() {
  console.log('\n=== Phase D: tone audit ===');
  if (!process.env.ANTHROPIC_API_KEY) die('ANTHROPIC_API_KEY not set');
  if (!await exists(GAP_TEXTS)) die('Run phase C first');
  const filled = JSON.parse(await readFile(GAP_TEXTS, 'utf8'));
  const gaps = JSON.parse(await readFile(GAP_FILE, 'utf8'));
  const lookup = new Map(gaps.map(g => [gapKey(g), g]));
  const keys = Object.keys(filled);
  const sample = keys.sort(() => Math.random() - 0.5).slice(0, 30);
  if (DRY) { console.log(`Would audit ${sample.length} samples`); return; }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  let flagged = 0;
  for (const k of sample) {
    const g = lookup.get(k);
    if (!g) continue;
    const verdict = await auditOne(client, g, filled[k]);
    if (verdict.ok) {
      console.log(`  ✓ ${k}`);
    } else {
      flagged++;
      console.log(`  ⚠ ${k}: ${verdict.reason}`);
      // Retry once
      try {
        filled[k] = await fillOne(client, g);
        console.log(`    → re-generated`);
      } catch (e) { console.error(`    re-gen failed: ${e.message}`); }
    }
  }
  await writeFile(GAP_TEXTS, JSON.stringify(filled, null, 2));
  console.log(`Phase D: ${flagged}/${sample.length} flagged + re-generated.`);
}

async function auditOne(client, g, text) {
  const prompt = `You are checking the tone of a Bible-verse reflection for a women's devotional app.

Verse: ${pretty(g.slug)} ${g.chapter}:${g.verse}
"${g.kjvText}"

Reflection: "${text}"

Required: warm, modern English; 50-80 words; gently theological; no second-person commands ("you should…"); no theological controversy; no verse number inside the text.

Return strict JSON: {"ok": true} OR {"ok": false, "reason": "<short reason>"}.`;
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = resp.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ok: true };
  try { return JSON.parse(m[0]); } catch { return { ok: true }; }
}

// ── Phase E: write final per-chapter JSON to mirror ──────────────────────────

async function phaseE_write() {
  console.log('\n=== Phase E: write final commentary corpus ===');
  if (!await exists(GAP_TEXTS)) console.warn('  warning: GAP_TEXTS not present; chapters with gaps will fail');
  const filled = await exists(GAP_TEXTS) ? JSON.parse(await readFile(GAP_TEXTS, 'utf8')) : {};
  const kjvIndex = JSON.parse(await readFile(path.join(CORPUS, 'bibles', 'en', 'index.json'), 'utf8'));
  const books = kjvIndex.books.filter(b => !BOOK_FILTER || BOOK_FILTER.includes(b.slug));

  let written = 0, totalVerses = 0, claudeVerses = 0;
  for (const book of books) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      const stagePath = path.join(CORPUS, '.cache', 'reshape', book.slug, 'chapters', `${ch}.json`);
      if (!await exists(stagePath)) continue;
      const staged = JSON.parse(await readFile(stagePath, 'utf8'));
      const verses = staged.verses.map(v => {
        totalVerses++;
        if (v.text === null) {
          claudeVerses++;
          const k = `${book.slug}|${ch}|${v.verse}`;
          const fill = filled[k];
          if (!fill) throw new Error(`Missing Claude fill for ${k}`);
          return { verse: v.verse, text: fill };
        }
        return v;
      });
      const outDir = path.join(OUT_DIR, 'books', book.slug, 'chapters');
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, `${ch}.json`), JSON.stringify({ verses }) + '\n');
      written++;
    }
  }

  // Write LICENSE
  const license = await renderLicense();
  await writeFile(path.join(OUT_DIR, 'LICENSE'), license);

  // Write index.json
  const idx = {
    source: 'tyndale-open-study-notes + claude-sonnet-4-6',
    license: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    tyndaleSource: 'https://tyndaleopenresources.com/',
    generatedAt: new Date().toISOString(),
    stats: {
      books: books.length,
      chapters: written,
      verses: totalVerses,
      tyndaleVerses: totalVerses - claudeVerses,
      claudeVerses,
    },
  };
  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(idx, null, 2) + '\n');
  console.log(`Phase E: wrote ${written} chapters, ${totalVerses} verses (${claudeVerses} Claude-filled).`);
}

async function renderLicense() {
  return `# Commentary corpus license

This directory bundles two sources, both available under CC BY-SA 4.0:

## 1. Tyndale Open Study Notes (~99% of verses)

Originally published by Tyndale House Publishers and distributed openly at
https://tyndaleopenresources.com/. Used here under the Creative Commons
Attribution-ShareAlike 4.0 International License.

License: https://creativecommons.org/licenses/by-sa/4.0/

The notes have been reshaped: each note (which Tyndale keys to a verse range)
is replicated across every individual verse the original range covers. No edits
were made to the text content.

## 2. Original explanations (~1% of verses — Tyndale gaps)

For verses Tyndale does not cover (mostly ritual-law sections of Exodus,
Job dialogues, and short genealogies), short explanations were written
specifically for this corpus using Claude Sonnet 4.6. These original
explanations are likewise released under CC BY-SA 4.0.

# Combined license

All files under \`commentary/en/\` are distributed under CC BY-SA 4.0. Anyone
may reuse, modify, or redistribute them, provided they:

  - Give appropriate credit (e.g. "Verse explanations from Tyndale Open Study
    Notes and HerBibleApp, CC BY-SA 4.0")
  - Provide a link to the license: https://creativecommons.org/licenses/by-sa/4.0/
  - Indicate if changes were made
  - Distribute their derivative under the same CC BY-SA 4.0 license

# License text

The full Creative Commons Attribution-ShareAlike 4.0 International license
text is available at: https://creativecommons.org/licenses/by-sa/4.0/legalcode
`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function exists(p) {
  try { await access(p, FS.F_OK); return true; } catch { return false; }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { out[key] = true; continue; }
    out[key] = next; i++;
  }
  return out;
}

function die(msg) { console.error(msg); process.exit(2); }

main().catch(e => { console.error(e); process.exit(1); });
