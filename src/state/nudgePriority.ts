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
  | 'bibleGuide'
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
  // The reader tutorial, on her first ever visit to the Bible tab. Just below
  // plan discovery so a day where both come due teaches plans first — but in
  // practice they can't collide: this one only ever asks from the Bible tab, and
  // both of the plan guide's paths only ask from Home or the Plan tab.
  bibleGuide:        39,
  moodCheckIn:       40,
  login:             50,
  widgetInstall:     60,
  // Between the widget ask and the rate prompt. It yields to everything that is
  // either a reward she earned or an ask that unlocks real functionality, and
  // outranks only the rate prompt — which can always wait another day. It is
  // BUDGETED (never ignoresBudget): a feature promo is the least important
  // thing on this list, and the per-wave blocking cap is already tight enough
  // to crowd out a badge she just earned.
  quizPromo:         65,
  streakCongrats:    70,
  rate:              80,
  adInterstitial:    90,
};

// At most this many BUDGETED (non-ignoresBudget) blocking nudges per wave.
// 1 → 2 (owner 2026-08-08).
export const MAX_BUDGETED_PER_OPEN = 2;
// HARD cap on TOTAL blocking prompts per wave — counting rewards, both guides
// and the daily mood ritual too. Enforced ABOVE ignoresBudget, so it is the one
// number that bounds how many surfaces she can meet in a row. 2 → 3 (owner).
export const MAX_BLOCKING_PER_OPEN = 3;
// Minimum spacing between two BUDGETED nudges (login/set-reminder/widget).
// 6h → 30s (owner 2026-08-08): with the wave reset below doing the real pacing,
// this is now just an anti-stacking gap, not a per-day rationing device.
export const BUDGETED_NUDGE_FLOOR_MS = 30 * 1000;

// After this much QUIET (no blocking prompt shown), the per-wave counters reset
// and the queue gets another wave — WITHOUT needing a background/foreground
// cycle.
//
// Why this exists: MAX_BLOCKING_PER_OPEN used to be released only by an
// AppState 'active' event, so a user who finishes her morning prayer and then
// keeps using the app — reading, browsing plans, never leaving — saw the first
// two prompts and NOTHING else, no matter how long she stayed. On day one that
// queue is seven deep (badge, streak guide, mood, login, widget, plan guide,
// rate), so five of them were reachable only by luck.
//
// 10min → 10s (owner 2026-08-08). This is now the PRIMARY pacing mechanism:
// three surfaces per wave, ten quiet seconds, then the next wave. The queue
// drains within one sitting by design — the caps only stop prompts landing
// back-to-back on the same tap.
export const NUDGE_WAVE_QUIET_MS = 10 * 1000;

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
