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
  | 'firstRunTour'
  | 'achievementUnlock'
  | 'followHimOptin'
  | 'setReminderTime'
  | 'streakGuide'
  | 'planGuide'
  | 'moodCheckIn'
  | 'login'
  | 'widgetInstall'
  | 'quizPromo'
  | 'streakCongrats'
  | 'rate'
  | 'adInterstitial';

// Lower number = higher priority (shown first). See the plan for rationale.
export const NUDGE_PRIORITY: Record<NudgeId, number> = {
  // The first-run home tour outranks everything: it runs exactly once, on the
  // very first open after the questionnaire, and nothing may sit on top of it.
  firstRunTour:       5,
  achievementUnlock: 10,
  followHimOptin:    20,
  setReminderTime:   30,
  // The rookie streak guide: a day-1 teaching moment right after a prayer
  // lands. Above the mood ritual (it fires at the exact half-lit moment and
  // the mood sheet can wait a minute), below the asks that unlock hardware.
  streakGuide:       35,
  // Plan discovery: the once-ever feature tutorial. Below the streak guide (a
  // fresher, time-sensitive moment) so on a day both fire, streak teaches
  // first and this one takes the next opening.
  planGuide:         38,
  moodCheckIn:       40,
  login:             50,
  widgetInstall:     60,
  // Between the widget ask and the rate prompt. It yields to everything that is
  // either a reward she earned or an ask that unlocks real functionality, and
  // outranks only the rate prompt — which can always wait another day. It is
  // BUDGETED (never ignoresBudget): a feature promo is the least important
  // thing on this list, and the 2-per-open hard cap is already tight enough to
  // crowd out a badge she just earned.
  quizPromo:         65,
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

// After this much QUIET (no blocking prompt shown), the per-open counters reset
// and the queue gets another wave — WITHOUT needing a background/foreground
// cycle.
//
// Why this exists: MAX_BLOCKING_PER_OPEN used to be released only by an
// AppState 'active' event, so a user who finishes her morning prayer and then
// keeps using the app — reading, browsing plans, never leaving — saw the first
// two prompts and NOTHING else, no matter how long she stayed. On day one that
// queue is seven deep (badge, streak guide, mood, login, widget, plan guide,
// rate), so five of them were reachable only by luck. The cap's real job is to
// stop prompts STACKING back-to-back; ten minutes apart is not stacking.
export const NUDGE_WAVE_QUIET_MS = 10 * 60 * 1000;

/** Has enough quiet passed since the last blocking prompt to start a new wave?
 *  `lastShownAt === 0` means none has shown this open — nothing to reset. */
export function startsNewWave(lastShownAt: number, now: number): boolean {
  return lastShownAt > 0 && now - lastShownAt >= NUDGE_WAVE_QUIET_MS;
}

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
