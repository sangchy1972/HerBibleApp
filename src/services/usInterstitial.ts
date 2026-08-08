// ─────────────────────────────────────────────────────────────────────────────
// US-user interstitial request state machine (hardened).
//
// Implements the "美国用户 · 插页广告请求状态机" spec: a 2-tier window slides over a
// manual-eCPM ladder (HB_int_splash_2..25, floors $40..$500), climbing when the top
// tier fills and descending only when both tiers REAL-no-fill 3× in a row. unit0
// (no floor) is an always-on safety net; unit1 ($300) is a new-user top probe with a
// same-day circuit breaker. Daily start = average of yesterday's first 3 impression
// eCPMs; brand-new users run Phase 0 (unit0 + unit1) until the first shown ad's value
// V establishes the window.
//
// Design notes (see docs/ad-waterfall-US.md for the full ruleset):
//  • Request engine is TICKER-DRIVEN: a 1s tick calls pump(), which (re)issues only
//    the requests currently wanted, each gated by a per-unit `nextAt` backoff clock.
//    There are no zero-delay re-requests and no busy loops.
//  • No-fill is split: a NETWORK error (poor connectivity / timeout) backs off and
//    retries the SAME unit without ever moving the window or counting toward the
//    3-strike rule; a REAL no-fill (no inventory at that price) counts toward the
//    window logic exactly as the spec describes.
//  • Crash/leak safety: show() promise rejections are caught; cached ads carry a
//    load timestamp and are evicted at ~50 min (AdMob ads expire at 1h); every
//    dropped ad is torn down; an `epoch` guard ignores stale load callbacks from a
//    previous day; a stop path clears everything when ads are removed.
//
// Region gating lives in ads.ts (US only for now). Native ad classes + the
// ads-removed getter are injected to avoid a circular import.
// ─────────────────────────────────────────────────────────────────────────────

import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from './firebase';
import { setInterstitialVisible } from './interstitialVisibility';
import { onAdPaid, normalizeValue } from './adRevenue';
import { MIN_AD_INTERVAL_MS } from '../constants/adPacing';

// ── Constants (spec §0) ──────────────────────────────────────────────────────
const PUB = 'ca-app-pub-4656643588243987';

// idx → AdMob interstitial unit suffix, PER PLATFORM. iOS and Android unit IDs
// are NOT interchangeable — each lives under its own platform App ID (app.json
// androidAppId / iosAppId). The ladder is selected by Platform.OS at RUNTIME, so
// the SAME JS bundle ships in both the AAB and the IPA and each binary
// automatically requests its own set — there's no build-time switch to get
// wrong. Both ladders are index-aligned by eCPM floor:
//   0 = no-floor safety net · 1 = $300 new-user probe · 2…25 = $40…$500.
// Android = HB_int_splash_0…25 ; iOS = HB_ios_splash_00…25.
const ANDROID_SUFFIX: string[] = [
  '3482477831', // 0  no floor · safety net
  '7490462459', // 1  $300 · new-user top probe
  '8088924338', // 2  $40
  '7843861841', // 3  $60
  '1388088535', // 4  $80
  '8847472238', // 5  $100
  '4806634966', // 6  $120
  '6221308891', // 7  $140
  '7458368943', // 8  $160
  '1854992392', // 9  $180
  '5010783513', // 10 $200
  '5418399088', // 11 $220
  '3697701843', // 12 $240
  '4105317418', // 13 $260
  '2792235742', // 14 $280
  '2903494925', // 15 $300
  '8375313451', // 16 $320
  '5749150119', // 17 $340
  '9085759893', // 18 $360
  '3192902443', // 19 $380
  '9305251745', // 20 $400
  '3496154776', // 21 $420
  '6132714959', // 22 $440
  '1879820771', // 23 $460
  '7992170076', // 24 $480
  '6679088408', // 25 $500
];
// iOS units (HB_ios_splash_00 … _25) — created under the iOS App ID. These are
// the US-ladder units only; non-US iOS traffic uses a SEPARATE dedicated unit
// (ads.ts REAL_INTERSTITIAL_UNIT_ID.ios = HB_ios_splash_ww_00) so it never
// pollutes idx-0's stats — same split as Android.
const IOS_SUFFIX: string[] = [
  '9512513187', // 0  no floor · safety net
  '7128278021', // 1  $300 · new-user top probe
  '9525165051', // 2  $40
  '8212083387', // 3  $60
  '5815196351', // 4  $80
  '1781984941', // 5  $100
  '9468903270', // 6  $120
  '8627016351', // 7  $140
  '5202355204', // 8  $160
  '7313934680', // 9  $180
  '4461428682', // 10 $200
  '7359090158', // 11 $220
  '9522183676', // 12 $240
  '9929413171', // 13 $260
  '6896020332', // 14 $280
  '5582938666', // 15 $300
  '1643693655', // 16 $320
  '2925021129', // 17 $340
  '1393401895', // 18 $360
  '2765203630', // 19 $380
  '8356441665', // 20 $400
  '6512876953', // 21 $420
  '5199795283', // 22 $440
  '5443337860', // 23 $460
  '5008223593', // 24 $480
  '4130256191', // 25 $500
];
const UNIT_SUFFIX: string[] = Platform.OS === 'ios' ? IOS_SUFFIX : ANDROID_SUFFIX;
const UNIT_IDS = UNIT_SUFFIX.map(s => `${PUB}/${s}`);

