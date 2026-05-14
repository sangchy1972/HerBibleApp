import { PLAN_SECTIONS, PlanSectionId } from '../constants/plansApi';
import type { PlanSummary } from '../services/plansService';

// ---------------------------------------------------------------------------
// Featured-plans picker.
//
// v1 was pure ISO-week rotation; v1.1 (this file) adds:
//   1. A vocabulary mapper that bridges the user's profile answer IDs
//      (single / married / mother / anxious / tired …) to the noisy audience
//      tags actually present in the plan source data ("married-women",
//      "weary", "burned-out", …). Without the mapper, profile match was
//      hitting < 10 % of plans.
//   2. Hard-exclude rules using the clean `secondary` field — keeps Mother
//      from seeing Dating plans, Single from seeing Motherhood plans, etc.
//   3. Bi-weekly rotation (every 2 weeks, not 1). Users get longer to absorb
//      the slate before it shifts.
//   4. Behavior signals: completed plans are pushed down (–50k), started-but-
//      not-finished plans are pulled up (+30k), and repeated taps on a
//      `secondary` lift sibling plans in that secondary (+2k per tap, capped).
// ---------------------------------------------------------------------------

// Bi-weekly bucket. Two installs in the same 14-day slot see identical
// picks; the slot rolls over once every other Monday UTC.
export function biweek(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1);
  const dayIdx = Math.floor((date.getTime() - jan1) / 86400000);
  const slot = Math.floor(dayIdx / 14);
  return `${y}-B${String(slot).padStart(2, '0')}`;
}

// FNV-1a 32-bit — deterministic per (week, section, slug) so the same
// install never sees the same plan twice in one slot.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Vocabulary mapper. Profile answer ID → set of `audience.*` tags that count
// as a match. Derived from a frequency audit of the 113 source plans; tags
// not present anywhere in the corpus are still listed so the mapper survives
// future plan additions without code edits.
// ---------------------------------------------------------------------------

const LIFE_STAGE_MAP: Record<string, string[]> = {
  'single':       ['single', 'single-women', 'single-woman', 'young-women', 'young-adult-women', 'twenties', '20s-and-30s', 'teens-and-twenties'],
  'dating':       ['dating', 'pre-marriage', 'single-women', 'single-woman'],
  'married':      ['married', 'married-women', 'wives', 'newlywed', 'pre-marriage'],
  'mother':       ['mother', 'mothers', 'new-mothers', 'stepmothers', 'adult-daughters', 'new-mother'],
  'empty-nester': ['empty-nest-women', 'older-women', 'later-life', 'retirement-age', 'sixties-and-beyond', '55-plus', 'midlife-women', 'ages-45-65', 'ages-35-55'],
};

const EMOTION_MAP: Record<string, string[]> = {
  'anxious':  ['anxious', 'overwhelmed', 'fearful', 'panicked', 'restless', 'pressured', 'worried about the children'],
  'joyful':   ['joyful', 'recovering-joy', 'grateful', 'content-in-waiting', 'at-peace', 'whole', 'freed', 'longing for joy'],
  'lonely':   ['lonely', 'isolated', 'isolated-by-strength', 'longing-for-connection', 'longing-to-belong', 'longing for belonging', 'unseen', 'misunderstood', 'longing-for-friendship'],
  'grateful': ['grateful', 'content-in-waiting', 'at-peace', 'whole', 'trusting', 'loving'],
  'grieving': ['grieving', 'bereaved', 'sorrowful', 'sorrowing', 'wounded', 'tearful', 'after-loss', 'hidden-loss', 'suppressed-tears', 'grieving-the-quiet', 'longing-for-healing'],
  'hopeful':  ['hopeful', 'seeking-direction', 'seeking-renewal', 'embracing-change', 'starting-over', 'moving-forward', 'longing-for-hope', 'longing-for-renewal', 'searching-for-direction', 'reorienting'],
  'tired':    ['weary', 'exhausted', 'burned-out', 'burned out', 'depleted', 'drained', 'soul-tired', 'tender-and-tired', 'addicted-to-busy', 'weary-of-self-effort', 'weary-of-comparison', 'weary-at-work', 'weary-of-waiting', 'weary in marriage', 'longing-for-rest', 'cycle-weary'],
};

// Spiritual stage in the source is 112/113 "any" so it can't drive a real
// filter. We still keep it as a tiny tie-breaker for the rare plan that
// declares a stage other than "any".
const SPIRITUAL_STAGE_MAP: Record<string, string[]> = {
  'exploring':    ['exploring', 'spiritually-curious', 'seeking-god', 'seeking-meaning', 'curious'],
  'new-believer': ['new-believer', 'growing', 'seeking-presence'],
  'growing':      ['growing', 'committed', 'living-out-faith'],
  'mature':       ['mature', 'committed', 'living-out-faith'],
};

