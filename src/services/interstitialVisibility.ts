// Cross-cutting "is a fullscreen interstitial on screen right now?" flag.
//
// Both interstitial systems (ads.ts simple/onboarding path and the US
// waterfall in usInterstitial.ts) report into this module. In-app celebration
// surfaces (the badge unlock popup) read it so their entrance animation plays
// AFTER the user closes the ad — instead of having silently finished
// underneath the native ad overlay.

let visible = false;
const subs = new Set<(v: boolean) => void>();
let stuckTimer: ReturnType<typeof setTimeout> | null = null;
// No interstitial legitimately stays up this long. If CLOSED never arrives —
// show() was called but the ad never actually presented, the event was missed,
// or the SDK dropped it — this flag would stay true FOREVER, and everything
// gated on it silently dies with it: the badge unlock screen never opens, and
// its nudge-coordinator slot is never released, which blocks every later prompt.
const MAX_VISIBLE_MS = 45_000;

export function setInterstitialVisible(v: boolean): void {
  if (stuckTimer) { clearTimeout(stuckTimer); stuckTimer = null; }
  if (v) stuckTimer = setTimeout(() => setInterstitialVisible(false), MAX_VISIBLE_MS);
  if (v === visible) return;
  visible = v;
  subs.forEach(fn => { try { fn(v); } catch { /* listener errors never propagate */ } });
}

export function isInterstitialVisible(): boolean {
  return visible;
}

// ── "How long since an interstitial actually appeared?" ──────────────────────
// The three show paths (ads.ts non-US / adEngine Android / usInterstitial iOS-US)
// each keep a PRIVATE lastShownAt for the global floor. This is the one value a
// TRIGGER can read without knowing which path is live on this device —
// adFrequency's churn rule needs "≥60s since the last ad", and asking the live
// path directly would put a platform+region branch inside a trigger.
//
// Stamped where the ad REALLY presents (the OPENED event where one exists), not
// where show() is called — a show() that throws must not start the clock. Every
// present site calls this right next to its own `lastShownAt = Date.now()`.
// IF YOU ADD A FOURTH SHOW PATH, STAMP HERE TOO, or every trigger gated on this
// will believe no ad has ever shown.
let lastShownAt = 0;

export function noteInterstitialShown(): void {
  lastShownAt = Date.now();
}

/** ms since the last interstitial presented; huge (never-shown) before the first. */
export function msSinceLastInterstitial(): number {
  return lastShownAt === 0 ? Number.MAX_SAFE_INTEGER : Date.now() - lastShownAt;
}

/** Subscribe to visibility flips. Returns the unsubscribe function. */
export function onInterstitialVisibility(fn: (v: boolean) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
