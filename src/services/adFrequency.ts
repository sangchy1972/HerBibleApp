// ─────────────────────────────────────────────────────────────────────────────
// Engagement-based interstitial triggers (US monetization).
//
// Three EXTRA show triggers layered on top of the baseline (prayer_end / plan_end,
// which fire for everyone):
//   • Navigation: every 3rd qualifying screen transition. AGGRESSIVE, and
//     therefore still gated to established users — day 0–2 gentle, day ≥ 3 on.
//   • Churn (owner 2026-08-09): MORE than 5 screen switches AND ≥60s since the
//     last ad. Counts EVERY switch — the tab-run collapse below is exactly what
//     left pure tab-hopping (prayer→bible→plan→profile→…) unmonetized, since a
//     whole run collapses to +1 and never reaches the every-3rd threshold. No day
//     gate: the owner specified two conditions and only two.
//   • Hot start: returning to the foreground after ≥15s in the background.
//     EVERY USER from day 0 (owner decision 2026-08-08 — previously day ≥ 3).
//     It rides the same global floor (constants/adPacing) + foreground check as every other
//     placement, and the store-review excursion is still exempt, so the widening
//     is a reach change, not a frequency change.
//
// Counting rules (per product decision). The two nav counters SHARE the exclusion
// rule and nothing else — see reduceNavigation, which is pure and tested:
//   • Transitions into/out of flow & utility screens never count and never trigger,
//     for EITHER counter (prayer/reading/plan flows already show an ad at their end;
//     never interrupt the remove-ads / settings / help screens). This is the one
//     place Play's Disruptive Ads exposure is actually bounded — do not widen it.
//   • `nav` counter: a run of CONSECUTIVE tab↔tab switches counts +1 TOTAL no matter
//     how many tabs are tapped, until a non-tab screen breaks the run. Any transition
//     touching a non-tab "browse" screen (Streak/Achievement/…) counts +1 normally.
//     Only advances for day ≥ 3 users.
//   • `churn` counter: +1 for EVERY switch, no collapsing, every day. This is the
//     whole point of it — see the trigger list above.
// When both are due on the same transition only ONE ad is asked for, and both
// counters reset.
//
// The actual show + frequency floor + foreground check live in ads.ts /
// usInterstitial.ts; this module only decides WHEN to call maybeShowInterstitial.
// ─────────────────────────────────────────────────────────────────────────────

import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { maybeShowInterstitial } from './ads';
import { msSinceLastInterstitial, isInterstitialVisible } from './interstitialVisibility';
import { peekPendingRoute } from './pendingNotifRoute';
import type { AdPlacement } from '../constants/adPacing';

const INSTALL_KEY = 'ads:firstLaunchYmd';
const AGGRESSIVE_FROM_DAY = 3;     // NAV only: day0..day2 gentle; day>=3 aggressive
const NAV_EVERY = 3;               // show on every 3rd qualifying transition
const HOTSTART_MIN_BG_MS = 15_000; // must be backgrounded ≥15s to count as a hot start

// ── Churn rule (owner 2026-08-09) ───────────────────────────────────────────
// "MORE than 5" — written as a `>` comparison so the constant reads exactly like
// the requirement instead of as an off-by-one waiting to happen. Fires on the 6th.
const CHURN_MIN_SWITCHES = 5;
// Its own quiet period, deliberately NOT derived from MIN_AD_INTERVAL_MS: this is
// a product number the owner set (1 min), while the global floor is a pacing
// number we tune. Deriving one from the other means halving the floor silently
// halves this too. It is >= the global floor (equal, since the floor went back
// to 60s on 2026-08-14), so this rule can never sneak an ad past it.
const CHURN_MIN_SINCE_AD_MS = 60_000;

// Bottom tabs — consecutive switches among these collapse to a single count.
const TABS = new Set(['prayer', 'bible', 'plan', 'profile']);
// Flow + utility screens: never count, never interrupt.
const EXCLUDED = new Set([
  'PrayerFlow', 'GospelPsalm', 'MoodDashboard', 'PlanDayWalk', 'PlanVerseRead', 'PlanDayDone',
  'RemoveAds', 'HelpCenter', 'HelpAnswer', 'AboutUs', 'Policy', 'Notifications', 'AddWidget',
  // Quiz is a flow like the others now: it shows its own interstitial on the
  // retry transition. Left countable, entering and leaving it would trip the
  // every-3rd-navigation ad within seconds of the one the retry just fired, and
  // the global floor (constants/adPacing) would silently drop one of the two.
  'Quiz', 'QuizProgress', 'PuzzleCollection', 'CardCollection',
]);

