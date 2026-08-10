// The ONE global floor between any two interstitials.
//
// This constant used to be re-typed in three places — adEngine (Android),
// usInterstitial (the iOS US ladder) and ads (the iOS non-US single unit) — and
// docs/ad-routing.md §4 flagged it as a silent trap: changing one left the other
// two at the old value while the person editing believed they had moved the
// global floor. It lives here now so there is exactly one number to change.
//
// 60s → 30s on 2026-08-08 (owner). Every show path still enforces it, and it is
// the ONLY thing standing between e.g. a prayer_end ad and the hot-start ad that
// could otherwise follow it seconds later — do not remove it, only tune it.
export const MIN_AD_INTERVAL_MS = 30 * 1000;

/**
 * Every placement a CALLER may ask for.
 *
 * This union used to be re-typed in three files (ads / adEngine / usInterstitial)
 * — the same trap MIN_AD_INTERVAL_MS had. Adding a placement meant editing three
 * unions and a miss only showed up as a type error in whichever file you forgot,
 * or worse, in none of them. One definition now.
 *
 * `onboarding_first` is NOT here on purpose: it is the engine's own internal
 * placement, never something a trigger asks for (adEngine widens the type itself).
 */
export type AdPlacement =
  | 'prayer_end'
  | 'gospel_end'
  | 'plan_end'
  | 'quiz_retry'
  | 'nav'         // every 3rd qualifying transition, day ≥ 3
  | 'nav_churn'   // >5 screen switches AND ≥60s quiet — see services/adFrequency
  | 'app_open'
  | 'unknown';
