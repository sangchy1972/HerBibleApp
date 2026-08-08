// Cadence for the PROACTIVE remove-ads pitch — pure, zero-import, unit-tested.
//
// Until now the paywall was only ever offered twice, both passively: once in the
// onboarding flow and forever after as a banner on Profile. Per owner
// (2026-08-08) the app now pitches it again on its own:
//
//   ask #1  onboarding's paywall step (owned by OnboardingFlow — not here)
//   ask #2  her SECOND active day, straight after the first interstitial she
//           watches that day. If she doesn't open the app on day 2, her next
//           active day is her "second day" and it fires there instead.
//   later   every 7 days, same trigger (after that day's first ad).
//
// Each ask runs the same two-stage rhythm as day one: the full paywall, and if
// she closes it, the 7-day-free-trial sheet.
//
// ACTIVE DAYS, not calendar days: `activeDays` counts distinct local days the
// app was opened, so a user who installs Monday and returns Friday gets ask #2
// on Friday — the second day she was actually here.

/** Days between the last ask and today before we may ask again. */
export const REMOVE_ADS_REPEAT_DAYS = 7;
/** Ask #2 lands on this active day (1 = install day, which onboarding owns). */
export const REMOVE_ADS_SECOND_ASK_DAY = 2;

export interface RemoveAdsPromptState {
  /** Distinct local days the app has been opened, install day = 1. */
  activeDays: number;
  /** Local YYYY-MM-DD of the last proactive ask, '' if never. */
  lastAskYmd: string;
  /** Local YYYY-MM-DD of the day whose first ad we already used, '' if never. */
  lastAdDayYmd: string;
}

/** Whole days from `a` to `b` (both local YYYY-MM-DD). Infinity if unparseable. */
export function daysBetweenYmd(a: string, b: string): number {
  const p = (x: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
  };
  const d = (p(b) - p(a)) / 86_400_000;
  return Number.isFinite(d) ? Math.round(d) : Infinity;
}

/**
 * May we pitch the paywall right now — i.e. an interstitial just closed and
 * this is the first one today?
 *
 * `adsRemoved` short-circuits everything: a payer is never pitched again.
 */
export function removeAdsShouldAsk(
  s: RemoveAdsPromptState,
  todayYmd: string,
  adsRemoved: boolean,
): boolean {
  if (adsRemoved) return false;
  if (s.activeDays < REMOVE_ADS_SECOND_ASK_DAY) return false;   // day 1 belongs to onboarding
  if (s.lastAdDayYmd === todayYmd) return false;                // today's first ad is spent
  if (s.lastAskYmd === '') return true;                         // ask #2
  return daysBetweenYmd(s.lastAskYmd, todayYmd) >= REMOVE_ADS_REPEAT_DAYS;
}