const MIN_IDX = 2;            // lowest ladder tier ($40)
const MAX_IDX = 25;           // highest ladder tier ($500)
const CACHE_TARGET = 2;       // keep 2 ads ready to show
const NOFILL_LIMIT = 3;       // consecutive REAL no-fills before a tier is exhausted
const STAGGER_MS = 500;       // gap between first lo and hi request
const UNIT0_EMPTY_DELAY_MS = 3000;
const TICK_MS = 1000;
const EXPIRY_MS = 50 * 60 * 1000;   // evict cached ads before AdMob's ~1h expiry
const FLOOR_COOLDOWN_MS = 8000;     // pause when even $40 can't fill (avoid floor loop)
// AdMob paid value is dollars-per-impression (1e-6 × valueMicros). The ladder
// floors are eCPM (per-1000). eCPM = perImpression × 1000.
const ECPM_PER_IMPRESSION = 1000;
// Global floor between any two interstitials (also the nav-trigger's 60s cooldown).
const MIN_INTERVAL_MS = MIN_AD_INTERVAL_MS;   // shared — see constants/adPacing

const STORAGE_KEY = 'us:ad:state:v1';

// ── Pure helpers (exported for tests) ────────────────────────────────────────
export interface AdWindow { lo: number; hi: number | null }

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Ladder eCPM floor for a tier index. unit0 = 0 (no floor), unit1 = $300. */
export function floorOf(idx: number): number {
  if (idx === 0) return 0;
  if (idx === 1) return 300;
  return 20 * idx;
}

/** Spec §1: lo = clamp(⌊V/20⌋ + 1, 2, 25). V is eCPM dollars. */
export function startIndexFromValue(vEcpm: number): number {
  const k = Math.floor(vEcpm / 20);
  return clamp(k + 1, MIN_IDX, MAX_IDX);
}

/** Build a 2-tier window from a low index; hi collapses to null at the cap. */
export function makeWindow(lo: number): AdWindow {
  const L = clamp(lo, MIN_IDX, MAX_IDX);
  return { lo: L, hi: L + 1 <= MAX_IDX ? L + 1 : null };
}

/** Spec §6 climb: top tier filled → window shifts up one → { hi, hi+1 }. */
export function climbWindow(w: AdWindow): AdWindow {
  if (w.hi == null) return w;          // already at cap
  return makeWindow(w.hi);
}

