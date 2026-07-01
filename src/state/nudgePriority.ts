// Priority + arbitration for the proactive-nudge coordinator. Pure (no React /
// RN imports) so the arbiter is unit-testable in isolation.
//
// The coordinator shows at most ONE blocking prompt on screen at a time. Among
// all currently-eligible prompts it picks the highest priority (lowest number).
// A per-app-open BUDGET throttles the "nudge" prompts (login / set-reminder /
// widget / …) to one per open, so a single open can't bombard the user — but
// "reward" prompts (badge unlock) and the daily mood ritual bypass the budget
// (`ignoresBudget`) because those are expected and welcome.

export type NudgeId =
  | 'achievementUnlock'
  | 'followHimOptin'
  | 'setReminderTime'
  | 'moodCheckIn'
  | 'login'
  | 'widgetInstall'
  | 'streakCongrats'
  | 'rate'
  | 'adInterstitial';

// Lower number = higher priority (shown first). See the plan for rationale.
export const NUDGE_PRIORITY: Record<NudgeId, number> = {
  achievementUnlock: 10,
  followHimOptin:    20,
  setReminderTime:   30,
  moodCheckIn:       40,
  login:             50,
  widgetInstall:     60,
  streakCongrats:    70,
  rate:              80,
  adInterstitial:    90,
};

// At most this many BUDGETED (non-ignoresBudget) blocking nudges per app-open.
export const MAX_BUDGETED_PER_OPEN = 1;

export interface ArbiterReq {
  id: NudgeId;
  priority: number;
  eligible: boolean;
  ignoresBudget?: boolean;
}

/** The single blocking nudge that may show right now, or null. Highest-priority
 *  eligible request that either ignores the per-open budget or still fits it. */
export function pickActiveNudge(reqs: ArbiterReq[], budgetRemaining: number): NudgeId | null {
  const eligible = reqs.filter(r => r.eligible).sort((a, b) => a.priority - b.priority);
  for (const r of eligible) {
    if (r.ignoresBudget || budgetRemaining > 0) return r.id;
  }
  return null;
}
