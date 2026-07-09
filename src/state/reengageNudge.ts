// Pure eligibility logic for the general "re-engagement" big-picture banner.
//
// Product goal (user request): mimic competitor devotional apps where a large
// banner keeps showing up "whenever you pick your phone back up." We CANNOT
// listen for the OS screen-unlock event in a Play-compliant Expo app (that
// needs a persistent background/foreground service, which Play's foreground-
// service + disruptive-notification policies disallow for this purpose). The
// compliant proxy: when the user LEAVES our app (AppState → background), we
// schedule a one-off big-picture notification ~1 minute later. So shortly after
// they put the phone down / switch away, the banner is waiting the next time
// they look at the screen — no unlock listener, no special permission.
//
// To stay non-spammy (and avoid users disabling notifications, which also keeps
// us on the right side of Play policy), firing is gated by a per-day cap, a
// cooldown between fires, and a quiet-hours window. All three are tunable.
//
// React-free + native-free so it runs under ts-jest (mirrors backgroundNudge.ts).

export interface ReengageInput {
  now: Date;
  permissionGranted: boolean;
  /** How many re-engagement banners have already fired today. */
  firedTodayCount: number;
  /** Epoch ms of the last re-engagement fire (any day), or null if never. */
  lastFiredAtMs: number | null;
  /** Max re-engagement banners per day (default REENGAGE_CAP). */
  capPerDay?: number;
  /** Minimum minutes between two re-engagement fires (default REENGAGE_COOLDOWN_MIN). */
  cooldownMin?: number;
  /** Quiet window start hour (inclusive) — no banners at/after this (default 23). */
  quietStartHour?: number;
  /** Quiet window end hour (exclusive) — no banners before this (default 7). */
  quietEndHour?: number;
}

// Defaults chosen so an engaged user comfortably clears the "≥5/day" bar
// (re-engagement up to 5/day PLUS the fixed-time morning/night/extra big
// pictures) without the banners feeling like spam. Tune these two to go more
// or less aggressive.
export const REENGAGE_CAP = 5;
export const REENGAGE_COOLDOWN_MIN = 40;
const QUIET_START = 23;   // 23:00 …
const QUIET_END = 7;      // … 07:00 → no re-engagement banners overnight

/** True only when every gate passes: permission on, under the daily cap, past
 *  the cooldown since the last fire, and not inside quiet hours. */
export function shouldScheduleReengage(i: ReengageInput): boolean {
  if (!i.permissionGranted) return false;

  const cap = i.capPerDay ?? REENGAGE_CAP;
  if (i.firedTodayCount >= cap) return false;

  const cooldownMs = (i.cooldownMin ?? REENGAGE_COOLDOWN_MIN) * 60_000;
  if (i.lastFiredAtMs != null && i.now.getTime() - i.lastFiredAtMs < cooldownMs) return false;

  const h = i.now.getHours();
  const qs = i.quietStartHour ?? QUIET_START;
  const qe = i.quietEndHour ?? QUIET_END;
  if (h >= qs || h < qe) return false;

  return true;
}
