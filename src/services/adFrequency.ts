// ─────────────────────────────────────────────────────────────────────────────
// Engagement-based interstitial triggers (US monetization).
//
// Two EXTRA show triggers layered on top of the baseline (prayer_end / plan_end,
// which fire for everyone):
//   • Navigation: every 3rd qualifying screen transition.
//   • Hot start: returning to the foreground after ≥15s in the background.
//
// Both are AGGRESSIVE and therefore gated to established users only — days 0–3
// stay gentle (baseline only); day ≥ 4 turns the extra triggers on.
//
// Counting rules (per product decision):
//   • A run of CONSECUTIVE tab↔tab switches (prayer/bible/plan/profile) counts as
//     +1 total, no matter how many tabs are tapped, until a non-tab screen breaks
//     the run.
//   • Any transition touching a non-tab "browse" screen (Streak/Achievement/…)
//     counts +1 normally.
//   • Transitions into/out of flow & utility screens never count and never trigger
//     (prayer/reading/plan flows already show an ad at their end; never interrupt
//     the remove-ads / settings / help screens).
//
// The actual show + frequency floor + foreground check live in ads.ts /
// usInterstitial.ts; this module only decides WHEN to call maybeShowInterstitial.
// ─────────────────────────────────────────────────────────────────────────────

import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { maybeShowInterstitial } from './ads';

const INSTALL_KEY = 'ads:firstLaunchYmd';
const AGGRESSIVE_FROM_DAY = 3;     // day0..day2 gentle; day>=3 (the 4th day) aggressive
const NAV_EVERY = 3;               // show on every 3rd qualifying transition
const HOTSTART_MIN_BG_MS = 15_000; // must be backgrounded ≥15s to count as a hot start

// Bottom tabs — consecutive switches among these collapse to a single count.
const TABS = new Set(['prayer', 'bible', 'plan', 'profile']);
// Flow + utility screens: never count, never interrupt.
const EXCLUDED = new Set([
  'PrayerFlow', 'GospelPsalm', 'MoodDashboard', 'PlanDayWalk', 'PlanVerseRead', 'PlanDayDone',
  'RemoveAds', 'HelpCenter', 'HelpAnswer', 'AboutUs', 'Policy', 'Notifications', 'AddWidget',
  // Quiz is a flow like the others now: it shows its own interstitial on the
  // retry transition. Left countable, entering and leaving it would trip the
  // every-3rd-navigation ad within seconds of the one the retry just fired, and
  // the 60 s floor would silently drop one of the two.
  'Quiz', 'QuizProgress', 'PuzzleCollection', 'CardCollection',
]);

let installYmd = '';
let navCount = 0;
let lastRoute: string | null = null;
let lastWasTabSwitch = false;
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
/** Aggressive extra triggers are only for established (day ≥ 4) users. */
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

/** Call on every navigation state change with the deepest active route name. */
export function noteNavigation(routeName: string): void {
  const from = lastRoute;
  lastRoute = routeName;
  if (from == null || from === routeName) return;   // first route / no real change
  if (!isAggressive()) return;                       // gentle tier → nav never triggers
  if (EXCLUDED.has(from) || EXCLUDED.has(routeName)) { lastWasTabSwitch = false; return; }

  const isTabSwitch = TABS.has(from) && TABS.has(routeName);
  if (isTabSwitch && lastWasTabSwitch) return;       // collapse a consecutive tab run → +1 total
  lastWasTabSwitch = isTabSwitch;

  navCount += 1;
  if (navCount >= NAV_EVERY) {
    navCount = 0;
    maybeShowInterstitial('nav');                    // ads layer enforces 60s floor + foreground
  }
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

function onAppState(next: AppStateStatus): void {
  if (next === 'background' || next === 'inactive') { bgAt = Date.now(); return; }
  if (next === 'active') {
    const suppressed = hotStartSuppressedUntil > Date.now();
    hotStartSuppressedUntil = 0;                     // consumed either way
    if (!suppressed && bgAt != null && Date.now() - bgAt >= HOTSTART_MIN_BG_MS && isAggressive()) {
      maybeShowInterstitial('app_open');
    }
    bgAt = null;
  }
}