// ---------------------------------------------------------------------------
// Hard exclusions. Avoid recommendations that would feel obviously wrong even
// if the soft-scoring math says otherwise. Keyed on the clean `secondary`
// values that come straight from the file-naming convention.
// ---------------------------------------------------------------------------

function hardExcluded(profile: PlanProfile, plan: PlanSummary): boolean {
  const sec = plan.secondary || '';
  const ls = profile.life_stage;
  if (ls === 'mother') {
    if (sec === 'love-dating' || sec === 'in-love' || sec === 'dating') return true;
    if (sec === 'single-whole' || sec === 'singleness') return true;
  }
  if (ls === 'single') {
    if (sec === 'motherhood' || sec === 'as-a-mother' || sec === 'mother') return true;
    if (sec === 'marriage-wifehood' || sec === 'wife' || sec === 'newlywed-season') return true;
  }
  if (ls === 'dating') {
    if (sec === 'motherhood' || sec === 'as-a-mother' || sec === 'mother') return true;
  }
  if (ls === 'empty-nester') {
    if (sec === 'newlywed-season' || sec === 'love-dating') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlanProfile {
  life_stage?: string | null;
  spiritual_stage?: string | null;
  emotional_state?: string[];
}

export interface BehavioralSignal {
  taps?: Record<string, number>;       // slug → tap count on the row
  starts?: Record<string, number>;     // slug → start count
  completes?: Record<string, number>;  // slug → completed (0/1)
}

// ---------------------------------------------------------------------------
// Main picker
// ---------------------------------------------------------------------------

export function featuredForWeek(
  plans: PlanSummary[],
  bucket: string = biweek(),
  profile?: PlanProfile | null,
  signals?: BehavioralSignal | null,
): PlanSummary[] {
  // Pre-group by section (the canonical 5).
  const bySection = new Map<PlanSectionId, PlanSummary[]>();
  for (const s of PLAN_SECTIONS) bySection.set(s, []);
  for (const p of plans) {
    const arr = bySection.get(p.section);
    if (arr) arr.push(p);
  }

  // Map taps into a per-`secondary` rollup so a fan of "marriage-wifehood"
  // pulls every plan in that secondary up by a hair, not just the one they
  // tapped.
  const tapsBySecondary = new Map<string, number>();
  if (signals?.taps) {
    for (const [slug, count] of Object.entries(signals.taps)) {
      const plan = plans.find(p => p.slug === slug);
      if (!plan?.secondary) continue;
      tapsBySecondary.set(plan.secondary, (tapsBySecondary.get(plan.secondary) || 0) + count);
    }
  }

  const lifeAllow = profile?.life_stage ? new Set(LIFE_STAGE_MAP[profile.life_stage] || []) : null;
  const emotionAllow = profile?.emotional_state?.length
    ? new Set(profile.emotional_state.flatMap(e => EMOTION_MAP[e] || []))
    : null;
  const spiritAllow = profile?.spiritual_stage ? new Set(SPIRITUAL_STAGE_MAP[profile.spiritual_stage] || []) : null;

  const picks: PlanSummary[] = [];

  for (const section of PLAN_SECTIONS) {
    const arr = bySection.get(section) || [];
    if (arr.length === 0) continue;

    let bestScore = -Infinity;
    let bestPlan: PlanSummary | null = null;

    for (const p of arr) {
      if (profile && hardExcluded(profile, p)) continue;

      // Deterministic base [0, 100000).
      let score = fnv1a(`${bucket}:${section}:${p.slug}`) % 100000;

      // Profile-driven boosts.
      const a = p.audience || { life_stage: [], emotional_state: [], spiritual_stage: [] };

      if (lifeAllow && a.life_stage?.some(t => lifeAllow.has(t))) score += 25000;

      if (emotionAllow) {
        let hits = 0;
        for (const t of (a.emotional_state || [])) if (emotionAllow.has(t)) hits++;
        score += Math.min(hits, 3) * 8000;   // cap at 3 to avoid runaway scores
      }

      if (spiritAllow && a.spiritual_stage?.some(t => spiritAllow.has(t) && t !== 'any')) {
        score += 5000;   // small bump — data quality on this field is poor
      }

      // Behavior signals.
      if (signals?.completes?.[p.slug])             score -= 50000;   // already done → sink it
      if (signals?.starts?.[p.slug] && !signals?.completes?.[p.slug]) score += 30000;  // resume nudge
      if (p.secondary) {
        const sib = tapsBySecondary.get(p.secondary) || 0;
        score += Math.min(sib, 5) * 2000;          // up to +10000 for repeat-taps on the same secondary
      }

      if (score > bestScore) { bestScore = score; bestPlan = p; }
    }

    if (bestPlan) picks.push(bestPlan);
  }

  return picks;
}

// Kept as a named export for the rare caller that genuinely wants the
// ISO-week bucket (e.g. analytics joining with the server's weekly logs).
// New code should call biweek() — the rotation cadence the product asks for.
export function isoWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
