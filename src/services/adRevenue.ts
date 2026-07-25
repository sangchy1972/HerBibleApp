// Impression-level ad revenue (ILAR) → Firebase, the single funnel.
//
// Every ad object's PAID callback in the app routes here and nowhere else, so
// the accumulators can never see the same impression twice or miss one.
// Reference: https://developers.google.com/admob/android/impression-level-ad-revenue
//
// WHAT THIS EMITS
// ───────────────
//  • `ad_impression`  — the RESERVED Firebase event, one per paid impression.
//    Only when the remote per-platform `manualAdImpression` flag says WE own it
//    (i.e. the AdMob↔Firebase link is OFF for this platform). See
//    constants/adRevenueConfig for why this can't be de-duplicated client-side.
//  • `Total_Ads_Revenue_001` — fires once per configured step (e.g. HK$0.078 ≈
//    US$0.01) of accumulated revenue, then the carry resets. Deliberately drops
//    the long tail of sub-cent impressions instead of emitting a huge volume of
//    near-worthless events.
//  • `AdLTV_OneDay_TopNPercent` ×4 — fires the first time the day's running
//    total crosses each tier. Silent until thresholds are configured remotely.
//
// PRECISION NOTE: on test/bidding requests AdMob returns precision=UNKNOWN and
// value=0 by design. Those still count as impressions but contribute nothing,
// which is correct — we must not let test traffic move the LTV accumulators.
//
// CRASH POLICY: every public entry point is total. A malformed payload, a dead
// AsyncStorage, or a missing config degrades to "log less", never to a throw —
// this runs inside a native ad callback where an exception is unrecoverable.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { logEvent } from './firebase';
import { currentConfig } from './adRevenueConfig';
import { deviceRegion } from './deviceRegion';
import {
  AD_IMPRESSION_EVENT,
  AD_LTV_EVENT_NAME,
  AD_LTV_TIERS,
  TOTAL_ADS_REVENUE_EVENT,
  effectiveCurrency,
  stepForCurrency,
  thresholdsFor,
  type AdLtvTier,
} from '../constants/adRevenueConfig';

const STATE_KEY = 'ad-revenue-state:v1';

/** Per-impression cap on Total_Ads_Revenue_001 emissions. Only a misconfigured
 *  step can reach it; see the overflow branch in onAdPaid(). */
const MAX_STEPS_PER_IMPRESSION = 100;

export interface AdPaidInfo {
  /** Already in currency units, NOT micros — react-native-google-mobile-ads
   *  divides valueMicros by 1e6 before it reaches JS. */
  value: unknown;
  currency: unknown;
  /** 'interstitial' | 'rewarded' | … — Firebase's ad_format param. */
  format: string;
  /** Our own label for the slot, e.g. 'ww_interstitial', 'us_ladder_07'. */
  adUnitName: string;
  precision?: unknown;
}

interface DayState {
  day: string;          // local YYYY-MM-DD
  total: number;        // running revenue for `day`, in `currency`
  carry: number;        // progress toward the next Total_Ads_Revenue_001
  fired: AdLtvTier[];   // tiers already emitted today
  currency: string;     // currency the numbers above are denominated in
}

let state: DayState = freshDay(localDay(), '');
let loading: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function freshDay(day: string, currency: string): DayState {
  return { day, total: 0, carry: 0, fired: [], currency };
}

/**
 * Start a new day WITHOUT discarding the micro-accumulator.
 *
 * `total` and `fired` are one-day concepts and must reset. `carry` is not: it
 * is unbanked progress toward the next Total_Ads_Revenue_001, and that event
 * counts lifetime revenue in fixed units. Zeroing it at midnight would silently
 * bin up to a full step of real money per user per day — revenue that is
 * already earned and can never be recovered.
 */
function rollDay(day: string, currency: string, carry: number): DayState {
  return { day, total: 0, carry, fired: [], currency };
}

/** Local calendar day. LTV tiers are a per-user-day concept, so this must be
 *  the DEVICE's day — not UTC and not the AdMob account's GMT+8 reporting day,
 *  which would roll over mid-afternoon for a US user. */
function localDay(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Coerce whatever the bridge handed us into a finite non-negative number.
 *
 * The spec calls out decimal-separator corruption: some mediation adapters
 * stringify money using the device locale, so a German device can produce
 * "0,004". Number("0,004") is NaN — the value would silently vanish. Swapping a
 * lone comma for a dot recovers it. Grouping separators ("1,234.5") are left
 * alone because the dot already anchors the decimal.
 */
export function normalizeValue(raw: unknown): number {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string') {
    const s = raw.trim();
    const normalized = s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.');
    n = Number(normalized);
  } else {
    n = NaN;
  }
  if (!isFinite(n) || n < 0) return 0;
  return n;
}