/** Spec §6 descend-both: both tiers exhausted → drop two → { lo-2, lo-1 }. */
export function descendBoth(w: AdWindow): AdWindow {
  return makeWindow(w.lo - 2);
}

/** Spec §6 top-fails-floor-holds: drop one → { lo-1, lo }. */
export function descendOne(w: AdWindow): AdWindow {
  return makeWindow(w.lo - 1);
}

// ── Backoff (pure bases exported for tests; jitter applied at call sites) ─────
/** Network/timeout backoff base: 5s,10s,20s,40s … capped 60s. */
export function netBackoffBase(attempt: number): number {
  return Math.min(5000 * 2 ** Math.max(0, attempt - 1), 60000);
}
/** unit0 safety-net backoff base: 3s,6s … capped 10s (per product decision). */
export function unit0BackoffBase(attempt: number): number {
  return Math.min(3000 * 2 ** Math.max(0, attempt - 1), 10000);
}
/** Delay between the up-to-3 same-tier real-no-fill retries: 2s, 4s. */
export function ladderRetryBase(attempt: number): number {
  return 2000 * Math.max(1, attempt);
}
function jitter(ms: number): number { return Math.round(ms * (0.8 + Math.random() * 0.4)); }

/** True if a load error is connectivity-related (vs a real no-fill). */
export function isNetworkError(e: any): boolean {
  const s = String(e?.code ?? e?.message ?? '').toLowerCase();
  return s.includes('network') || s.includes('timeout');
}

// ── Injected native deps (set by startUsController) ──────────────────────────
interface Deps {
  Interstitial: any;           // InterstitialAd class
  AdEventType: any;            // AdEventType enum
  isAdsRemoved: () => boolean;
}
let deps: Deps | null = null;

// ── Runtime state (spec §2) ──────────────────────────────────────────────────
interface Slot { idx: number; ad: any; loadedAt: number }
let started = false;
let day = '';
let win: AdWindow = makeWindow(MIN_IDX);
let established = false;                  // do we have a real window yet (vs Phase 0)
let epoch = 0;                            // bumped on every reset; stale callbacks bail
const noFill: Record<number, number> = {};   // consecutive REAL no-fill (window logic)
const attempts: Record<number, number> = {}; // consecutive errors of ANY kind (backoff)
const nextAt: Record<number, number> = {};   // earliest ms we may (re)request idx
let cache: Slot[] = [];
const inFlight = new Map<number, any>();
let unit1NoFill = 0;
let unit1Blocked = false;
let todayImpr: number[] = [];             // today's shown eCPM values, in order
let yesterdayImpr: number[] = [];
let emptySince: number | null = null;
let lastShownAt = 0;
let showing = false;
let ticker: any = null;

function adsOff(): boolean { return !deps || deps.isAdsRemoved(); }

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function persist(): void {
  const snap = { day, impr: todayImpr, unit1Blocked, unit1NoFill, window: win, established };
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snap)).catch(() => {});
}

// ── Cache / lifecycle helpers ────────────────────────────────────────────────
function tierActive(idx: number): boolean {
  return inFlight.has(idx) || cache.some(s => s.idx === idx);
}
function isCached(idx: number): boolean { return cache.some(s => s.idx === idx); }
function cacheFull(): boolean { return cache.length >= CACHE_TARGET; }

function evictExpired(): void {
  const now = Date.now();
  if (cache.length === 0) return;
  const keep: Slot[] = [];
  for (const s of cache) {
    if (now - s.loadedAt >= EXPIRY_MS) { try { s.ad.__cleanup?.(); } catch {} }
    else keep.push(s);
  }
  cache = keep;
}

/** Tear down every cached + in-flight ad and bump the epoch so their pending
 *  callbacks become no-ops. Used on day reset / resume / stop. */
function teardownAll(): void {
  epoch++;
  for (const s of cache) { try { s.ad.__cleanup?.(); } catch {} }
  for (const ad of inFlight.values()) { try { ad.__cleanup?.(); } catch {} }
  cache = [];
  inFlight.clear();
}

