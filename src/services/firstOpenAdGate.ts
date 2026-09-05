import { onInterstitialVisibility, isInterstitialVisible } from './interstitialVisibility';

// First-open loading-screen ad gate (owner 2026-08-22): a brand-new user's
// LoadingOverlay holds until the GMA SDK has initialized AND the first-open
// interstitial got its answer — the goal is one ad DURING loading.
//
// States and their exits:
//   idle    — gate never started (returning user) → overlay ignores it.
//   pending — waiting for init + first fill. Exits: fill→shown,
//             any error→grace, PENDING_WATCHDOG_MS with no answer→done.
//   shown   — the interstitial is on screen (over the overlay). Exit: the ad
//             closes (interstitialVisibility flips false) → done.
//   grace   — a no-fill OR network error arrived; wait at most GRACE_MS more
//             (a late fill inside the window still shows), then done.
//   done    — overlay may leave. Terminal.
//
// Policy rewrite (owner 2026-09-06: “没有广告就算了，广告可以后续加载”): the
// gate is now a SHORT courtesy window, never a wall. The old unbounded
// 'network' hold (check-your-connection dialog until connectivity returned)
// is retired — a network-class ad failure gets the same short grace as a
// no-fill, and the user walks into the app. An ad that fills late is not
// lost: the onboarding flow's own maybeShowOnboardingInterstitial attempts
// remain as the catch-up, unchanged (ads.ts).
//
// The ad layers (ads.ts onboarding unit, adEngine on Android) emit
// gateSignalFill / gateSignalError from their existing LOADED/ERROR handlers,
// guarded by firstOpenGateActive() so the emission is a no-op for everyone
// else. The show itself goes through maybeShowOnboardingInterstitial — same
// once-ever latch the onboarding flow uses, so the two entry points can never
// double-fire.
export type FirstOpenGateState = 'idle' | 'pending' | 'shown' | 'grace' | 'done';

// 8s (owner 2026-09-06, down from 15): the 2.5s day-0 ads-init stagger plus
// ~5.5s of real init+fill room. A US-network fill typically lands well inside
// this; anyone slower walks into the app and the onboarding catch-up shows
// the ad when it eventually loads. Never make her stare at a bar for an ad.
const PENDING_WATCHDOG_MS = 8_000;
const GRACE_MS = 3_000;
const POLL_MS = 400;

let state: FirstOpenGateState = 'idle';
const subs = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let offVisibility: (() => void) | null = null;

function setState(next: FirstOpenGateState): void {
  if (state === next) return;
  state = next;
  subs.forEach(f => { try { f(); } catch { /* never propagate */ } });
}

function clearTimers(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
  if (offVisibility) { offVisibility(); offVisibility = null; }
}

function finish(): void {
  clearTimers();
  setState('done');
}

// Lazy require breaks the ads.ts ↔ gate import cycle (ads.ts imports the
// signal functions; the show call lives behind this).
function tryShow(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ads = require('./ads') as { maybeShowOnboardingInterstitial?: () => boolean };
    return ads.maybeShowOnboardingInterstitial?.() ?? false;
  } catch { return false; }
}

function attempt(): void {
  if (state !== 'pending' && state !== 'grace') return;
  // adsRemoved hydrates inside initAds — a restored purchaser reads false at
  // start and true a few seconds later; release immediately then rather than
  // spending the 12s watchdog (swarm 2026-08-22).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ads = require('./ads') as { areAdsRemoved?: () => boolean };
    if (ads.areAdsRemoved?.()) { finish(); return; }
  } catch { /* keep waiting on the watchdog */ }
  if (!tryShow()) return;
  clearTimers();
  setState('shown');
  // The ad is up over the overlay; when it closes the gate releases. Poll as
  // the belt in case the visibility emitter ever misses the flip.
  offVisibility = onInterstitialVisibility(() => {
    if (!isInterstitialVisible()) finish();
  });
  watchdogTimer = setTimeout(() => { if (!isInterstitialVisible()) finish(); }, 60_000);
}

/** LoadingOverlay calls this once when it knows the user is brand-new. */
export function startFirstOpenAdGate(): void {
  if (state !== 'idle') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ads = require('./ads') as { areAdsRemoved?: () => boolean };
    if (ads.areAdsRemoved?.()) { setState('done'); return; }
  } catch { /* ads module unavailable → behave as no-ads */ setState('done'); return; }
  setState('pending');
  pollTimer = setInterval(attempt, POLL_MS);
  attempt();
  watchdogTimer = setTimeout(() => {
    // No answer of ANY kind (init stalled, ATT dialog still up, listeners
    // dropped) — give up silently rather than trap her. Network/grace states
    // manage their own exits and are not subject to this.
    if (state === 'pending') finish();
  }, PENDING_WATCHDOG_MS);
}

/** True while ad layers should report their load outcomes here. */
export function firstOpenGateActive(): boolean {
  return state === 'pending' || state === 'grace';
}

export function gateSignalFill(): void {
  if (!firstOpenGateActive()) return;
  attempt();
}

export function gateSignalError(kind: 'nofill' | 'network'): void {
  if (!firstOpenGateActive()) return;
  // No-fill and network failures land in the same short grace now (owner
  // 2026-09-06): a late fill inside the window still shows (the poll keeps
  // attempting); otherwise she enters the app and the onboarding catch-up
  // owns any ad that loads later. `kind` is kept for callers/logging.
  void kind;
  if (state === 'grace') return;   // grace already counting down — let it end
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
  setState('grace');
  graceTimer = setTimeout(() => { if (state === 'grace') finish(); }, GRACE_MS);
}

export function getFirstOpenGateState(): FirstOpenGateState { return state; }

export function subscribeFirstOpenGate(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

export function __resetFirstOpenGateForTest(): void {
  clearTimers();
  state = 'idle';
}