/** ISO-4217 is exactly three letters. Anything else is unusable for a currency
 *  comparison, so we surface it as empty rather than guessing USD. */
export function normalizeCurrency(raw: unknown): string {
  const s = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : '';
}

/** Does this build own the reserved `ad_impression` event on this platform? */
function shouldLogAdImpression(): boolean {
  const flags = currentConfig().manualAdImpression;
  return Platform.OS === 'ios' ? !!flags?.ios : !!flags?.android;
}

// Until initAdRevenue() has read the disk, `state` is an EMPTY day — not the
// user's real accumulators. Writing that out would erase today's `fired` list
// and re-arm tiers that already fired (and bin the carry). The window is real:
// the module-scope AppState listener below is live from bundle eval, while the
// load only finishes after ATT settles, and the iOS ATT alert itself drives the
// app to `inactive`. So: never write before we have read.
let hydrated = false;

function flushPersist(): void {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  if (!hydrated) return;
  AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)).catch(() => {});
}

// Debounced write: an ad-heavy session would otherwise hit AsyncStorage on
// every impression. Losing at most a second of accumulator state on a hard kill
// is an acceptable trade for not doing blocking I/O inside an ad callback.
function persistSoon(): void {
  if (!hydrated || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!hydrated) return;
    AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)).catch(() => {});
  }, 1000);
}

// Backgrounding is the last moment we are reliably alive, and the OS can kill
// us without warning afterwards. An unflushed `fired` list would let today's
// AdLTV tiers fire a SECOND time after relaunch — exactly the false signal
// this module exists to avoid.
try {
  AppState.addEventListener?.('change', (s: string) => {
    if (s !== 'active') flushPersist();
  });
} catch { /* AppState unavailable (tests) — the debounced write still runs */ }

/** Load persisted accumulators. Call once at startup, before ads can serve. */
export async function initAdRevenue(): Promise<void> {
  // Cache the promise rather than a boolean: a second caller must WAIT for the
  // load, not sail past it and start accruing onto empty state.
  if (loading) return loading;
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STATE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return;
      const day = typeof p.day === 'string' ? p.day : '';
      const carry = normalizeValue(p.carry);
      // A new day resets the daily tiers but must still inherit the carry —
      // see rollDay(). Dropping it here was a per-user, per-day revenue leak.
      if (day !== localDay()) {
        state = rollDay(localDay(), normalizeCurrency(p.currency), carry);
        return;
      }
      state = {
        day,
        total: normalizeValue(p.total),
        carry,
        fired: Array.isArray(p.fired)
          ? p.fired.filter((t: unknown): t is AdLtvTier => AD_LTV_TIERS.includes(t as AdLtvTier))
          : [],
        currency: normalizeCurrency(p.currency),
      };
    } catch { /* corrupt cache → start the day clean */ } finally {
      // Set even on the error paths: "we tried to read and there was nothing
      // usable" is still a valid basis for writing. Only the pre-read window
      // must stay read-only.
      hydrated = true;
    }
  })();
  return loading;
}

/** Roll over at local midnight. Called on every impression, so a session that
 *  spans midnight resets without needing a timer or an app restart. */
function ensureDay(currency: string): void {
  const today = localDay();
  if (state.day !== today) {
    state = rollDay(today, currency || state.currency, state.carry);
    persistSoon();
    return;
  }
  // Account currency changed mid-day (rare, but a currency switch in AdMob
  // would make the running total meaningless). Restart the day's accumulators
  // rather than compare HKD against USD thresholds. The carry is dropped here
  // and ONLY here: unlike a date change, its denomination genuinely changed,
  // so carrying HKD progress into a USD step would be wrong.
  if (currency && state.currency && state.currency !== currency) {
    state = freshDay(today, currency);
    persistSoon();
    return;
  }
  if (currency && !state.currency) state.currency = currency;
}

/**
 * THE funnel. Call exactly once per PAID callback.
 *
 * Callers must guard against the SDK delivering PAID twice for one impression
 * (the `paidSeen` latch pattern) — this function intentionally does NOT
 * de-duplicate, because it has no impression identity to key on and silently
 * swallowing a second genuine impression would under-report revenue.
 */
