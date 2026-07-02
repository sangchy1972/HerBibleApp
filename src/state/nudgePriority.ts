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
// HARD cap on TOTAL blocking prompts shown in a row on one app-open — counting
// rewards + the daily mood ritual too. The user must NEVER see more than two
// stacked in sequence, so this is enforced above ignoresBudget.
export const MAX_BLOCKING_PER_OPEN = 2;
// Minimum spacing between two BUDGETED nudges (login/set-reminder/widget) so
// they spread out over time instead of clustering on one morning open.
export const BUDGETED_NUDGE_FLOOR_MS = 6 * 60 * 60 * 1000;

export interface ArbiterReq {
  id: NudgeId;
  priority: number;
  eligible: boolean;
  ignoresBudget?: boolean;
}

/** The single blocking nudge that may show right now, or null.
 *  - blockingRemaining: total blocking slots left this open (the 2-cap).
 *  - budgetRemaining: budgeted-nudge slots left (0 also when inside the floor). */
export function pickActiveNudge(reqs: ArbiterReq[], budgetRemaining: number, blockingRemaining: number): NudgeId | null {
  if (blockingRemaining <= 0) return null;
  const eligible = reqs.filter(r => r.eligible).sort((a, b) => a.priority - b.priority);
  for (const r of eligible) {
    if (r.ignoresBudget || budgetRemaining > 0) return r.id;
  }
  return null;
}
