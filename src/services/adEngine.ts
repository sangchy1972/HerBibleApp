// ─────────────────────────────────────────────────────────────────────────────
// Android interstitial request engine — ad-request spec v1.0 (2026-08-05).
//
// Resident from ads init: a 1s ticker keeps a 2-slot cache warm at all times.
// EVERY request decision re-runs the full determination — layer (new / blended
// / old user), region (US / T2 / WW), unit selection — from live state; nothing
// about a previous determination is cached, so a user who crosses a boundary
// mid-session (2nd paid event lands, day rolls over) is re-routed on the very
// next cycle with no seams.
//
// LAYERS (adLadders.planLayers is the pure source of truth):
//   imps < 2            newbie(5s) + probe(20s, 3 no-fills → day breaker)
//                       + region net, ALWAYS requesting (3s)
//   imps ≥ 2, day ≤ 2   newbie(5s) + primary(30s, 6 → day breaker)
//                       + secondary(3s, first send ≥3s after primary's)
//                       + net only while cache = 0
//   imps ≥ 2, day ≥ 3   same minus newbie
//
// MONEY: stored values are RAW per-impression USD; comparisons against ladder
// floors multiply by 1000 at the boundary (inside adLadders). Confirmed by the
// owner: two impressions of $0.10/$0.08 → target $117 eCPM → splash_6 ($120).
//
// CIRCUIT BREAKERS are per-unit, per-local-day. Only REAL no-fill counts —
// a network/timeout error retries the same unit with backoff and never trips a
// breaker (owner-confirmed), or one subway tunnel would kill the probe and
// primary for the rest of the day. A window move that lands on a NEW unit is
// unaffected by the old unit's breaker.
//
// SHOW priority — and cache keep/cancel priority — is by floor, highest first;
// the newbie unit (backend-dynamic floor) sits between real floors and the
// no-floor nets; no-floor is always last. Show timing itself stays owned by
// adFrequency.ts + the global gap in constants/adPacing, unchanged.
//
// LIVE UNITS ONLY, dev builds included (owner decision 2026-08-05; the ladder
// has no test-id equivalents). Debug devices must be registered as AdMob test
// devices — that keeps live unit ids but serves test creatives.
//
// iOS is deliberately untouched: it keeps the previous controller/preload
// paths in ads.ts / usInterstitial.ts until its own unit set arrives.
// ─────────────────────────────────────────────────────────────────────────────

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from './firebase';
import { setInterstitialVisible } from './interstitialVisibility';
import { onAdPaid, normalizeValue } from './adRevenue';
import { deviceRegion } from './deviceRegion';
import { MIN_AD_INTERVAL_MS } from '../constants/adPacing';
import {
  classifyRegion, planLayers, priorityOf, NEWBIE_UNIT, type AdUnit, type Region,
} from './adLadders';
import { adValueState, recordPaidValue } from './adValueStore';

// ── Cadence constants (owner-confirmed) ──────────────────────────────────────
const TICK_MS = 1000;
const CACHE_TARGET = 2;
const NEWBIE_GAP_MS = 5000;        // newbie: retry 5s after a no-fill
const NET_GAP_MS = 3000;           // nets + extra no-floor + secondary loop
const PROBE_GAP_MS = 20_000;       // probe: one attempt per 20s
const PRIMARY_GAP_MS = 30_000;     // primary: one attempt per 30s
const SECONDARY_AFTER_PRIMARY_MS = 3000;   // secondary first send ≥3s after primary's
const PROBE_BREAKER = 3;           // consecutive REAL no-fills → out for the day
const PRIMARY_BREAKER = 6;
const EXPIRY_MS = 50 * 60 * 1000;  // evict before AdMob's ~1h expiry
// The global floor lives in ONE place now (constants/adPacing) — it used to be
// re-typed here and in two other files, which is exactly the trap
// docs/ad-routing.md §4 warned about.
const MIN_INTERVAL_MS = MIN_AD_INTERVAL_MS;
const BREAKER_KEY = 'adEngine:day:v1';

type Placement = 'prayer_end' | 'gospel_end' | 'plan_end' | 'quiz_retry' | 'nav' | 'app_open' | 'onboarding_first' | 'unknown';

interface Deps {
  Interstitial: any;
  AdEventType: any;
  isAdsRemoved: () => boolean;
}

interface UnitState {
  inFlight: boolean;
  /** Consecutive REAL no-fills (breaker counter — probe/primary only). */
  noFill: number;
  /** Consecutive errors of any kind (network backoff exponent). */
  attempts: number;
  nextAt: number;
  /** Cache went full while this was in flight → drop the result on arrival. */
  abandoned: boolean;
}

interface Slot { unit: AdUnit; ad: any; loadedAt: number }

