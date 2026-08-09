import type { PlanSummary } from '../constants/featuredPlansSummary';
import { PLAN_SECTION_LABELS, SUBTAB_OVERRIDE, SUBTAB_ORDER, type PlanSectionId } from '../constants/plansApi';
import { TOPIC_TAGS } from './planRecommendations';
import { lookupString } from '../i18n/lookup';
import type { UILanguageCode } from '../state/UILanguageContext';

// Plan search for the Explore tab. Pure module — no React/RN imports, fully
// unit-tested (same contract as planRecommendations.ts, which this sits beside).
//
// The whole catalog is BUNDLED and synchronous (featuredPlansSummary.ts: 113
// plans × 7 languages), so search is genuinely offline, costs nothing, and can
// never be empty. Nothing here talks to the network.
//
// FIVE weighted fields per plan. The three beyond title+description are what
// make this worth building — measured on the real catalog, English "anxiety"
// finds 6 plans by title and description alone, and 9 once the taxonomy is
// indexed, where the 3 extra are anxiety plans whose titles never say the word.
// The mood row on Explore only covers 9 emotions (31 plans); the other 82 have
// no keyword entry point at all without this.
//
//   title    6  localized
//   topic    4  localized section + sub-tab label, from the app's OWN taxonomy
//   chip     3  localized onboarding-topic labels this plan answers to
//   desc     2  localized subtitle + goal (identical on 39 of 113 plans)
//   slug     1  English, so a slug word works from any UI language
//
// Deliberately NOT indexed: `primaryLabel` / `secondaryLabel` (drifted CDN
// strings — 17 distinct primary labels for 5 sections), `id` ("EG07" is
// editorial), `duration` / `minutes` (107 of 113 plans are 3–7 days and
// `minutes` is only ever 7 or 8, so a length filter would return either almost
// everything or the 6 outliers).

/**
 * The suggestion chips, and the vocabulary the `chip` field indexes.
 *
 * These are onboarding's own 12 topics (`onboarding.topics.opt.*`), already
 * translated into all 7 languages. Every one of them is asserted to return at
 * least one plan in every language — see __tests__/planSearch.test.ts, which
 * imports THIS list so a chip can never be added without that guarantee.
 */
export const SEARCH_TOPICS = [
  'anxiety', 'hope', 'gratitude', 'family', 'marriage', 'belonging',
  'strength', 'healing', 'identity', 'purpose', 'faith', 'sleep',
] as const;

export type PlanSearchField = 'title' | 'topic' | 'chip' | 'desc' | 'slug';

const WEIGHTS: Record<PlanSearchField, number> = {
  title: 6,
  topic: 4,
  chip: 3,
  desc: 2,
  slug: 1,
};

export interface PlanSearchHit {
  plan: PlanSummary;
  score: number;
  /** Which fields matched — the view uses this to explain a non-obvious hit. */
  matchedFields: PlanSearchField[];
}

export interface PlanSearchIndexEntry {
  plan: PlanSummary;
  /** Position in the incoming list — the stable tiebreak for equal scores. */
  order: number;
  haystacks: Record<PlanSearchField, string>;
}

/**
 * Case- and accent-insensitive folding, applied identically to the query and to
 * every indexed field.
 *
 * The NFD + combining-marks strip is already this repo's idiom (see
 * constants/bibleAudioCdn.ts, which folds 'Éxodo' → 'Exodo'). It is the single
 * highest-value line here: 56 es / 66 pt / 69 fr / 33 de plan titles carry
 * diacritics, and she types "oracion" for "oración" — measured, both spellings
 * now return the identical 12 Spanish plans.
 *
 * No `toLocaleLowerCase` (Turkish dotless-i is not a concern in these 7
 * locales) and no whitespace collapsing beyond trim (no plan string has
 * double spaces).
 */
export function foldText(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const CJK_RE = /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;

/**
 * Shortest query we will run.
 *
 * ONE character for CJK/Kana/Hangul, two otherwise. Chinese plan titles average
 * 10 characters with no spaces, so a single character is a real query there —
 * zh-Hans 「焦」 alone matches 6 plans. The Bible reader's blanket
 * `q.length < 2` guard (services/bibleService.ts) is exactly the bug not to
 * repeat: it silently breaks every single-character Chinese search.
 */
export function minQueryLen(folded: string): number {
  return CJK_RE.test(folded) ? 1 : 2;
}

/**
 * Is this query long enough to run at all?
 *
 * Both the view and the analytics ask, and they must never disagree: a single
 * Latin letter has to keep showing the suggestion chips (not flash an empty
 * "no plans for a"), and it must not be logged as a failed search.
 */
export function isSearchable(rawQuery: string): boolean {
  const q = foldText(rawQuery);
  return q.length >= minQueryLen(q);
}

/** Reverse of TOPIC_TAGS: real tag → the onboarding topics that claim it. */
const TAG_TO_TOPICS: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [topic, tags] of Object.entries(TOPIC_TAGS)) {
    for (const tag of tags) {
      (map[tag] ||= []).push(topic);
    }
  }
  return map;
})();

/** The app's own localized taxonomy for a plan: section label + sub-tab label. */
export function topicLabelsFor(plan: PlanSummary, lang: UILanguageCode): string {
  const out: string[] = [];
  const sectionKey = PLAN_SECTION_LABELS[plan.primary as PlanSectionId];
  if (sectionKey) out.push(lookupString(sectionKey, lang));
  // The override IS the taxonomy (the front end replaces whatever `secondary`
  // the CDN happens to carry). Falling back to a SUBTAB_ORDER entry matching the
  // raw `secondary` covers the one plan missing from the override table —
  // through-the-valley-of-loneliness — so every plan carries a sub-topic label.
  const sub = SUBTAB_OVERRIDE[plan.primary]?.[plan.slug]
    ?? SUBTAB_ORDER[plan.primary]?.find(s => s.id === plan.secondary);
  if (sub) out.push(lookupString(sub.label, lang));
  return out.join(' ');
}

