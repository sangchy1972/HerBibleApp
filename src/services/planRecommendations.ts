import type { PlanSummary } from '../constants/featuredPlansSummary';
import type { OnboardingAnswers } from '../state/OnboardingContext';

// Personalized reading-plan recommendations for the home screen's
// "My Reading Plans" card. Pure module — zero React/RN imports, fully
// unit-tested (__tests__/planRecommendations.test.ts).
//
// Model: transparent additive integer scoring over the REAL catalog tag
// vocabulary (113 plans; `primary` = section, `secondary` = fine tag), from
// the user's onboarding answers. Every undefined answer contributes exactly
// 0, so a skipped onboarding degrades gracefully to the editorial tier.
// Deterministic throughout — ties rotate gently per DAY via an fnv1a hash of
// slug+date (stable within a day, no Math.random). See scorePlan for the
// per-signal weights and the reasons trail (owner-readable explainability).

export interface PlanRecordLike {   // structural subset of PlanCompletionContext's PlanRecord
  completedDays: number[];
  firstStartedAt: number;
  finishedAt?: number;
  lastDayYmd?: string;
}

// ── Signal → affinity constants (from the REAL `secondary` vocabulary) ──────

// Onboarding `topics` → tag sets. The strongest explicit signal: the user
// literally told us what she cares about.
const TOPIC_TAGS: Record<string, string[]> = {
  anxiety:   ['anxiety', 'anxiety-fear', 'fear'],
  hope:      ['grief-disappointment', 'long-wait', 'threshold-seasons'],
  gratitude: ['joy', 'joy-gratitude'],
  family:    ['motherhood', 'as-a-mother', 'mother', 'marriage-wifehood', 'wife', 'newlywed-season', 'adult-daughter', 'transition', 'empty-nest'],
  strength:  ['weariness', 'weariness-burnout', 'character', 'as-a-leader'],
  faith:     ['draw-near', 'gods-presence', 'her-story', 'living-faith', 'identity'],
  sleep:     ['anxiety-fear', 'weariness-burnout', 'soul-care'],
};

// `goal` → section (+2) and tag (+1) affinities. Goals are moods — broader
// than topics, so they carry half the weight.
const GOAL_SECTION: Record<string, string> = {
  closer: 'walking-with-god',
  peace: 'emotions',
  habit: 'walking-with-god',
  understand: 'walking-with-god',
};
const GOAL_TAGS: Record<string, string[]> = {
  closer:     ['draw-near', 'gods-presence'],
  peace:      ['anxiety', 'anxiety-fear', 'fear', 'weariness', 'weariness-burnout', 'soul-care'],
  habit:      ['draw-near'],
  understand: ['her-story', 'living-faith'],
  hope:       ['grief-disappointment', 'long-wait', 'threshold-seasons', 'joy-gratitude'],
};

// Life-stage fit per tag: +2 when the tag speaks to the user's season, −6
// when it clearly doesn't (a 65+ "family" user should get marriage /
// adult-daughter plans, never `first-time-mother`). −6 is a SOFT gate — it
// outweighs a topic hit (+4) so mismatches sink, but gated plans can still
// fill slots if the eligible pool ever runs dry.
const AGE_FIT: Record<string, { boost: string[]; avoid: string[] }> = {
  'youth':            { boost: ['18-24'], avoid: ['35-49', '50-64', '65+'] },
  'early-light':      { boost: ['18-24'], avoid: ['35-49', '50-64', '65+'] },
  'summer-bloom':     { boost: ['25-34'], avoid: ['50-64', '65+'] },
  'full-bloom':       { boost: ['25-34', '35-49'], avoid: ['65+'] },
  'harvest-season':   { boost: ['35-49', '50-64'], avoid: ['18-24'] },
  'midlife-renewal':  { boost: ['35-49', '50-64'], avoid: ['18-24'] },
  'empty-nest':       { boost: ['50-64'], avoid: ['18-24', '25-34'] },
  'evening-grace':    { boost: ['50-64', '65+'], avoid: ['18-24', '25-34'] },
  'twilight-faith':   { boost: ['65+'], avoid: ['18-24', '25-34', '35-49'] },
  'love-dating':      { boost: ['18-24', '25-34'], avoid: ['50-64', '65+'] },
  'in-love':          { boost: ['18-24', '25-34'], avoid: ['50-64', '65+'] },
  'newlywed-season':  { boost: ['18-24', '25-34'], avoid: ['50-64', '65+'] },
  'motherhood':       { boost: ['25-34', '35-49'], avoid: ['65+'] },
  'as-a-mother':      { boost: ['25-34', '35-49'], avoid: ['65+'] },
  'mother':           { boost: ['25-34', '35-49'], avoid: ['65+'] },
  'transition':       { boost: ['35-49', '50-64'], avoid: ['18-24'] },   // caring for aging parents
  'work-calling':     { boost: [], avoid: ['65+'] },
  'workplace':        { boost: [], avoid: ['65+'] },
  'as-a-leader':      { boost: [], avoid: ['65+'] },
};