let installYmd = '';
let lastRoute: string | null = null;
// In-memory and per-process on purpose — NOT persisted. Persisting churnCount
// would mean 5 switches today plus one tomorrow earns an ad on the first tap of a
// fresh launch, which is the interruption pattern we most want to avoid. It does
// survive backgrounding (the process is still alive), which is intended: the
// hot-start ad restarts the 60s clock anyway.
let counters: NavCounters = { navCount: 0, churnCount: 0, lastWasTabSwitch: false };
let bgAt: number | null = null;
let appStateSub: { remove: () => void } | null = null;

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime();
  const db = new Date(b + 'T00:00:00').getTime();
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.max(0, Math.round((db - da) / 86_400_000));
}

/** Calendar days since first launch (install day = 0). */
export function installDayIndex(): number {
  if (!installYmd) return 0;
  return daysBetween(installYmd, ymd());
}

/**
 * True only on the very first calendar day. Used by App.tsx to exempt fresh
 * installs from the Android ads-init deferral: onboarding_first MUST land
 * before onboarding ends, and a fresh install is simultaneously the slowest
 * init path and the only session with onboarding — adding 6s there loses the
 * impression permanently, while the ANR cohort (existing users' daily cold
 * starts) keeps the deferral. Reads storage directly so it does not depend on
 * initAdFrequency having run; unknown → false, the deferral-keeping direction.
 */
export async function isInstallDay(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(INSTALL_KEY);
    return !v || v === ymd();
  } catch { return false; }
}
/** The NAV trigger is only for established (day ≥ 3) users. The hot-start
 *  trigger deliberately does NOT consult this — it fires for everyone. */
function isAggressive(): boolean {
  return installDayIndex() >= AGGRESSIVE_FROM_DAY;
}

export async function initAdFrequency(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(INSTALL_KEY);
    if (v) installYmd = v;
    else { installYmd = ymd(); AsyncStorage.setItem(INSTALL_KEY, installYmd).catch(() => {}); }
  } catch { installYmd = ymd(); }
  if (appStateSub == null) appStateSub = AppState.addEventListener('change', onAppState);
}

export type NavCounters = { navCount: number; churnCount: number; lastWasTabSwitch: boolean };

/**
 * PURE: what one A→B transition does to both nav counters, and which ad (if any)
 * it earns. Exported for tests — two counters with different counting rules,
 * different thresholds and different floors racing on the same event is exactly
 * the kind of interaction that cannot be verified by reading it.
 *
 * `msSinceAd` is time since the last interstitial ACTUALLY presented (shared
 * clock in interstitialVisibility), not since the last time we asked for one.
 */
export function reduceNavigation(
  s: NavCounters,
  from: string | null,
  to: string,
  opts: { aggressive: boolean; msSinceAd: number },
): { next: NavCounters; show: Extract<AdPlacement, 'nav' | 'nav_churn'> | null } {
  if (from == null || from === to) return { next: s, show: null };   // first route / no real change
  // Flows & utility screens: never count, never interrupt. Breaking the tab run
  // here is what makes "consecutive" mean consecutive.
  if (EXCLUDED.has(from) || EXCLUDED.has(to)) {
    return { next: { ...s, lastWasTabSwitch: false }, show: null };
  }

  const isTabSwitch = TABS.has(from) && TABS.has(to);
  const collapsed = isTabSwitch && s.lastWasTabSwitch;   // a consecutive tab run → +1 total
  const next: NavCounters = { ...s, lastWasTabSwitch: isTabSwitch };

  // CHURN counts every switch. The legacy counter keeps its own rules untouched:
  // collapsed runs and gentle-tier users still don't advance it.
  next.churnCount = s.churnCount + 1;
  if (opts.aggressive && !collapsed) next.navCount = s.navCount + 1;

  const churnDue = next.churnCount > CHURN_MIN_SWITCHES && opts.msSinceAd >= CHURN_MIN_SINCE_AD_MS;
  const navDue = next.navCount >= NAV_EVERY;

  // One ad per transition. Churn wins a tie because its 60s quiet is never
  // looser than the global floor, so honouring it never shows an ad the legacy
  // rule would have blocked. When both are due, BOTH counters reset — leaving
  // navCount at ≥ NAV_EVERY would make every later transition re-fire.
  if (churnDue) {
    return { next: { ...next, churnCount: 0, navCount: navDue ? 0 : next.navCount }, show: 'nav_churn' };
  }
  if (navDue) return { next: { ...next, navCount: 0 }, show: 'nav' };
  // Threshold met but still inside the quiet minute: the count deliberately STAYS
  // armed and climbing, so the first switch after the minute clears fires. Resetting
  // here would mean a fast tab-hopper who trips the floor once has to earn all 6 again.
  return { next, show: null };
}

