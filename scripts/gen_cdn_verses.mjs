// Produce slim, CDN-ready daily-verse files from the full authoring files.
//
// The authoring files (~546 KB each) carry a lot the client never reads:
// English dev-reference fields in every language file, the full exegesis
// block, copyright_check counters, mood_tags, special_occasion, etc. The
// client's dailyVersesService only reads:
//   day, segment, reference, translations[lang].modern, devotional[lang],
//   prayer[lang]
// so we strip everything else. Output keeps the EXACT UpstreamVerse shape
// the service's parseUpstream() expects (translations[lang].modern,
// devotional[lang].{meditation, action_step}, prayer[lang]) — only the
// dead bytes are removed. Result is ~5x smaller, which matters because
// the whole file is pulled on first launch per language.
//
// Usage:
//   node scripts/gen_cdn_verses.mjs <input-dir> <output-dir>
// e.g.
//   node scripts/gen_cdn_verses.mjs ./_incoming_verses ./_cdn_ready

import fs from 'node:fs';
import path from 'node:path';

const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'];

const inputDir = process.argv[2];
const outputDir = process.argv[3];
if (!inputDir || !outputDir) {
  console.error('Usage: node scripts/gen_cdn_verses.mjs <input-dir> <output-dir>');
  process.exit(1);
}
fs.mkdirSync(outputDir, { recursive: true });

for (const lang of LANGS) {
  const raw = JSON.parse(fs.readFileSync(path.join(inputDir, `verses_${lang}.json`), 'utf8'));
  const slimVerses = [];
  for (const v of raw.verses || []) {
    const tr = v.translations?.[lang];
    const dev = v.devotional?.[lang];
    const prayer = v.prayer?.[lang];
    // Skip defensively — but with the validated files this never trips.
    if (!tr?.modern || !dev || prayer == null) continue;
    slimVerses.push({
      id: v.id,
      day: v.day,
      segment: v.segment,
      reference: {
        book: v.reference.book,
        chapter: v.reference.chapter,
        verse: v.reference.verse,
        full_reference: v.reference.full_reference,
      },
      // fr/de psalm-title numbering shift (schema 3.2, 5 entries per lang).
      ...(v.verse_local ? { verse_local: v.verse_local } : {}),
      // Per-language background note (schema 3.2) — the ⓘ icon on the verse page.
      ...(v.exegesis?.context_note ? { exegesis: { context_note: v.exegesis.context_note } } : {}),
      // Keep BOTH traditional + modern so the client can later offer a
      // version toggle without another CDN shape change; the service
      // currently reads only `.modern`.
      translations: {
        [lang]: {
          ...(tr.traditional ? { traditional: tr.traditional } : {}),
          modern: tr.modern,
        },
      },
      devotional: {
        [lang]: {
          meditation: dev.meditation,
          action_step: dev.action_step,
        },
      },
      prayer: { [lang]: prayer },
    });
  }
  // Stable order: day asc, morning before evening.
  slimVerses.sort((a, b) => a.day - b.day || (a.segment === 'morning' ? -1 : 1));

  const out = {
    meta: {
      language: lang,
      version: (raw.meta?.version ?? 2),
      total_verses: slimVerses.length,
      coverage_days: raw.meta?.coverage_days ?? 60,
      note: 'CDN-slim — dev-reference / exegesis / copyright fields stripped; only client-rendered fields retained.',
    },
    verses: slimVerses,
  };

  const outFile = path.join(outputDir, `verses_${lang}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out), 'utf8');
  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(`${lang}: ${slimVerses.length} verses → ${outFile} (${kb} KB)`);
}

console.log('\nDone. Upload with scripts/upload_daily_verses_r2.sh (v-prefixed keys —');
console.log('live builds refetch this bucket on every cold start, so a breaking batch');
console.log('must NEVER overwrite the keys an already-shipped build reads).');
