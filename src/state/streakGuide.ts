// The rookie streak guide's decision rules — pure, zero-import, unit-tested.
//
// The guide is a 2-step spotlight for users who have NEVER lit a full day
// (both prayers). It fires when they come back to home having completed
// exactly ONE of today's two prayers, teaches that the flame needs BOTH, walks
// them to the streak screen's milestone card, and hands them the next action.
// Purpose (owner): keep day-1 users busy and teach the streak rule.

export type StreakScenario =
  | 'nightLater'     // morning done; night prayer hasn't opened yet (before 18:00)
  | 'startNight'     // morning done; night prayer is open and unprayed
  | 'startMorning'   // evening done first (night-time installer); morning remains
  | 'done';          // both done — nothing left to sell (safety rail)

/** Which situation the guide's copy and final CTA must speak to. */
export function streakScenario(mDone: boolean, eDone: boolean, hour: number): StreakScenario {
  if (mDone && eDone) return 'done';
  if (mDone) return hour >= 18 ? 'startNight' : 'nightLater';
  if (eDone) return 'startMorning';
  return 'done';   // zero done — the guide should never be up; treat as nothing-to-do
}

/**
 * Should the guide OFFER itself right now?
 *  • rookie only — never completed a both-prayers day (totalComplete === 0);
 *  • exactly one of today's prayers done (the "half-lit" moment);
 *  • at most once per calendar day (lastShownYmd);
 * The nudge coordinator adds the rest (first-run tour gate, one-prompt rule).
 */
export function streakGuideEligible(
  totalComplete: number,
  mDone: boolean,
  eDone: boolean,
  lastShownYmd: string | null,
  todayYmd: string,
): boolean {
  if (totalComplete > 0) return false;
  if (mDone === eDone) return false;          // zero or both — not the teaching moment
  if (lastShownYmd === todayYmd) return false;
  return true;
}
