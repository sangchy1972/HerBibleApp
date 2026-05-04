#!/usr/bin/env node
// Walk every Psalm (1-150) on KJV, Lutherbibel, and Louis Segond, compute the
// actual verse-count delta per chapter, and emit the verified offset sets so
// `src/constants/versification.ts` can use real data instead of guesses.
//
// Usage:  node scripts/derive_psalm_offsets.mjs
// Output: prints two arrays — psalms with +1 offset and psalms with +2 offset.

const COMMIT = '4cd531edd1e5877eb6fd7f9c5eada58513cda9e7';
const CDN = `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${COMMIT}/bibles`;

async function len(code, ch) {
  try {
    const r = await fetch(`${CDN}/${code}/books/psalms/chapters/${ch}.json`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.verses.length;
  } catch { return null; }
}

async function main() {
  console.log('Fetching all 150 psalms × 3 translations… (≈450 requests, parallel)');
  const tasks = [];
  for (let ch = 1; ch <= 150; ch++) {
    tasks.push(Promise.all([len('en', ch), len('de', ch), len('fr', ch)]).then(([en, de, fr]) => ({ ch, en, de, fr })));
  }
  const rows = await Promise.all(tasks);

  const luthOffsets = new Map();   // delta → [chapter, ...]
  const lsgOffsets = new Map();
  const anomalies = [];

  for (const { ch, en, de, fr } of rows) {
    if (en == null) { anomalies.push(`Psalm ${ch}: KJV missing`); continue; }
    if (de != null) {
      const d = de - en;
      if (!luthOffsets.has(d)) luthOffsets.set(d, []);
      luthOffsets.get(d).push(ch);
    }
    if (fr != null) {
      const d = fr - en;
      if (!lsgOffsets.has(d)) lsgOffsets.set(d, []);
      lsgOffsets.get(d).push(ch);
    }
  }

  function summarize(name, map) {
    console.log(`\n${name}:`);
    for (const [delta, chapters] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
      const tag = delta === 0 ? 'aligned with KJV' : `+${delta} verses`;
      console.log(`  delta ${String(delta).padStart(3)} (${tag}):  ${chapters.length} psalms`);
      if (delta !== 0 && chapters.length <= 30) {
        console.log(`    ${chapters.join(', ')}`);
      }
    }
  }

  summarize('Lutherbibel (de) vs KJV', luthOffsets);
  summarize('Louis Segond (fr) vs KJV', lsgOffsets);

  if (anomalies.length) {
    console.log('\nAnomalies:');
    anomalies.forEach(a => console.log(`  ${a}`));
  }

  // Emit code-ready Sets for direct paste into versification.ts.
  console.log('\n— Code to paste into src/constants/versification.ts —');
  for (const [name, map] of [['LUTH', luthOffsets], ['LSG', lsgOffsets]]) {
    for (const [delta, chapters] of map) {
      if (delta === 0) continue;
      console.log(`\n// ${name} +${delta}: ${chapters.length} psalms`);
      console.log(`const ${name}_PLUS_${delta} = new Set<number>([${chapters.join(', ')}]);`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