export function onAdPaid(info: AdPaidInfo): void {
  try {
    const value = normalizeValue(info.value);
    const cfg = currentConfig();
    // Resolve ONCE and use everywhere: the amount is denominated in the
    // account's currency no matter what code the SDK reports, so the event
    // label, the step lookup and the threshold lookup must all agree. Labelling
    // an event 'HKD' while looking thresholds up under '' silently disabled
    // every AdLTV tier whenever the SDK returned a blank/non-ISO code. And
    // never 'USD' by reflex — that would inflate every value ~7.8×.
    const cur = effectiveCurrency(cfg, normalizeCurrency(info.currency));
    ensureDay(cur);

    // 1) The reserved event — one per impression, even a zero-value one, since
    //    an impression did occur. Param keys are fixed by Firebase/Google Ads.
    if (shouldLogAdImpression()) {
      logEvent(AD_IMPRESSION_EVENT, {
        value,
        currency: cur,                 // reserved event needs a currency to
                                       // monetise `value`; empty would void it
        ad_platform: 'admob',
        ad_source: 'admob_mediation',  // RN lib's PaidEvent exposes no
                                       // responseInfo, so the winning network
                                       // is not available on this platform
        ad_format: info.format,
        ad_unit_name: info.adUnitName,
        precision: String(info.precision ?? ''),
      });
    }

    if (value <= 0) return;            // test/bidding no-fill: nothing to accrue

    // 2) Micro-threshold roll-up. A `while` (not `if`) because one high-value
    //    impression can cross several steps at once, and the carry must not
    //    drift upward across days.
    const step = stepForCurrency(cfg, cur);
    // Relative epsilon: binary floating point cannot hold 0.078, so an
    // impression worth exactly 3 steps leaves a carry of 0.07799999999999996
    // and the third event would be lost. Nothing is over-counted — the residue
    // is orders of magnitude below a step — but exact multiples must behave
    // exactly, since the whole point of this event is a clean unit of revenue.
    const eps = step * 1e-9;
    state.carry += value;
    let steps = 0;
    while (state.carry + eps >= step && steps < MAX_STEPS_PER_IMPRESSION) {
      state.carry -= step;
      steps += 1;
    }
    if (steps >= MAX_STEPS_PER_IMPRESSION && state.carry + eps >= step) {
      // We hit the cap, which means the step is implausibly small relative to
      // this impression. Leaving the remainder in `carry` would re-trigger the
      // cap on EVERY subsequent impression forever — an unbounded event flood
      // across the whole user base, not a bounded one. Drain it and leave a
      // breadcrumb so the bad config is visible in Firebase.
      state.carry = 0;
      logEvent('ad_revenue_step_overflow', { step, value, currency: cur });
    }
    if (state.carry < 0) state.carry = 0;          // epsilon can leave -1e-17
    for (let i = 0; i < steps; i += 1) {
      logEvent(TOTAL_ADS_REVENUE_EVENT, {
        value: step,
        currency: cur,
        ad_format: info.format,
      });
    }

    // 3) Daily LTV tiers — cheapest first, each at most once per day.
    state.total += value;
    const thresholds = thresholdsFor(cfg, cur, deviceRegion());
    let tierFired = false;
    for (const tier of AD_LTV_TIERS) {
      const t = thresholds[tier];
      if (typeof t !== 'number') continue;          // null/absent → disabled
      if (state.fired.includes(tier)) continue;
      // Same epsilon rationale as the step loop: 0.1+0.1+0.1 is 0.30000000000000004
      // and its mirror image lands just under. Without slack the day's LAST
      // impression can permanently lose a tier.
      if (state.total + Math.abs(t) * 1e-9 < t) continue;
      state.fired.push(tier);
      tierFired = true;
      logEvent(AD_LTV_EVENT_NAME[tier], {
        value: state.total,
        currency: cur,
        threshold: t,
      });
    }

    // A tier is once-per-day and irreversible, so its record must survive a
    // kill that lands inside the debounce window — otherwise the tier fires
    // again after relaunch and Google Ads learns a duplicated signal.
    if (tierFired) flushPersist();
    else persistSoon();
  } catch { /* never let analytics break an ad callback */ }
}

/** Test seam. `hydrated` stays false so a test can reproduce the pre-load
 *  window; call initAdRevenue() to leave it. */
export function __resetAdRevenueForTest(): void {
  state = freshDay(localDay(), '');
  loading = null;
  hydrated = false;
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
}

/** Test seam — simulates the app being backgrounded. */
export function __flushForTest(): void {
  flushPersist();
}

/** Test/debug read-only view of the accumulators. */
export function __getAdRevenueState(): Readonly<DayState> {
  return state;
}