let deps: Deps | null = null;
let started = false;
let epoch = 0;
let ticker: ReturnType<typeof setInterval> | null = null;
let day = '';
let tripped = new Set<string>();               // unit names, reset at local midnight
const units = new Map<string, UnitState>();    // keyed by unit name
let cache: Slot[] = [];
let lastShownAt = 0;
let showing = false;
let lastPrimarySentAt = 0;
let routeLogged = false;

const adsOff = () => !deps || deps.isAdsRemoved();

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Install day, hydrated from the SAME key adFrequency owns ('ads:firstLaunchYmd')
// but read independently — importing installDayIndex from adFrequency would
// close an ads → adEngine → adFrequency → ads module cycle. Until the read
// lands (or on a genuinely fresh install, before adFrequency writes the key)
// this reports day 0, which errs toward the NEW-user flow — the safe direction.
let installYmd = '';
function dayIndexSync(): number {
  if (!installYmd) return 0;
  const a = new Date(installYmd + 'T00:00:00').getTime();
  const b = new Date(ymd() + 'T00:00:00').getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function stateOf(name: string): UnitState {
  let s = units.get(name);
  if (!s) { s = { inFlight: false, noFill: 0, attempts: 0, nextAt: 0, abandoned: false }; units.set(name, s); }
  return s;
}

function isNetworkError(e: any): boolean {
  const s = String(e?.code ?? e?.message ?? '').toLowerCase();
  return s.includes('network') || s.includes('timeout');
}
/** Network backoff: 5s, 10s, 20s, 40s… capped 60s, ±20% jitter. */
function netBackoff(attempt: number): number {
  const base = Math.min(5000 * 2 ** Math.max(0, attempt - 1), 60_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function currentRegion(): Region {
  const iso = deviceRegion();
  return classifyRegion(iso === 'US', iso);
}

function persistBreakers(): void {
  AsyncStorage.setItem(BREAKER_KEY, JSON.stringify({ day, tripped: [...tripped] })).catch(() => {});
}

function evictExpired(): void {
  if (cache.length === 0) return;
  const now = Date.now();
  const keep: Slot[] = [];
  for (const s of cache) {
    if (now - s.loadedAt >= EXPIRY_MS) { try { s.ad.__cleanup?.(); } catch {} }
    else keep.push(s);
  }
  cache = keep;
}

function teardownAll(): void {
  epoch += 1;
  for (const s of cache) { try { s.ad.__cleanup?.(); } catch {} }
  cache = [];
  for (const s of units.values()) { s.inFlight = false; s.abandoned = false; }
}

function ensureDay(): void {
  const today = ymd();
  if (day === today) return;
  day = today;
  tripped = new Set();
  for (const s of units.values()) { s.noFill = 0; s.attempts = 0; s.nextAt = 0; }
  persistBreakers();
}

// ── The desired-request planner, re-run every cycle ─────────────────────────
interface Desired {
  unit: AdUnit;
  gapMs: number;
  breakerLimit: number | null;
  /** 'probe' | 'primary' get request-level analytics; the fast loops don't. */
  kind: 'newbie' | 'probe' | 'primary' | 'secondary' | 'net' | 'extra';
}

function desiredRequests(): Desired[] {
  const region = currentRegion();
  const vs = adValueState();
  const plan = planLayers(region, dayIndexSync(), vs.imps, vs.last3);
  const out: Desired[] = [];
  if (plan.newbie) out.push({ unit: NEWBIE_UNIT, gapMs: NEWBIE_GAP_MS, breakerLimit: null, kind: 'newbie' });
  if (plan.probe) out.push({ unit: plan.probe, gapMs: PROBE_GAP_MS, breakerLimit: PROBE_BREAKER, kind: 'probe' });
  if (plan.primary) out.push({ unit: plan.primary, gapMs: PRIMARY_GAP_MS, breakerLimit: PRIMARY_BREAKER, kind: 'primary' });
  if (plan.secondary) out.push({ unit: plan.secondary, gapMs: NET_GAP_MS, breakerLimit: null, kind: 'secondary' });
  if (plan.extraNoFloor) out.push({ unit: plan.extraNoFloor, gapMs: NET_GAP_MS, breakerLimit: null, kind: 'extra' });
  if (plan.netAlwaysOn || cache.length === 0) {
    out.push({ unit: plan.net, gapMs: NET_GAP_MS, breakerLimit: null, kind: 'net' });
  }
  return out;
}

// ── Request lifecycle ────────────────────────────────────────────────────────
function cacheFull(): boolean { return cache.length >= CACHE_TARGET; }
function isCached(name: string): boolean { return cache.some(s => s.unit.name === name); }

/** Cache just went full → the lowest-priority in-flight request is abandoned:
 *  its result is dropped on arrival and it is not re-issued while full. (The
 *  RN library has no cancel API — owner-accepted.) */
function abandonLowestInFlight(): void {
  let lowest: { name: string; prio: number } | null = null;
  for (const d of desiredRequests()) {
    const s = units.get(d.unit.name);
    if (!s?.inFlight || s.abandoned) continue;
    const prio = priorityOf(d.unit);
    if (!lowest || prio < lowest.prio) lowest = { name: d.unit.name, prio };
  }
  if (lowest) stateOf(lowest.name).abandoned = true;
}

function attachPaid(ad: any, unit: AdUnit): void {
  try {
    if (!deps?.AdEventType?.PAID) return;
    let paidSeen = false;
    ad.addAdEventListener(deps.AdEventType.PAID, (e: any) => {
      try {
        if (paidSeen) return;
        paidSeen = true;
        const v = normalizeValue(e?.value);      // RAW per-impression USD
        // ⑤-1 atomic write-back: window, count, max, ltv — one update, so the
        // very next opportunity reads a consistent snapshot.
        recordPaidValue(v);
        // The buy-side event (owner: it must carry TRUE revenue, so it fires on
        // PAID, not on show — value arrives seconds after the impression).
        logEvent('ad_impression_custom', {
          format: 'interstitial',
          placement: (ad.__placement as string) ?? 'pending',
          unit: unit.name,
          floor: unit.floor,
          value: v,
          currency: String(e?.currency ?? ''),
          precision: String(e?.precision ?? ''),
        });
        // The shared ILAR funnel (Total_Ads_Revenue_001 / AdLTV tiers).
        onAdPaid({
          value: e?.value, currency: e?.currency, precision: e?.precision,
          format: 'interstitial', adUnitName: unit.name,
        });
      } catch { /* never throw out of an ad callback */ }
    });
  } catch { /* older client without PAID — ads still serve */ }
}

function request(d: Desired): void {
  if (adsOff() || !deps?.Interstitial) return;
  const s = stateOf(d.unit.name);
  if (s.inFlight || isCached(d.unit.name)) return;
  if (Date.now() < s.nextAt) return;
  if (d.breakerLimit != null && tripped.has(d.unit.name)) return;
  if (s.abandoned && cacheFull()) return;
  s.abandoned = false;

  let ad: any;
  try { ad = deps.Interstitial.createForAdRequest(d.unit.id, {}); } catch { return; }
  const myEpoch = epoch;
  const subs: Array<() => void> = [];
  const cleanup = () => { subs.forEach(u => { try { u(); } catch {} }); };
  ad.__cleanup = cleanup;
  s.inFlight = true;
  if (d.kind === 'primary') lastPrimarySentAt = Date.now();

  try {
    subs.push(ad.addAdEventListener(deps.AdEventType.LOADED, () => {
      const st = stateOf(d.unit.name);
      st.inFlight = false;
      if (myEpoch !== epoch) { cleanup(); return; }
      st.noFill = 0; st.attempts = 0; st.nextAt = Date.now() + d.gapMs;
      // Full-cache arrivals only bump the WORST slot if they beat it — so a
      // probe fill racing in behind two quick net fills still lands (the net
      // gets evicted), while a net arriving behind two ladder fills is simply
      // dropped. `abandoned` alone doesn't matter here: if a slot has freed up
      // since the flag was set, a fill in hand is worth keeping.
      if (cacheFull()) {
        const worst = [...cache].sort((a, b) => priorityOf(a.unit) - priorityOf(b.unit))[0];
        if (worst && priorityOf(d.unit) > priorityOf(worst.unit)) {
          cache = cache.filter(x => x !== worst);
          try { worst.ad.__cleanup?.(); } catch {}
        } else {
          st.abandoned = false;
          cleanup();
          return;
        }
      }
      st.abandoned = false;
      cache.push({ unit: d.unit, ad, loadedAt: Date.now() });
      if (cacheFull()) abandonLowestInFlight();
    }));
    subs.push(ad.addAdEventListener(deps.AdEventType.ERROR, (e: any) => {
      const st = stateOf(d.unit.name);
      st.inFlight = false;
      cleanup();
      if (myEpoch !== epoch) return;
      st.attempts += 1;
      if (isNetworkError(e)) {
        // Connectivity — backoff, retry the SAME unit, never counts toward a
        // breaker (owner-confirmed).
        st.nextAt = Date.now() + Math.max(d.gapMs, netBackoff(st.attempts));
        return;
      }
      st.nextAt = Date.now() + d.gapMs;
      if (d.breakerLimit != null) {
        st.noFill += 1;
        if (st.noFill >= d.breakerLimit) {
          tripped.add(d.unit.name);
          persistBreakers();
          logEvent('ad_breaker', { unit: d.unit.name, kind: d.kind, strikes: st.noFill });
        }
      }
    }));
    // PAID at creation, NOT in `subs`: it must survive the CLOSED cleanup —
    // some mediation adapters deliver revenue after dismiss.
    attachPaid(ad, d.unit);
    ad.load();
    // Request observability for the SLOW layers only (20s/30s pacing, breaker
    // bounded). The secondary/newbie/net loops run every 3-5s on no-fill —
    // logging those would flood analytics for zero insight.
    if (d.kind === 'probe' || d.kind === 'primary') {
      logEvent('ad_request', { unit: d.unit.name, kind: d.kind, floor: d.unit.floor });
    }
  } catch { s.inFlight = false; }
}

function pump(): void {
  if (adsOff()) return;
  ensureDay();
  evictExpired();
  if (cacheFull()) return;
  const now = Date.now();
  const desired = desiredRequests();
  const primaryDesired = desired.find(x => x.kind === 'primary');
  for (const d of desired) {
    // Secondary waits for the primary's first send (+3s, owner-confirmed) —
    // unless the primary is breaker-tripped or absent, in which case it runs on
    // its own ("熔断后当日剩余时间只跑副层 + 安全网").
    if (d.kind === 'secondary') {
      const primaryBlocked = !primaryDesired || tripped.has(primaryDesired.unit.name);
      if (!primaryBlocked && (lastPrimarySentAt === 0 || now < lastPrimarySentAt + SECONDARY_AFTER_PRIMARY_MS)) continue;
    }
    request(d);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function startAdEngine(injected: Deps): Promise<void> {
  if (started || !injected.Interstitial) return;
  started = true;
  deps = injected;
  try {
    const [rawBreakers, rawInstall] = await Promise.all([
      AsyncStorage.getItem(BREAKER_KEY).catch(() => null),
      AsyncStorage.getItem('ads:firstLaunchYmd').catch(() => null),
    ]);
    if (rawInstall) installYmd = rawInstall;
    const p = rawBreakers ? JSON.parse(rawBreakers) : null;
    if (p && p.day === ymd() && Array.isArray(p.tripped)) {
      day = p.day;
      tripped = new Set(p.tripped.filter((x: unknown) => typeof x === 'string'));
    }
  } catch { /* fresh day state */ }
  ensureDay();
  if (!routeLogged) {
    routeLogged = true;
    logEvent('ads_route', { region: currentRegion(), path: 'engine' });
  }
  pump();
  if (ticker == null) ticker = setInterval(pump, TICK_MS);
}

/** Torn down when the user buys remove-ads. */
export function stopAdEngine(): void {
  if (ticker != null) { clearInterval(ticker); ticker = null; }
  teardownAll();
  showing = false;
  setInterstitialVisible(false);
  started = false;
}

export function isAdEngineActive(): boolean {
  return started && !adsOff();
}

/**
 * Show the highest-priority cached ad. Timing gates (which placements fire,
 * the day tiers, nav counting) all stay in adFrequency.ts — this only enforces
 * foreground + the 60s global floor. `bypassInterval` is for the one-time
 * onboarding show, which still SETS lastShownAt so the next regular ad keeps
 * its distance.
 */
export function engineOnShowOpportunity(placement: Placement, bypassInterval = false): boolean {
  if (adsOff()) return false;
  ensureDay();
  if (showing) return false;
  if (AppState.currentState !== 'active') return false;
  if (!bypassInterval && Date.now() - lastShownAt < MIN_INTERVAL_MS) return false;
  evictExpired();
  if (cache.length === 0) { pump(); return false; }

  cache.sort((a, b) => priorityOf(b.unit) - priorityOf(a.unit));
  const slot = cache.shift()!;
  slot.ad.__placement = placement;      // read back by the PAID handler
  let offOpened = () => {};
  let offClosed = () => {};
  // PAID stays bound (attached at creation) — a post-dismiss PAID must land.
  const cleanup = () => {
    try { offOpened(); } catch {}
    try { offClosed(); } catch {}
    try { slot.ad.__cleanup?.(); } catch {}
  };
  try {
    offOpened = slot.ad.addAdEventListener(deps!.AdEventType.OPENED, () => {
      try { lastShownAt = Date.now(); } catch {}
    });
    offClosed = slot.ad.addAdEventListener(deps!.AdEventType.CLOSED, () => {
      try {
        showing = false;
        setInterstitialVisible(false);
        cleanup();
        // The cache lost a slot; abandoned flags no longer apply.
        for (const s of units.values()) s.abandoned = false;
        pump();
      } catch { /* never throw out of an ad callback */ }
    });
    showing = true;
    setInterstitialVisible(true);
    const r = slot.ad.show();
    if (r && typeof r.then === 'function') {
      r.then(() => {}).catch(() => {
        showing = false; setInterstitialVisible(false); cleanup(); pump();
      });
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