/**
 * The localized onboarding-topic labels a plan answers to.
 *
 * This is what makes the suggestion chips honest and lets a word the catalog
 * never literally uses still find plans: nothing in the catalog says "sleep",
 * but TOPIC_TAGS.sleep points at anxiety-fear / weariness-burnout / soul-care,
 * so those plans now carry the localized "sleep" label in their index. Matched
 * against BOTH the raw `secondary` and the overridden sub-tab id, because
 * TOPIC_TAGS mixes the two vocabularies.
 */
export function chipLabelsFor(plan: PlanSummary, lang: UILanguageCode): string {
  const ids = new Set<string>();
  if (plan.secondary) ids.add(plan.secondary);
  const overrideId = SUBTAB_OVERRIDE[plan.primary]?.[plan.slug]?.id;
  if (overrideId) ids.add(overrideId);
  const topics = new Set<string>();
  for (const id of ids) {
    for (const topic of TAG_TO_TOPICS[id] ?? []) topics.add(topic);
  }
  return [...topics].map(k => lookupString(`onboarding.topics.opt.${k}`, lang)).join(' ');
}

/**
 * Fold the catalog once per (catalog, language) so keystrokes only run
 * `includes`. Cheap either way at 113 plans — this keeps the typing path free of
 * 565 `normalize()` calls per character.
 */
export function buildPlanSearchIndex(
  summaries: readonly PlanSummary[],
  lang: UILanguageCode,
): PlanSearchIndexEntry[] {
  return summaries.map((plan, order) => {
    // subtitle and goal are identical on 39 of 113 plans; one haystack either way.
    const desc = plan.subtitle === plan.goal ? plan.subtitle : `${plan.subtitle ?? ''} ${plan.goal ?? ''}`;
    return {
      plan,
      order,
      haystacks: {
        title: foldText(plan.title),
        topic: foldText(topicLabelsFor(plan, lang)),
        chip: foldText(chipLabelsFor(plan, lang)),
        desc: foldText(desc),
        slug: foldText(plan.slug?.replace(/-/g, ' ')),
      },
    };
  });
}

const FIELDS: PlanSearchField[] = ['title', 'topic', 'chip', 'desc', 'slug'];

// Folded haystacks are lowercase with combining marks stripped, so "a letter"
// is a-z plus the handful of Latin letters NFD can't decompose (ß, ø, đ …).
const WORD_CHAR = /[a-z0-9ß-ɏ]/;

/**
 * Short Latin queries must land at a WORD START; everything else matches
 * anywhere.
 *
 * German "Ehe" (marriage) is the case that forces this: as a raw substring it
 * matched 37 of 113 plans, because "ehe" hides inside geschehen, verstehen,
 * Beziehungen… Our own suggestion chip was promising a topic and delivering
 * spelling accidents. At 4+ characters the noise disappears and mid-word
 * matching becomes an asset instead — it is how "Angst" finds the German
 * compound "Zukunftsangst" — so the rule is deliberately scoped to ≤ 3.
 *
 * CJK never takes this path: 「焦」 legitimately sits mid-title and there are no
 * word boundaries to anchor to.
 */
function fieldMatches(hay: string, q: string, wordStart: boolean): boolean {
  if (!wordStart) return hay.includes(q);
  for (let from = 0; ; from += 1) {
    const i = hay.indexOf(q, from);
    if (i < 0) return false;
    if (i === 0 || !WORD_CHAR.test(hay[i - 1])) return true;
    from = i;
  }
}

/**
 * Substring match — not prefix, not fuzzy.
 *
 * Prefix would break both scripts at once: 「焦」 sits mid-title in Chinese, and
 * English wants "anxiety" to hit "A Path of Peace in Anxiety". Fuzzy is
 * deliberately deferred — at 113 plans a Damerau-Levenshtein pass is affordable
 * but injects false positives, and the measurements say the real failure mode is
 * VOCABULARY (a word the catalog never uses), which the chip field above fixes
 * properly. The zero-result analytics event will say whether typos matter.
 *
 * Ordering: score desc, then original curation order. Never mutates `index`.
 */
export function searchPlanIndex(index: readonly PlanSearchIndexEntry[], rawQuery: string): PlanSearchHit[] {
  const q = foldText(rawQuery);
  if (!isSearchable(q)) return [];
  const wordStart = q.length <= 3 && !CJK_RE.test(q);
  const scored: { hit: PlanSearchHit; order: number }[] = [];
  for (const entry of index) {
    let score = 0;
    const matchedFields: PlanSearchField[] = [];
    for (const field of FIELDS) {
      if (fieldMatches(entry.haystacks[field], q, wordStart)) {
        score += WEIGHTS[field];
        matchedFields.push(field);
      }
    }
    if (score > 0) scored.push({ hit: { plan: entry.plan, score, matchedFields }, order: entry.order });
  }
  return scored
    .sort((a, b) => (b.hit.score - a.hit.score) || (a.order - b.order))
    .map(x => x.hit);
}

/** Convenience: build + search in one call. */
export function searchPlans({ query, summaries, lang }: {
  query: string;
  summaries: readonly PlanSummary[];
  lang: UILanguageCode;
}): PlanSearchHit[] {
  return searchPlanIndex(buildPlanSearchIndex(summaries, lang), query);
}
