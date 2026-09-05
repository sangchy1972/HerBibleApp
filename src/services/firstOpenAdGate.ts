import { onInterstitialVisibility, isInterstitialVisible } from './interstitialVisibility';

// First-open loading-screen ad gate (owner 2026-08-22): a brand-new user's
// LoadingOverlay holds until the GMA SDK has initialized AND the first-open
// interstitial got its answer — the goal is one ad DURING loading.
//
// States and their exits:
//   idle    — gate never started (returning user) → overlay ignores it.
//   pending — waiting for init + first fill. Exits: fill→shown,
//             real no-fill→grace, network error→network,
//             PENDING_WATCHDOG_MS with no answer at all→done (never trap her
//             on a silently-stalled SDK; the onboarding flow's own attempts
//             remain as the catch-up, unchanged).
//   shown   — the interstitial is on screen (over the overlay). Exit: the ad
//             closes (interstitialVisibility flips false) → done.
//   grace   — a REAL no-fill arrived; per owner, wait at most GRACE_MS more
//             (a late fill inside the window still shows), then done.
//   network — the load failed as a NETWORK error; per owner, tell her to
//             check her connection and hold. Deliberately unbounded, and the
//             hold is honest on BOTH platforms: the engine retries forever on
//             its own backoff (5s→60s), and the iOS onboarding unit's retry
//             cap is LIFTED while this gate is active (ads.ts — the swarm
//             found the capped 3×8s made this state a dead end there). A
//             later fill/no-fill exits to shown/grace; first-run content
//             needs the network anyway.
//   done    — overlay may leave. Terminal.
//
// The ad layers (ads.ts onboarding unit, adEngine on Android) emit
// gateSignalFill / gateSignalError from their existing LOADED/ERROR handlers,
// guarded by firstOpenGateActive() so the emission is a no-op for everyone
// else. The show itself goes through maybeShowOnboardingInterstitial — same
// once-ever latch the onboarding flow uses, so the two entry points can never
// double-fire.
export type FirstOpenGateState = 'idle' | 'pending' | 'shown' | 'grace' | 'network' | 'done';

// 15s, not 12: day-0 initAds now starts 2.5s after interactions settle
// (DAY0_ADS_INIT_STAGGER_MS in App.tsx — the ANR stagger, owner 2026-09-05),
// so the watchdog grows by the same budget to keep the ad's effective
// init+fill window at ~12s. The overlay's MAX_VISIBLE_MS cap is neutered
// while the gate holds (gateHolding in LoadingOverlay), so no other number
// needs to move.
const PENDING_WATCHDOG_MS = 15_000;
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
  if (state !== 'pending' && state !== 'grace' && state !== 'network') return;
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
  return state === 'pending' || state === 'grace' || state === 'network';
}

export function gateSignalFill(): void {
  if (!firstOpenGateActive()) return;
  attempt();
}

export function gateSignalError(kind: 'nofill' | 'network'): void {
  if (!firstOpenGateActive()) return;
  if (kind === 'network') {
    if (state === 'grace') return;   // grace already counting down — let it end
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
    setState('network');
    return;
  }
  // Real no-fill → the owner's 3s grace. A late fill inside the window still
  // shows (the poll keeps attempting); otherwise enter the app.
  if (state === 'grace') return;
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
  setState('grace');
  graceTimer = setTimeout(() => { if (state === 'grace') finish(); }, GRACE_MS);
}

/** The network dialog's Try-again: nudge the loaders and re-attempt now.
 *  The automatic retries keep running regardless — this only adds agency. */
export function gateRetryNow(): void {
  if (state !== 'network') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ads = require('./ads') as { kickFirstOpenLoad?: () => void };
    ads.kickFirstOpenLoad?.();
  } catch { /* the poll keeps attempting either way */ }
  attempt();
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