/** Call on every navigation state change with the deepest active route name. */
export function noteNavigation(routeName: string): void {
  const from = lastRoute;
  lastRoute = routeName;
  const { next, show } = reduceNavigation(counters, from, routeName, {
    aggressive: isAggressive(),
    msSinceAd: msSinceLastInterstitial(),
  });
  counters = next;
  // ads layer still enforces the global floor, the foreground check and remove-ads.
  if (show) maybeShowInterstitial(show);
}

/**
 * Skip the hot-start interstitial on the NEXT return to the foreground.
 *
 * For excursions the app itself sent her on — today only the store-review
 * handoff. Writing a real Play review takes well over HOTSTART_MIN_BG_MS, so
 * without this the thank-you for doing us the favour is a full-screen ad the
 * instant she comes back. One hop only.
 *
 * This does NOT touch the settled decision that the hot-start interstitial
 * stays; it exempts a single trip that we initiated.
 *
 * Expires on its own: a handoff that never actually left the app would
 * otherwise leave the flag armed and mute a genuine hot start hours later.
 */
const HOTSTART_SUPPRESS_WINDOW_MS = 10 * 60_000;
let hotStartSuppressedUntil = 0;
export function suppressNextHotStart(): void {
  hotStartSuppressedUntil = Date.now() + HOTSTART_SUPPRESS_WINDOW_MS;
}

// ── "Was this background episode caused by our own ad?" ─────────────────────
// On ANDROID an interstitial is its own activity, so SHOWING an ad backgrounds
// the app and CLOSING it foregrounds it again. Without this flag that round
// trip satisfied the hot-start rule whenever the creative ran ≥ the global
// floor: Amen → prayer_end ad (30s creative) → close → 'active' → app_open →
// another 30s creative → close → app_open… — the owner's "three ads in a row
// after night prayer" report (2026-08-14). The chain became reachable when the
// floor dropped 60s → 30s: long night-inventory creatives now outlast it.
//
// The cause is stamped at the START of the episode ('background' arrives while
// the ad is still up), because by the time 'active' fires the CLOSED handler
// has already cleared the visibility flag — checking then would always say no.
// One flag per episode, consumed on 'active'. A user who genuinely leaves
// DURING an ad (home button mid-creative) is also skipped once — the safe
// direction. This does NOT touch the settled decision: a real backgrounding
// (≥15s away, then returning) still monetizes; an ad covering the app is not
// the user leaving.
let bgCausedByAd = false;

// A return that BEGAN on an overlay card (she tapped the daily verse/quiz
// popup on her launcher) must not open with an interstitial — "tapped a
// devotional card, got an ad first" is exactly the Better-Ads "unexpectedly,
// when the user has chosen to do something else" shape, and it would poison
// the one entry path we just asked her to enable. The native side stamps the
// tap to disk BEFORE opening the app, so this check can never race an event.
const OVERLAY_ENTRY_GRACE_MS = 15_000;

// Lazy + guarded, NOT a top-level import: keeps expo-modules-core out of the
// jest import graph (this file's pure functions are unit-tested) and degrades
// to "no overlay tap" on binaries without the native module.
function msSinceOverlayTap(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../modules/expo-overlay-cards') as { msSinceLastOverlayTap?: () => number };
    return mod.msSinceLastOverlayTap?.() ?? Infinity;
  } catch { return Infinity; }
}

