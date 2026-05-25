// Remove the "起承转合" structural authoring markers (Rise: / Continue: / Turn:
// / Conclude:) and their per-language equivalents from the upstream verse
// JSONs. These were notes for the writer that accidentally shipped in the
// reader-facing meditation text.
//
// Strips markers from `devotional.<lang>.meditation` and `.action_step` for
// every verse in every file. Idempotent — safe to re-run.
//
// Run with:  node scripts/strip_structure_markers.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '/Users/liwencao/Desktop/120 verse 7 languages';
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'es', 'pt', 'de', 'fr'];

// Per-language list of marker words to strip. Each is matched as
// "<Word>:" (with optional whitespace before the colon, half-width or
// full-width). Removed along with one trailing space if present.
const MARKERS = {
  en:        ['Rise', 'Continue', 'Turn', 'Conclose', 'Conclude', 'Conclusion'],
  es:        ['Comienzo', 'Continuación', 'Giro', 'Conclusión'],
  pt:        ['Início', 'Continuação', 'Virada', 'Conclusão'],
  de:        ['Anfang', 'Fortführung', 'Wendung', 'Abschluss', 'Schluss'],
  fr:        ['Début', 'Continuation', 'Tournant', 'Conclusion'],
  // Chinese — current files don't have these but include for safety in case
  // a future revision adds CJK markers (起：/承：/轉：/合： etc.).
  'zh-Hans': ['起', '承', '转', '合'],
  // zh-Hant source data is partially auto-converted from zh-Hans, so the
  // simplified "转" still leaks through alongside the traditional "轉".
  'zh-Hant': ['起', '承', '轉', '转', '合'],
};

// Build a regex that matches "<Marker>:" or "<Marker> :" (half- or full-width
// colon), optionally followed by one space. Leaves the marker's preceding
// whitespace alone — important for keeping paragraph breaks.
function buildPattern(words, isCjk) {
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const wordGroup = escaped.join('|');
  // CJK markers: just <word>[: or ：], no word boundary needed.
  // Latin markers: require a word boundary on the left so "Continued" isn't matched.
  const left = isCjk ? '' : '\\b';
  return new RegExp(`${left}(?:${wordGroup})\\s*[:：]\\s?`, 'g');
}

function clean(text, pattern) {
  if (typeof text !== 'string') return text;
  let next = text.replace(pattern, '');
  // Collapse "  " left behind in mid-sentence cases (". " stays ". ", but
  // odd "  " from removal becomes " "). Don't touch newlines.
  next = next.replace(/[ \t]{2,}/g, ' ');
  // Trim trailing whitespace per paragraph.
  next = next.replace(/[ \t]+(\n|$)/g, '$1');
  return next;
}

let totalFilesChanged = 0;
let totalReplacements = 0;
const perLang = {};

for (const lang of LANGS) {
  const path = join(SRC, `verses_${lang}.json`);
  const before = readFileSync(path, 'utf8');
  const data = JSON.parse(before);
  const isCjk = lang.startsWith('zh');
  const pattern = buildPattern(MARKERS[lang], isCjk);

  let count = 0;
  for (const v of data.verses) {
    // Markers can appear in any language's devotional — but we only need to
    // touch the same-language entry, since that's the one the app renders.
    const dev = v.devotional?.[lang];
    if (!dev) continue;
    if (typeof dev.meditation === 'string') {
      const before = dev.meditation;
      const after = clean(before, pattern);
      if (after !== before) {
        count += (before.match(pattern) || []).length;
        dev.meditation = after;
      }
    }
    if (typeof dev.action_step === 'string') {
      const before = dev.action_step;
      const after = clean(before, pattern);
      if (after !== before) {
        count += (before.match(pattern) || []).length;
        dev.action_step = after;
      }
    }
  }

  perLang[lang] = count;
  totalReplacements += count;

  const after = JSON.stringify(data, null, 2) + '\n';
  if (after !== before) {
    writeFileSync(path, after);
    totalFilesChanged++;
  }
}

console.log('Marker cleanup summary:');
for (const lang of LANGS) {
  console.log(`  ${lang.padEnd(8)} ${String(perLang[lang]).padStart(4)} marker(s) removed`);
}
console.log(`\nFiles modified: ${totalFilesChanged}`);
console.log(`Total markers removed: ${totalReplacements}`);
console.log(`\nBackups in ${SRC}/.backup-pre-marker-cleanup/`);