/**
 * PAID handler for a ladder ad. Owns BOTH jobs the callback has to do:
 *   • the ladder's own bookkeeping (today's eCPM samples, first-impression
 *     window bootstrap) — previously inline in usOnShowOpportunity;
 *   • forwarding into the shared ILAR funnel.
 *
 * The whole body is wrapped: `persist()` touches AsyncStorage, which throws
 * synchronously when the native module is missing, and an exception escaping a
 * native ad callback is unrecoverable.
 */
function attachLadderPaid(ad: any, idx: number, myEpoch: number): void {
  try {
    if (!deps?.AdEventType?.PAID) return;
    let paidSeen = false;
    ad.addAdEventListener(deps.AdEventType.PAID, (e: any) => {
      try {
        if (paidSeen) return;
        paidSeen = true;
        // Same normalisation as the funnel: a locale-comma value ("0,004")
        // must not read as 0 here while being recovered there, or the ladder
        // would bootstrap its window from a bogus floor.
        const v = normalizeValue(e?.value);
        const vEcpm = v * ECPM_PER_IMPRESSION;
        logEvent('ad_paid', { value: v, ecpm: vEcpm, currency: String(e?.currency ?? ''), unit_idx: idx, precision: String(e?.precision ?? '') });
        // The MONEY is always real, whatever the ladder's state — report it
        // unconditionally.
        onAdPaid({
          value: e?.value,
          currency: e?.currency,
          precision: e?.precision,
          format: 'interstitial',
          adUnitName: `us_ladder_${String(idx).padStart(2, '0')}`,
        });
        // The LADDER's bookkeeping is only meaningful while this ad still
        // belongs to the current epoch. Because PAID can arrive after dismiss,
        // it can also arrive after a day rollover or stopUsController() — at
        // which point a stale eCPM would seed the new day's first-3 average and
        // could set `established`/`win` from yesterday's value. LOADED/ERROR
        // already guard this way; PAID must too.
        if (myEpoch !== epoch || adsOff()) return;
        todayImpr.push(vEcpm);
        if (!established) {                    // first real impression sets the window
          established = true;
          win = makeWindow(startIndexFromValue(vEcpm));
          resetWindowCounts();
          firstStagger();
        }
        persist();
      } catch { /* never throw out of an ad callback */ }
    });
  } catch { /* older client without PAID → ladder still serves ads */ }
}

// ── Request / load lifecycle (spec §5) ───────────────────────────────────────
function request(idx: number): void {
  if (adsOff() || !deps?.Interstitial) return;
  if (!UNIT_IDS[idx]) return;                          // guard against bad index
  if (tierActive(idx)) return;                         // never double-load a unit
  if (Date.now() < (nextAt[idx] || 0)) return;         // backoff gate
  let ad: any;
  try { ad = deps.Interstitial.createForAdRequest(UNIT_IDS[idx], {}); } catch { return; }
  const myEpoch = epoch;
  const subs: Array<() => void> = [];
  const cleanup = () => { subs.forEach(u => { try { u(); } catch {} }); };
  (ad).__cleanup = cleanup;
  inFlight.set(idx, ad);
  try {
    subs.push(ad.addAdEventListener(deps.AdEventType.LOADED, () => {
      inFlight.delete(idx);
      if (myEpoch !== epoch) { cleanup(); return; }    // stale (day rolled) → drop
      onFill(idx, ad);
    }));
    subs.push(ad.addAdEventListener(deps.AdEventType.ERROR, (e: any) => {
      inFlight.delete(idx);
      cleanup();
      if (myEpoch !== epoch) return;                   // stale → ignore
      onError(idx, e);
    }));
    // Impression-level revenue. Bound HERE, at creation, and deliberately NOT
    // added to `subs` — so it survives the cleanup() that runs on CLOSED. Some
    // mediation adapters deliver PAID *after* the ad is dismissed, and the
    // library drops an event with no live listener; tearing this down on close
    // silently lost that revenue, and on this path it is the highest-floor
    // (most valuable) inventory in the app. Subscribed last + guarded so an
    // older client without AdEventType.PAID can't abort the whole request.
    attachLadderPaid(ad, idx, myEpoch);
    ad.load();
    // Unit-level request observability: AdMob's per-unit console stats lag by
    // hours, which makes the waterfall look dead while it's actually in
    // Phase 0. This shows up in Firebase DebugView within minutes. Volume is
    // modest — a handful per session (backoff clocks gate re-requests).
    logEvent('us_ad_request', { unit_idx: idx, floor: floorOf(idx), established: established ? 1 : 0, win_lo: win.lo, win_hi: win.hi ?? -1 });
  } catch { inFlight.delete(idx); }
}

