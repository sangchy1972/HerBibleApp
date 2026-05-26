import { SOURCE_CATALOG } from '../src/i18n/sourceCatalog.ts';
import { STRINGS } from '../src/i18n/strings.ts';

const LANGS = ['zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'];
const allKeys = Object.keys(SOURCE_CATALOG);
console.log(`Source catalog: ${allKeys.length} keys`);

for (const lang of LANGS) {
  const translated = STRINGS[lang] || {};
  const missing = allKeys.filter(k => translated[k] == null);
  const fallthrough = allKeys.filter(k => translated[k] != null && translated[k] === SOURCE_CATALOG[k].en);
  console.log(`${lang}: present=${allKeys.length - missing.length}/${allKeys.length}, missing=${missing.length}, en-fallthrough=${fallthrough.length}`);
}

const missingKeys = allKeys.filter(k => STRINGS['zh-Hans']?.[k] == null);
const ns = {};
for (const k of missingKeys) {
  const top = k.split('.')[0];
  (ns[top] ||= []).push(k);
}
console.log(`\n--- Missing keys by namespace (${missingKeys.length} total) ---`);
for (const [n, list] of Object.entries(ns).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${n} (${list.length}):`);
  for (const k of list) console.log(`  ${k}  ::  ${JSON.stringify(SOURCE_CATALOG[k].en)}`);
}

// Also list English-fallthrough keys (in table but value equals English)
console.log(`\n--- English fallthrough keys (need real translation) ---`);
for (const lang of LANGS) {
  const fall = allKeys.filter(k => STRINGS[lang]?.[k] != null && STRINGS[lang][k] === SOURCE_CATALOG[k].en);
  if (fall.length === 0) continue;
  console.log(`\n${lang} (${fall.length}):`);
  for (const k of fall) console.log(`  ${k}  ::  ${JSON.stringify(SOURCE_CATALOG[k].en)}`);
}
