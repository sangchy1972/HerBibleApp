#!/usr/bin/env node
// Re-run upstream verses_zh-Hant.json through a strict Simplified→Traditional
// conversion (OpenCC s2t.json variant) to clean the partial-conversion bug
// where words like "计划" / "说" / "会" / "进" stayed simplified.
//
// Usage:  node scripts/fix_zh_hant.mjs
// After this:  node scripts/gen_bundled_verses.mjs   (regenerates the bundle)
//              node scripts/verify_alignment.mjs     (re-verifies)

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { Converter } from 'opencc-js';

const SRC = '/Users/liwencao/Desktop/120 verse 7 languages';
const FILE = `${SRC}/verses_zh-Hant.json`;
const BACKUP = `${FILE}.before-s2t.bak`;

// s→t: Simplified Mandarin → Traditional Mandarin (Taiwan-neutral). Doesn't
// touch other languages (Korean/Japanese fragments would pass through).
const convert = Converter({ from: 'cn', to: 'tw' });

const before = readFileSync(FILE, 'utf8');
copyFileSync(FILE, BACKUP);
const after = convert(before);
writeFileSync(FILE, after);

// Quick before/after audit — count a few high-signal simplified-only chars.
const probes = ['计划', '说', '来', '会', '进', '这', '将', '远', '点', '门', '体'];
const trad   = ['計劃', '說', '來', '會', '進', '這', '將', '遠', '點', '門', '體'];
console.log('Simplified→Traditional conversion done.');
console.log(`Backup saved to ${BACKUP}`);
console.log('\nBefore vs After (occurrence counts):');
console.log('  char    before   after');
for (let i = 0; i < probes.length; i++) {
  const b = (before.match(new RegExp(probes[i], 'g')) || []).length;
  const a = (after .match(new RegExp(probes[i], 'g')) || []).length;
  const bT = (before.match(new RegExp(trad[i],  'g')) || []).length;
  const aT = (after .match(new RegExp(trad[i],  'g')) || []).length;
  console.log(`  ${probes[i].padEnd(4)} (S)  ${String(b).padStart(5)} → ${String(a).padStart(5)}    ${trad[i]} (T)  ${String(bT).padStart(5)} → ${String(aT).padStart(5)}`);
}

console.log('\nNext steps:');
console.log('  1. node scripts/gen_bundled_verses.mjs   # regenerate dailyVersesBundled.ts');
console.log('  2. node scripts/verify_alignment.mjs     # confirm zh-Hant integrity passes');