function onFill(idx: number, ad: any): void {
  noFill[idx] = 0;
  attempts[idx] = 0;
  nextAt[idx] = 0;
  cache.push({ idx, ad, loadedAt: Date.now() });
  emptySince = null;
  if (idx !== 0 && idx !== 1 && win.hi != null && idx === win.hi) {
    win = climbWindow(win);                            // top tier filled → climb
    resetWindowCounts();
    persist();
  }
  pump();
}

function onError(idx: number, e: any): void {
  attempts[idx] = (attempts[idx] || 0) + 1;
  const net = isNetworkError(e);

  if (idx === 0) {                                      // safety net: backoff, no window logic
    nextAt[0] = Date.now() + jitter(unit0BackoffBase(attempts[0]));
    return;                                            // ticker/pump will retry when due
  }
  if (idx === 1) {                                      // new-user probe
    if (net) {
      nextAt[1] = Date.now() + jitter(netBackoffBase(attempts[1]));
    } else {
      unit1NoFill += 1;
      if (unit1NoFill >= NOFILL_LIMIT) { unit1Blocked = true; persist(); }
      else nextAt[1] = Date.now() + jitter(ladderRetryBase(unit1NoFill));
    }
    return;
  }

  // Ladder tier.
  if (net) {
    nextAt[idx] = Date.now() + jitter(netBackoffBase(attempts[idx]));   // never moves window
  } else {
    noFill[idx] = (noFill[idx] || 0) + 1;
    if (noFill[idx] < NOFILL_LIMIT) {
      nextAt[idx] = Date.now() + jitter(ladderRetryBase(noFill[idx]));
    } else {
      // Hold the exhausted tier off FIRST: if onTierExhausted can't move the
      // window yet (the other slot is still trying), the ticker would otherwise
      // re-request this unit every second with no backoff. A window move
      // overwrites this via resetWindowCounts/coolWindow.
      nextAt[idx] = Date.now() + jitter(FLOOR_COOLDOWN_MS);
      onTierExhausted(idx);
    }
  }
  pump();
}

function onTierExhausted(idx: number): void {
  const loFail = (noFill[win.lo] || 0) >= NOFILL_LIMIT;
  const hiFail = win.hi == null ? true : (noFill[win.hi] || 0) >= NOFILL_LIMIT;
  if (loFail && hiFail) {
    const before = win.lo;
    win = descendBoth(win);
    if (win.lo === before) coolWindow(FLOOR_COOLDOWN_MS);   // already at the floor → pause
    else resetWindowCounts();
    persist();
  } else if (win.hi != null && idx === win.hi && isCached(win.lo)) {
    win = descendOne(win);
    resetWindowCounts();
    persist();
  }
  // else: the other slot is still trying — leave the window where it is.
}

/** Clear the no-fill / backoff counters for the current window's tiers so they
 *  are immediately eligible again. */
function resetWindowCounts(): void {
  for (const t of [win.lo, win.hi]) {
    if (t == null) continue;
    noFill[t] = 0; attempts[t] = 0; nextAt[t] = 0;
  }
}