/** PURE: may this foreground-return fire the hot-start interstitial? */
export function shouldFireHotStart(opts: {
  bgAt: number | null;
  now: number;
  suppressedUntil: number;   // store-review excursion window
  adCausedBg: boolean;       // the episode began under our own interstitial
  overlayEntry?: boolean;    // the return began on an overlay-card tap
}): boolean {
  if (opts.adCausedBg) return false;
  if (opts.overlayEntry) return false;
  if (opts.suppressedUntil > opts.now) return false;
  return opts.bgAt != null && opts.now - opts.bgAt >= HOTSTART_MIN_BG_MS;
}

// The hot-start decision runs ONE BEAT after 'active', not synchronously in
// it (owner 2026-08-17). Reason: a notification tap that routes into the
// prayer flow must suppress this ad, but on a warm return 'active' fires
// BEFORE the notification listeners deliver the tap — a synchronous decision
// would always beat the suppression. 600ms covers the in-memory listener
// delivery; the SLOW path — the AsyncStorage drain of a background PRAY
// action — is not bet on at all: the decision reads the stash itself (below).
// maybeShowInterstitial re-checks foreground at fire time, and a
// re-backgrounding cancels the timer outright. This delays every hot-start ad
// by 600ms and changes nothing else about the settled app_open decision.
const HOTSTART_DECISION_DELAY_MS = 600;
let hotStartDecisionTimer: ReturnType<typeof setTimeout> | null = null;

async function decideHotStart(bgAtSnap: number | null, adCaused: boolean): Promise<void> {
  // A stashed notification route means this 'active' is a transition INTO the
  // prayer flow. The drain that will route + arm the suppress flag races this
  // decision on the same AsyncStorage queue, so don't bet on it landing inside
  // the beat (swarm review 2026-08-17) — ask the stash directly. Queue order
  // makes this airtight: either this read still sees the stash (drain slower
  // than us), or the drain already removed it AND armed the flag in the same
  // microtask (routeSlot is synchronous after its removeItem) — which the flag
  // read below then sees. Skipped when no episode exists: nothing could fire.
  if (bgAtSnap != null && (await peekPendingRoute()) != null) return;

  const suppressedUntil = hotStartSuppressedUntil;
  // NO day gate (owner 2026-08-08): a hot start monetizes from day 0. The
  // interval floor, the foreground check and the remove-ads flag all still
  // apply inside maybeShowInterstitial, and a first-open session can't reach
  // here at all — bgAt is only set once the app has actually backgrounded.
  const base = {
    bgAt: bgAtSnap, now: Date.now(), adCausedBg: adCaused,
    overlayEntry: msSinceOverlayTap() < OVERLAY_ENTRY_GRACE_MS,
  };
  const fire = shouldFireHotStart({ ...base, suppressedUntil });
  // Consume the suppress flag ONLY when it decided the outcome: the decision
  // fired (flag absent/expired — clearing is a no-op) or the flag was the one
  // veto. A decision that dies on its own merits — short flap, ad-caused
  // episode, overlay entry, no episode at all — must NOT burn a flag armed
  // for an excursion still in flight: an iOS control-center flap during the
  // ~4s TestFlight fallback URL fetch was eating the store-review protection
  // (swarm review 2026-08-17). A flag left armed by a handoff that never
  // leaves still expires on its own (HOTSTART_SUPPRESS_WINDOW_MS).
  if (fire || shouldFireHotStart({ ...base, suppressedUntil: 0 })) {
    hotStartSuppressedUntil = 0;
  }
  if (fire) maybeShowInterstitial('app_open');
}

function onAppState(next: AppStateStatus): void {
  if (next === 'background' || next === 'inactive') {
    if (isInterstitialVisible()) bgCausedByAd = true;
    bgAt = Date.now();
    // No longer foreground — a pending decision must not fire into this.
    if (hotStartDecisionTimer) { clearTimeout(hotStartDecisionTimer); hotStartDecisionTimer = null; }
    return;
  }
  if (next === 'active') {
    const adCaused = bgCausedByAd;
    bgCausedByAd = false;                            // consumed either way
    const bgAtSnap = bgAt;
    bgAt = null;
    if (hotStartDecisionTimer) clearTimeout(hotStartDecisionTimer);
    hotStartDecisionTimer = setTimeout(() => {
      hotStartDecisionTimer = null;
      // If the app re-backgrounds during the awaits inside, the foreground
      // check in maybeShowInterstitial is the backstop; snapshots keep the
      // decision pinned to ITS episode either way.
      void decideHotStart(bgAtSnap, adCaused);
    }, HOTSTART_DECISION_DELAY_MS);
  }
}