// Editorial starter pool: broad, non-life-situation-specific on-ramps. The
// +1 is only decisive when every other signal is 0 (onboarding skipped).
const STARTER_SLUGS = new Set([
  'overcoming-anxiety', 'daily-breath-of-gratitude', 'rhythms-of-prayer',
  'beloved-daughter-of-god', 'resting-place-for-the-soul', 'hope-in-waiting',
  'restored-from-burnout', 'walking-through-psalms', 'wisdom-for-everyday-life',
]);

// FNV-1a → uint32 — deterministic tie-break / daily-rotation hash.
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Transparent additive score + human-readable reasons trail. */
export function scorePlan(plan: PlanSummary, answers: OnboardingAnswers): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const tag = plan.secondary;
  const days = plan.duration_days || plan.duration || 0;

  // Topics: +4 per stated topic whose tag-set contains this plan's tag.
  for (const topic of answers.topics ?? []) {
    if ((TOPIC_TAGS[topic] ?? []).includes(tag)) { score += 4; reasons.push(`topic:${topic} +4`); }
  }

  // Goal: section +2, tag +1; 'habit' also rewards long-haul plans.
  if (answers.goal) {
    if (GOAL_SECTION[answers.goal] === plan.primary) { score += 2; reasons.push(`goal-section:${answers.goal} +2`); }
    if ((GOAL_TAGS[answers.goal] ?? []).includes(tag)) { score += 1; reasons.push(`goal-tag:${answers.goal} +1`); }
    if (answers.goal === 'habit' && days >= 14) { score += 1; reasons.push('goal:habit long-plan +1'); }
  }

  // Age fit: boost +2 / avoid −6.
  if (answers.age && AGE_FIT[tag]) {
    if (AGE_FIT[tag].boost.includes(answers.age)) { score += 2; reasons.push(`age-boost:${answers.age} +2`); }
    if (AGE_FIT[tag].avoid.includes(answers.age)) { score -= 6; reasons.push(`age-avoid:${answers.age} -6`); }
  }

  // Bible level → depth comfort. Duration is the only depth signal in the
  // catalog (all ≥14-day plans are walking-with-god deep reads).
  switch (answers.bibleLevel) {
    case 'new':
      if (days <= 5) { score += 2; reasons.push('level:new short +2'); }
      if (days >= 14) { score -= 2; reasons.push('level:new long -2'); }
      break;
    case 'basics':
      if (days <= 7) { score += 1; reasons.push('level:basics short +1'); }
      if (days >= 21) { score -= 1; reasons.push('level:basics long -1'); }
      break;
    case 'regular':
      if (days >= 14 || plan.primary === 'walking-with-god') { score += 2; reasons.push('level:regular deep +2'); }
      break;
  }

  // Time commitment → duration-appetite proxy ONLY (112/113 plans are 7
  // minutes/day, so per-day minutes carry no signal). Deliberately weak.
  switch (answers.timeCommitment) {
    case 5:
      if (days <= 5) { score += 1; reasons.push('time:5 short +1'); }
      if (days >= 14) { score -= 1; reasons.push('time:5 long -1'); }
      break;
    case 10:
      if (days <= 7) { score += 1; reasons.push('time:10 short +1'); }
      break;
    case 15:
      if (days >= 7 && days <= 31) { score += 1; reasons.push('time:15 mid +1'); }
      break;
    case 30:
      if (days >= 14) { score += 2; reasons.push('time:30 long +2'); }
      break;
  }

  if (STARTER_SLUGS.has(plan.slug)) { score += 1; reasons.push('starter +1'); }

  return { score, reasons };
}