/** Like resetWindowCounts but holds the tiers off for `ms` (floor cooldown). */
function coolWindow(ms: number): void {
  const until = Date.now() + ms;
  for (const t of [win.lo, win.hi]) {
    if (t == null) continue;
    noFill[t] = 0; attempts[t] = 0; nextAt[t] = until;
  }
}

// ── Request planning ─────────────────────────────────────────────────────────
/** Maintain emptySince and (re)issue exactly the requests we currently want.
 *  Idempotent + fully gated, so it's safe to call from the ticker or any event. */
function pump(): void {
  if (adsOff()) return;
  evictExpired();
  if (cache.length === 0) { if (emptySince == null) emptySince = Date.now(); }
  else emptySince = null;

  if (!established) {                                   // Phase 0 — brand-new user
    if (!cacheFull()) {
      request(0);
      if (!unit1Blocked) request(1);
    }
  } else {
    if (!cacheFull()) {
      request(win.lo);
      if (win.hi != null) request(win.hi);
    }
  }
  // Safety net (spec §7): cache empty ≥3s → also drive unit0 (additive).
  if (cache.length === 0 && emptySince != null && Date.now() - emptySince >= UNIT0_EMPTY_DELAY_MS) {
    request(0);
  }
}

/** First request of a fresh window: lo now, hi after STAGGER_MS. */
function firstStagger(): void {
  nextAt[win.lo] = 0;
  if (win.hi != null) nextAt[win.hi] = Date.now() + STAGGER_MS;
  pump();
  if (win.hi != null) setTimeout(() => pump(), STAGGER_MS);   // pump re-reads state → race-free
}

/** Bootstrap a window from a shown ad when PAID never delivered V (H3 fallback). */
function bootstrapFromShow(idx: number): void {
  established = true;
  win = makeWindow(startIndexFromValue(floorOf(idx)));
  resetWindowCounts();
  firstStagger();
  persist();
}

// ── Day lifecycle (spec §3) ──────────────────────────────────────────────────
function resetDailyState(): void {
  teardownAll();
  for (const k of Object.keys(noFill)) delete noFill[Number(k)];
  for (const k of Object.keys(attempts)) delete attempts[Number(k)];
  for (const k of Object.keys(nextAt)) delete nextAt[Number(k)];
  unit1NoFill = 0;
  unit1Blocked = false;
  established = false;
  emptySince = null;
  showing = false;
  setInterstitialVisible(false);
  todayImpr = [];
}

function onDayStart(): void {
  resetDailyState();
  if (yesterdayImpr.length > 0) {
    const first3 = yesterdayImpr.slice(0, 3);          // §3: first 3, not last
    const avg = first3.reduce((a, b) => a + b, 0) / first3.length;
    win = makeWindow(startIndexFromValue(avg));
    established = true;
    firstStagger();
  } else {
    win = makeWindow(MIN_IDX);
    established = false;
    pump();                                            // Phase 0
  }
  persist();
}

/** Resume the SAME day after an app restart: window + flags survive, cache doesn't. */
function resumeDay(p: any): void {
  teardownAll();
  for (const k of Object.keys(noFill)) delete noFill[Number(k)];
  for (const k of Object.keys(attempts)) delete attempts[Number(k)];
  for (const k of Object.keys(nextAt)) delete nextAt[Number(k)];
  todayImpr = Array.isArray(p.impr) ? p.impr : [];
  unit1Blocked = !!p.unit1Blocked;
  unit1NoFill = p.unit1NoFill || 0;
  established = !!p.established;
  const lo = p.window && typeof p.window.lo === 'number' ? clamp(p.window.lo, MIN_IDX, MAX_IDX) : MIN_IDX;
  win = makeWindow(lo);                                 // rebuilt → never trusts a corrupt hi
  emptySince = null;
  showing = false;
  setInterstitialVisible(false);
  if (established) firstStagger();
  else pump();
}

