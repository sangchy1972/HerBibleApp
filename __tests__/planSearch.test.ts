import {
  searchPlans, buildPlanSearchIndex, searchPlanIndex,
  foldText, minQueryLen, isSearchable, topicLabelsFor, chipLabelsFor, SEARCH_TOPICS,
} from '../src/services/planSearch';
import { FEATURED_PLANS_SUMMARY } from '../src/constants/featuredPlansSummary';
import { lookupString } from '../src/i18n/lookup';
import type { UILanguageCode } from '../src/state/UILanguageContext';

const LANGS: UILanguageCode[] = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'];

const find = (query: string, lang: UILanguageCode = 'en') =>
  searchPlans({ query, summaries: FEATURED_PLANS_SUMMARY[lang], lang });
const slugs = (query: string, lang: UILanguageCode = 'en') => find(query, lang).map(h => h.plan.slug);

describe('foldText / minQueryLen', () => {
  it('folds case and diacritics', () => {
    expect(foldText('  Oración ')).toBe('oracion');
    expect(foldText('ANXIÉTÉ')).toBe('anxiete');
    expect(foldText(null)).toBe('');
  });

  it('CJK queries are usable at ONE character, Latin needs two', () => {
    expect(minQueryLen('焦')).toBe(1);
    expect(minQueryLen('焦虑')).toBe(1);
    expect(minQueryLen('a')).toBe(2);
  });

  it('isSearchable gates the view and the analytics identically', () => {
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('   ')).toBe(false);
    expect(isSearchable('a')).toBe(false);       // mid-word, not a failed search
    expect(isSearchable('ab')).toBe(true);
    expect(isSearchable('焦')).toBe(true);
  });
});

describe('searchPlans — matching', () => {
  it('is diacritic-insensitive in both directions, every accented language', () => {
    const pairs: [UILanguageCode, string, string][] = [
      ['es', 'oración', 'oracion'],
      ['fr', 'anxiété', 'anxiete'],
      ['pt', 'ansiedade', 'Ansiedade'],
      ['de', 'Angst', 'angst'],
    ];
    for (const [lang, a, b] of pairs) {
      expect(slugs(a, lang)).toEqual(slugs(b, lang));
      expect(slugs(a, lang).length).toBeGreaterThan(0);
    }
  });

  it('matches Chinese substrings without tokenizing, down to one character', () => {
    const hans = find('焦虑', 'zh-Hans');
    expect(hans.length).toBeGreaterThan(0);
    expect(hans[0].matchedFields).toContain('title');
    expect(find('焦', 'zh-Hans').length).toBeGreaterThan(0);          // 1 char is a real query in zh
    expect(find('焦慮', 'zh-Hant').length).toBeGreaterThan(0);
  });

  it('finds plans whose TITLE never says the word, via the taxonomy', () => {
    const hits = find('anxiety');
    const viaTopic = hits.find(h => h.plan.slug === 'letting-go-of-control');
    expect(viaTopic).toBeTruthy();
    expect(viaTopic!.matchedFields).toContain('topic');
    expect(foldText(viaTopic!.plan.title)).not.toContain('anxiety');
  });

  it('finds plans for a word the catalog never uses at all ("sleep")', () => {
    // Nothing in the corpus says "sleep"; TOPIC_TAGS.sleep is what carries it.
    const hits = find('sleep');
    expect(hits.length).toBeGreaterThan(0);
    hits.forEach(h => expect(h.matchedFields).toContain('chip'));
  });

  it('a short Latin query matches at word starts only', () => {
    // German "Ehe" (marriage) hides inside geschehen / verstehen / Beziehungen —
    // as a raw substring it hit a third of the catalog.
    const de = find('ehe', 'de');
    expect(de.length).toBeGreaterThan(0);
    expect(de.length).toBeLessThan(20);
    // 4+ characters keeps matching mid-word, which is how German compounds work.
    expect(slugs('angst', 'de').length).toBeGreaterThan(0);
  });

  it('an English slug word works from any UI language', () => {
    for (const lang of LANGS) {
      expect(slugs('proverbs', lang)).toContain('proverbs-31-days');
    }
  });
});

describe('searchPlans — ordering and purity', () => {
  it('title hits outrank taxonomy-only hits', () => {
    const hits = find('anxiety');
    const lastTitle = hits.map(h => h.matchedFields.includes('title')).lastIndexOf(true);
    const firstNonTitle = hits.map(h => h.matchedFields.includes('title')).indexOf(false);
    expect(firstNonTitle).toBeGreaterThan(lastTitle);
  });

  it('scores descend and ties keep curation order', () => {
    const index = buildPlanSearchIndex(FEATURED_PLANS_SUMMARY.en, 'en');
    const hits = searchPlanIndex(index, 'hope');
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i].score).toBeLessThanOrEqual(hits[i - 1].score);
      if (hits[i].score === hits[i - 1].score) {
        const a = index.findIndex(e => e.plan.slug === hits[i - 1].plan.slug);
        const b = index.findIndex(e => e.plan.slug === hits[i].plan.slug);
        expect(b).toBeGreaterThan(a);
      }
    }
  });

  it('is deterministic and never mutates the catalog', () => {
    const before = FEATURED_PLANS_SUMMARY.en.map(p => p.slug);
    expect(find('grace')).toEqual(find('grace'));
    expect(FEATURED_PLANS_SUMMARY.en.map(p => p.slug)).toEqual(before);
  });

  it('returns nothing for empty, whitespace or below-minimum queries', () => {
    expect(find('')).toEqual([]);
    expect(find('   ')).toEqual([]);
    expect(find('a')).toEqual([]);
  });

  it('a query matching almost everything is still ranked, not truncated', () => {
    const hits = find('的', 'zh-Hans');
    expect(hits.length).toBeGreaterThan(50);
    expect(hits[0].score).toBeGreaterThan(hits[hits.length - 1].score);
  });
});

describe('every language is genuinely searchable', () => {
  it.each(LANGS)('%s: a plan is findable by its own localized title', lang => {
    const plan = FEATURED_PLANS_SUMMARY[lang][7];
    expect(slugs(plan.title, lang)).toContain(plan.slug);
  });

  it.each(LANGS)('%s: every suggestion chip returns at least one plan', lang => {
    for (const topic of SEARCH_TOPICS) {
      const label = lookupString(`onboarding.topics.opt.${topic}`, lang);
      expect(find(label, lang).length).toBeGreaterThan(0);
    }
  });

  it.each(LANGS)('%s: every plan carries a section AND a sub-topic label', lang => {
    for (const plan of FEATURED_PLANS_SUMMARY[lang]) {
      // Catches a plan added to the catalog but forgotten in SUBTAB_OVERRIDE —
      // it would silently lose its taxonomy weight.
      expect(topicLabelsFor(plan, lang).trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('at least half the catalog is reachable through a suggestion chip', () => {
    const reached = new Set<string>();
    for (const plan of FEATURED_PLANS_SUMMARY.en) {
      if (chipLabelsFor(plan, 'en')) reached.add(plan.slug);
    }
    expect(reached.size).toBeGreaterThan(FEATURED_PLANS_SUMMARY.en.length / 2);
  });
});
