// Pure selector for the permanent home-screen Daily Rhythm bar (replaces the
// dismissable homeNudges banner). Five fixed steps — (1) morning prayer,
// (2) evening prayer, (3) morning Gospel & Psalm, (4) evening Gospel & Psalm,
// (5) reading plan — with a time-aware "next step" suggestion: evenings surface
// the evening items first, mornings the morning ones. Dot POSITIONS never
// reorder (glanceable); only the suggestion moves.

export type RhythmStepId =
  | 'prayerMorning' | 'prayerEvening'
  | 'gospelMorning' | 'gospelEvening'
  | 'plan';

// Canonical dot order — index 0..4 renders as 1..5.
export const RHYTHM_STEPS: readonly RhythmStepId[] = [
  'prayerMorning', 'prayerEvening', 'gospelMorning', 'gospelEvening', 'plan',
];

export type RhythmDotState =
  | 'done'      // completed today (rose check)
  | 'retired'   // gospel steps once the 89-day plan is finished (lavender check)
  | 'current'   // the suggested next step (pulsing outline)
  | 'pending'   // not done, doable today, just not the current suggestion
  | 'locked';   // cannot start right now (evening prayer before 18:00, prayers
                // in the 00–06 dead zone, gospel while content isn't ready)

export type RhythmState =
  | { kind: 'step'; step: RhythmStepId }
  | { kind: 'allDone' }      // every available step done today
  | { kind: 'deadZone' }     // 00:00–05:59 and only locked prayers remain
  | { kind: 'waitEvening' }; // everything available done except evening prayer (<18:00)

export interface PlanRecordLike {
  completedDays: number[];
  firstStartedAt: number;
  finishedAt?: number;
  lastDayYmd?: string;
}

export interface RhythmInput {
  hour: number;                 // 0-23 local
  todayYmd: string;             // local YYYY-MM-DD
  mDone: boolean;
  eDone: boolean;
  gospelReady: boolean;         // G&P content loaded
  gospelMorningDone: boolean;   // current G&P plan-day, morning half
  gospelEveningDone: boolean;
  gospelPlanComplete: boolean;  // full 89-day G&P plan finished
  planRecords: Record<string, PlanRecordLike>;
}

export interface RhythmView {
  state: RhythmState;
  dots: RhythmDotState[];       // length 5, canonical order
  doneCount: number;            // dots shown as done/retired (a11y "n of 5")
  // Step 5 target: continue the freshest ongoing plan, or explore when none.
  planMode: 'ongoing' | 'explore';
  planSlug: string | null;
}

/** Freshest ongoing plan: greatest lastDayYmd (missing → ''), then greatest
 *  firstStartedAt. Deterministic when several plans are mid-flight. */
export function pickOngoingPlan(records: Record<string, PlanRecordLike>): string | null {
  let best: string | null = null;
  let bestYmd = '';
  let bestStarted = -1;
  for (const [slug, r] of Object.entries(records)) {
    if (!r || r.completedDays.length === 0 || r.finishedAt) continue;
    const ymd = r.lastDayYmd ?? '';
    const started = r.firstStartedAt || 0;
    if (ymd > bestYmd || (ymd === bestYmd && started > bestStarted)) {
      best = slug; bestYmd = ymd; bestStarted = started;
    }
  }
  return best;
}

export function computeRhythm(i: RhythmInput): RhythmView {
  const planDoneToday = Object.values(i.planRecords)
    .some(r => !!r && r.lastDayYmd === i.todayYmd);

  const done: Record<RhythmStepId, boolean> = {
    prayerMorning: i.mDone,
    prayerEvening: i.eDone,
    gospelMorning: i.gospelPlanComplete || i.gospelMorningDone,
    gospelEvening: i.gospelPlanComplete || i.gospelEveningDone,
    plan: planDoneToday,
  };

  // "Startable right now" — morning prayer stays startable all day once 06:00
  // passes (catch-up); evening prayer opens strictly at 18:00; gospel halves
  // have no clock gate but need loaded content; the plan step is always open.
  const actionable: Record<RhythmStepId, boolean> = {
    prayerMorning: !done.prayerMorning && i.hour >= 6,
    prayerEvening: !done.prayerEvening && i.hour >= 18,
    gospelMorning: !done.gospelMorning && i.gospelReady && !i.gospelPlanComplete,
    gospelEvening: !done.gospelEvening && i.gospelReady && !i.gospelPlanComplete,
    plan: !done.plan,
  };

  // Gospel steps drop out of the all-done math while content isn't loaded —
  // an offline first launch shouldn't be un-completable.
  const unavailable = (id: RhythmStepId): boolean =>
    (id === 'gospelMorning' || id === 'gospelEvening') && !i.gospelReady && !i.gospelPlanComplete;

  // Evening-first from 18:00. In the 00–06 dead zone both prayers are locked,
  // so prayer order is moot — morning-first is right for the (possibly freshly
  // rolled) gospel pair.
  const order: RhythmStepId[] = i.hour >= 18
    ? ['prayerEvening', 'prayerMorning', 'gospelEvening', 'gospelMorning', 'plan']
    : ['prayerMorning', 'prayerEvening', 'gospelMorning', 'gospelEvening', 'plan'];

  const current = order.find(id => actionable[id]) ?? null;

  let state: RhythmState;
  if (current) {
    state = { kind: 'step', step: current };
  } else if (RHYTHM_STEPS.every(id => done[id] || unavailable(id))) {
    state = { kind: 'allDone' };
  } else if (i.hour < 6) {
    state = { kind: 'deadZone' };
  } else {
    state = { kind: 'waitEvening' };
  }

  const dots: RhythmDotState[] = RHYTHM_STEPS.map(id => {
    if (done[id]) {
      return i.gospelPlanComplete && (id === 'gospelMorning' || id === 'gospelEvening')
        ? 'retired' : 'done';
    }
    if (state.kind === 'step' && state.step === id) return 'current';
    if (!actionable[id]) return 'locked';
    return 'pending';
  });

  const planSlug = pickOngoingPlan(i.planRecords);
  return {
    state,
    dots,
    doneCount: dots.filter(d => d === 'done' || d === 'retired').length,
    planMode: planSlug ? 'ongoing' : 'explore',
    planSlug,
  };
}