/** Top-`count` suggestions: scored, day-rotated on ties, diversity-filtered
 *  (never two of the same tag; max 2 per section unless a candidate leads the
 *  best other-section option by ≥4), never anything already started. */
export function recommendPlans({ answers, summaries, excludeSlugs, todayYmd, count }: {
  answers: OnboardingAnswers;
  summaries: PlanSummary[];
  excludeSlugs: string[];
  todayYmd: string;
  count: number;
}): PlanSummary[] {
  const excluded = new Set(excludeSlugs);
  const scored = summaries
    .filter(p => !excluded.has(p.slug))
    .map(p => ({ plan: p, score: scorePlan(p, answers).score }))
    .sort((a, b) =>
      b.score - a.score
      || fnv1a(`${a.plan.slug}:${todayYmd}`) - fnv1a(`${b.plan.slug}:${todayYmd}`)
      || (a.plan.slug < b.plan.slug ? -1 : 1));

  // Greedy pick with diversity rules; relax in stages if the pool runs dry
  // (rule 2 → rule 1) so we always return `count` when candidates exist.
  const pick = (dedupeTags: boolean, capSections: boolean): PlanSummary[] => {
    const out: PlanSummary[] = [];
    const tags = new Set<string>();
    const sections = new Map<string, number>();
    for (let i = 0; i < scored.length && out.length < count; i++) {
      const { plan, score } = scored[i];
      if (dedupeTags && tags.has(plan.secondary)) continue;
      if (capSections && (sections.get(plan.primary) ?? 0) >= 2) {
        // Overwhelming-signal override: keep it if it beats the best
        // remaining other-section candidate by a full topic-match margin.
        const alt = scored.slice(i + 1).find(c =>
          c.plan.primary !== plan.primary && (!dedupeTags || !tags.has(c.plan.secondary)));
        if (!alt || score - alt.score < 4) continue;
      }
      out.push(plan);
      tags.add(plan.secondary);
      sections.set(plan.primary, (sections.get(plan.primary) ?? 0) + 1);
    }
    return out;
  };

  let out = pick(true, true);
  if (out.length < count) out = pick(true, false);
  if (out.length < count) out = pick(false, false);
  return out;
}

// ── Card model: encodes the 0/1/2/≥3 content rule so the render is dumb ─────

export interface ReadingPlansCardModel {
  active: Array<{ plan: PlanSummary; completed: number; total: number; percent: number; startedAt: number }>;
  suggested: PlanSummary[];
}

export function buildReadingPlansCard({ records, summaries, answers, todayYmd }: {
  records: Record<string, PlanRecordLike>;
  summaries: PlanSummary[];
  answers: OnboardingAnswers;
  todayYmd: string;
}): ReadingPlansCardModel {
  const bySlug = new Map(summaries.map(p => [p.slug, p]));

  const active = Object.entries(records)
    .filter(([, r]) => r && r.completedDays.length > 0 && !r.finishedAt)
    .flatMap(([slug, r]) => {
      const plan = bySlug.get(slug);
      if (!plan) return [];                          // stale slug → drop silently
      const total = plan.duration_days || plan.duration || 1;
      const completed = Math.min(r.completedDays.length, total);
      return [{ plan, completed, total, percent: completed / total, startedAt: r.firstStartedAt || 0, lastDayYmd: r.lastDayYmd ?? '' }];
    })
    .sort((a, b) =>
      b.percent - a.percent
      || (a.lastDayYmd < b.lastDayYmd ? 1 : a.lastDayYmd > b.lastDayYmd ? -1 : 0)
      || b.startedAt - a.startedAt
      || (a.plan.slug < b.plan.slug ? -1 : 1))
    .slice(0, 3)
    .map(({ lastDayYmd: _drop, ...row }) => row);

  // 0 active → 3 suggestions; 1 → 2; 2 → 1; ≥3 → 1. Everything the user ever
  // touched (active OR finished) is excluded from suggestions forever.
  const suggestCount = active.length === 0 ? 3 : active.length === 1 ? 2 : 1;
  const suggested = recommendPlans({
    answers,
    summaries,
    excludeSlugs: Object.keys(records),
    todayYmd,
    count: suggestCount,
  });

  return { active, suggested };
}