function ensureDay(): void {
  const today = ymd();
  if (day === today) return;
  if (day) yesterdayImpr = todayImpr.slice();           // the day we leave → yesterday
  day = today;
  onDayStart();
}

function tick(): void {
  if (adsOff()) return;
  ensureDay();
  pump();
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function startUsController(injected: Deps): Promise<void> {
  if (started || !injected.Interstitial) return;
  started = true;
  deps = injected;
  let p: any = null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) p = JSON.parse(raw);
  } catch { /* default: fresh */ }
  const today = ymd();
  if (p && p.day === today) {
    day = today;
    resumeDay(p);                                       // same-day restart
  } else {
    if (p && Array.isArray(p.impr)) yesterdayImpr = p.impr;   // previous day → yesterday
    day = today;
    onDayStart();
  }
  if (ticker == null) ticker = setInterval(tick, TICK_MS);
}

/** Tear everything down — called when the user removes ads (IAP). */
export function stopUsController(): void {
  if (ticker != null) { clearInterval(ticker); ticker = null; }
  teardownAll();
  showing = false;
  setInterstitialVisible(false);
  started = false;
}

export function isUsControllerActive(): boolean {
  return started && !adsOff();
}

/**
 * Show opportunity (spec §8): show the highest-floor cached ad, capture its paid
 * value into today's impressions (establishing the window on the first show for a
 * brand-new user — or, if PAID never fires, bootstrapping on close), then refill.
 * Returns true if a show was initiated.
 */
export function usOnShowOpportunity(placement: 'prayer_end' | 'gospel_end' | 'plan_end' | 'quiz_retry' | 'nav' | 'app_open' | 'unknown' = 'unknown'): boolean {
  if (adsOff()) return false;
  ensureDay();
  if (showing) return false;
  if (AppState.currentState !== 'active') return false;            // never show off-foreground
  if (Date.now() - lastShownAt < MIN_INTERVAL_MS) return false;   // frequency cap
  evictExpired();
  if (cache.length === 0) { pump(); return false; }

  // Show priority is the inverse of request order: highest floor first.
  cache.sort((a, b) => floorOf(b.idx) - floorOf(a.idx));
  const slot = cache.shift()!;
  let offOpened = () => {};
  let offClosed = () => {};
  // NOTE: the PAID listener is bound in request(), lives on the ad object, and
  // is intentionally NOT torn down here — a post-dismiss PAID must still land.
  const cleanup = () => {
    try { offOpened(); } catch {}
    try { offClosed(); } catch {}
    try { slot.ad.__cleanup?.(); } catch {}
  };
  try {
    offOpened = slot.ad.addAdEventListener(deps!.AdEventType.OPENED, () => {
      try {
        lastShownAt = Date.now();                        // real present → start the cap clock
        logEvent('ad_impression_custom', { format: 'interstitial', placement, unit_idx: slot.idx, floor: floorOf(slot.idx) });
      } catch { /* never throw out of an ad callback */ }
    });
    offClosed = slot.ad.addAdEventListener(deps!.AdEventType.CLOSED, () => {
      try {
        showing = false;
        setInterstitialVisible(false);
        // `established` is set by the PAID handler; if PAID never arrived we
        // still need a window, hence the fallback.
        if (!established) bootstrapFromShow(slot.idx);    // H3 fallback
        cleanup();
        pump();                                          // top the cache back up
      } catch { /* never throw out of an ad callback */ }
    });
    showing = true;
    setInterstitialVisible(true);
    const r = slot.ad.show();                            // throws synchronously if not loaded
    if (r && typeof r.then === 'function') {
      r.then(() => {}).catch(() => { showing = false; setInterstitialVisible(false); cleanup(); pump(); });   // C1: never unhandled
    }
    return true;
  } catch {
    showing = false;
    setInterstitialVisible(false);
    cleanup();
    pump();
    return false;
  }
}
