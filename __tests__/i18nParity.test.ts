// Every UI string exists in every language, and says the same shape of thing.
//
// WHY THIS FILE EXISTS. It didn't, and that was the hole: `useT` falls back to
// the English source catalog when a key is missing (i18n/lookup.ts), so a
// forgotten locale renders perfectly readable English inside an otherwise
// Spanish screen and nothing anywhere goes red. `npm test` is jest only, and
// scripts/i18n_audit.mjs is not in it and only console.logs — it cannot fail a
// build. So until now the only thing standing between a half-translated release
// and the store was somebody remembering to paste six blocks.
//
// The placeholder check is the second half. A translation that drops `{n}`
// renders "more to open the mystery box" with the number gone; one that invents
// `{count}` renders the literal braces to the user. Both have shipped in this
// repo's history.

import { SOURCE_CATALOG } from '../src/i18n/sourceCatalog';
import { STRINGS } from '../src/i18n/strings';

const LOCALES = Object.keys(STRINGS) as (keyof typeof STRINGS)[];
const KEYS = Object.keys(SOURCE_CATALOG);

/** `{n}`, `{total}`, … in the order they are declared, de-duped and sorted. */
const placeholders = (s: string): string[] =>
  [...new Set(s.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) ?? [])].sort();

describe('i18n parity', () => {
  it('has six translated locales plus the English source', () => {
    expect(LOCALES.sort()).toEqual(['de', 'es', 'fr', 'pt', 'zh-Hans', 'zh-Hant']);
  });

  it('the catalog is not empty (a broken import would make every check vacuous)', () => {
    expect(KEYS.length).toBeGreaterThan(500);
  });

  describe.each(LOCALES)('%s', locale => {
    const map = STRINGS[locale];

    it('translates every key in the source catalog', () => {
      const missing = KEYS.filter(k => typeof map[k] !== 'string' || map[k].trim() === '');
      expect(missing).toEqual([]);
    });

    it('has no keys the source catalog does not define', () => {
      const orphans = Object.keys(map).filter(k => !(k in SOURCE_CATALOG));
      expect(orphans).toEqual([]);
    });

    it('preserves every placeholder, and invents none', () => {
      const wrong = KEYS
        .filter(k => typeof map[k] === 'string')
        .map(k => ({ k, want: placeholders(SOURCE_CATALOG[k]!.en), got: placeholders(map[k]!) }))
        .filter(r => r.want.join(',') !== r.got.join(','))
        .map(r => `${r.k}: expected ${r.want.join(' ') || '(none)'}, got ${r.got.join(' ') || '(none)'}`);
      expect(wrong).toEqual([]);
    });
  });

  // Not parity, but the same class of silent failure: a key whose English is
  // blank renders as nothing at all on every screen in every language.
  it('every English source string is non-empty', () => {
    const blank = KEYS.filter(k => !SOURCE_CATALOG[k]!.en.trim());
    expect(blank).toEqual([]);
  });
});
