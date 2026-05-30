// Build the daily-verse audio manifest from the local TTS audio folder.
//
// Filenames look like:
//   e_002_evening_promises-and-comfort_02_reflection.mp3
//   m_001_morning_john-1-9_01_scripture.mp3
//   <verseId>_<segment>_<slug>_<NN>_<stepname>.mp3
//
// The middle <slug> is unpredictable (sometimes a category, sometimes a
// verse-ref), so the app can't construct filenames itself — it reads this
// manifest instead, which maps each verseId to its four exact filenames.
//
// Usage:
//   node scripts/gen_dailyverse_audio_manifest.mjs <local-audio-dir> [out.json]
// e.g.
//   node scripts/gen_dailyverse_audio_manifest.mjs ~/Desktop/dailyverse_4steps_audio
//
// Writes _cdn_ready/dailyverse_audio_manifest.json by default. Upload that
// file to the SAME R2 path as the audio:
//   herbible-audio-7languages/dailyverse_4steps_audio/manifest.json

import fs from 'node:fs';
import path from 'node:path';

const STEP_KEYS = ['scripture', 'reflection', 'simple-step', 'prayer']; // page 0..3

const srcDir = process.argv[2];
const outPath = process.argv[3]
  || path.join(process.cwd(), '_cdn_ready', 'dailyverse_audio_manifest.json');
if (!srcDir) {
  console.error('Usage: node scripts/gen_dailyverse_audio_manifest.mjs <local-audio-dir> [out.json]');
  process.exit(1);
}

// Parse "<verseId>_<segment>_<slug>_<NN>_<stepname>.mp3" → { verseId, step }.
// verseId = first two underscore segments (e_002 / m_001); step = last segment
// (scripture / reflection / simple-step / prayer). The slug in the middle is
// ignored — we just record the full filename per (verseId, step).
function parse(name) {
  if (!/\.mp3$/i.test(name)) return null;
  const parts = name.split('_');
  if (parts.length < 5) return null;
  const verseId = `${parts[0]}_${parts[1]}`;
  if (!/^[me]_\d{3}$/.test(verseId)) return null;
  const step = parts[parts.length - 1].replace(/\.mp3$/i, '');
  if (!STEP_KEYS.includes(step)) return null;
  return { verseId, step };
}

const files = fs.readdirSync(srcDir).filter((f) => /\.mp3$/i.test(f));
const manifest = {};
let parsed = 0, skipped = 0;
for (const name of files) {
  const p = parse(name);
  if (!p) { skipped++; continue; }
  (manifest[p.verseId] ||= {})[p.step] = name;
  parsed++;
}

// Coverage report: which verseIds are missing any of the 4 steps.
const ids = Object.keys(manifest).sort();
const incomplete = ids.filter((id) => STEP_KEYS.some((k) => !manifest[id][k]));
const complete = ids.length - incomplete.length;

const out = {
  version: 1,
  base_url: 'https://audio.everlandapps.com/dailyverse_4steps_audio',
  step_order: STEP_KEYS,
  verses: manifest,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

console.log(`Parsed ${parsed} files, skipped ${skipped} non-matching.`);
console.log(`Verses: ${ids.length} total, ${complete} complete (all 4 steps), ${incomplete.length} incomplete.`);
if (incomplete.length) {
  console.log('Incomplete verseIds (missing a step):');
  for (const id of incomplete) {
    const have = STEP_KEYS.filter((k) => manifest[id][k]);
    console.log(`  ${id}: has [${have.join(', ')}]`);
  }
}
console.log(`\nWrote ${outPath}`);
console.log('Next: upload it to herbible-audio-7languages/dailyverse_4steps_audio/manifest.json');
