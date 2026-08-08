import { useEffect, useState } from 'react';
import { isInterstitialVisible, onInterstitialVisibility } from '../services/interstitialVisibility';

// "May a blocking prompt be granted RIGHT NOW, given what the user is looking
// at?" — one gate, read by the nudge coordinator.
//
// WHY IT EXISTS: five prompt hosts (achievement, set-reminder, mood, login,
// widget) are mounted at APP ROOT and had no screen gating whatsoever, so a
// grant could paint a sheet over the Bible reader, a plan day, the prayer flow,
// the paywall, or a full-screen ad. The two home-hosted ones (rate, quizPromo)
// were safe only by accident of where they live. Gating the COORDINATOR covers
// every blocking prompt at once and can't be forgotten by the next host.
//
// A prompt may be granted only on one of the four TAB surfaces, and never while
// a fullscreen interstitial is up. Everything else — flow screens, readers,
// modal routes, celebration screens — is content the user chose to be in.
//
// This gates NEW GRANTS only. A prompt that already holds the slot keeps it
// (the streak guide's step 2 legitimately lives on the Streak route), and a
// queued request is never dropped: it waits for her to come back to a tab.

// 'bible' is DELIBERATELY absent: BibleScreen *is* the reader — the chapter and
// verse list live in it, not in a pushed route — so allowing it would permit
// exactly the ambush the owner named first ("a sheet over the chapter she is
// reading"). 'plan' stays: that tab is a browse surface; plan READING happens in
// pushed routes (PlanDayWalk / PlanVerseRead), which are already excluded.
const TAB_ROUTES = new Set(['prayer', 'plan', 'profile']);

let route: string | null = null;
// An in-SCREEN sheet is open (share, comments, note, time picker, day detail, the
// home More menu). Those live inside their screen, but a root-mounted nudge is in
// a LATER parent — so its zIndex 60 beats their zIndex 200 and it would land on
// top, orphaning the sheet behind a second scrim. Counter, not boolean: sheets
// can legitimately overlap during a cross-fade.
let sheetDepth = 0;
// The launch overlay is pointerEvents="none" at zIndex 1000, so a prompt granted
// underneath it is INVISIBLE but live: a tap lands on its backdrop and dismisses
// a prompt she never saw — and the mood ritual has already burned its daily flag
// by then.
let launchUp = true;
const subs = new Set<() => void>();
const notify = () => subs.forEach(fn => { try { fn(); } catch { /* never propagate */ } });

/** Fed from App.tsx's navigation-state listener with the DEEPEST active route.
 *  MUST also be called from onReady — React Navigation skips onStateChange on
 *  the first mount, and until this lands nothing can be granted at all. */
export function setPromptRoute(name: string | null): void {
  if (name === route) return;
  route = name;
  notify();
}

/** Called by App.tsx while the launch overlay owns the screen. */
export function setLaunchOverlayUp(v: boolean): void {
  if (v === launchUp) return;
  launchUp = v;
  notify();
}

// Mirror of the coordinator's activeId, for NON-coordinator surfaces (the
// proactive paywall) that must not land on top of a live prompt. A boolean, not
// the id: nobody outside the coordinator has any business branching on WHICH
// prompt is up.
let nudgeUp = false;
export function setNudgeActive(v: boolean): void { nudgeUp = v; }
export function nudgeActive(): boolean { return nudgeUp; }

/** Bracket an in-screen sheet's lifetime (see useSheetSurface). */
export function pushSheet(): void { sheetDepth += 1; notify(); }
export function popSheet(): void { sheetDepth = Math.max(0, sheetDepth - 1); notify(); }

export function promptSurfaceSafe(): boolean {
  return route != null
    && TAB_ROUTES.has(route)
    && !isInterstitialVisible()
    && sheetDepth === 0
    && !launchUp;
}

export function __resetPromptSurfaceForTest(): void {
  route = null; sheetDepth = 0; launchUp = true; nudgeUp = false; notify();
}

/** Bracket an in-screen sheet so no root-mounted nudge lands on top of it.
 *  Call from the sheet component itself: `useSheetSurface(visible)`. */
export function useSheetSurface(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    pushSheet();
    return popSheet;
  }, [open]);
}

/** Re-renders on route changes and on interstitial show/hide. */
export function usePromptSurfaceSafe(): boolean {
  const [safe, setSafe] = useState(promptSurfaceSafe);
  useEffect(() => {
    const sync = () => setSafe(promptSurfaceSafe());
    subs.add(sync);
    const offAd = onInterstitialVisibility(sync);
    sync();
    return () => { subs.delete(sync); offAd(); };
  }, []);
  return safe;
}
