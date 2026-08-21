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
// A prompt may be granted only on one of the the TAB surfaces, and never while
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
//
// A prompt whose whole SUBJECT is an excluded screen can opt into that one route
// via `alsoOn` below — today only the Bible-reader guide, on 'bible'. That is not
// a loophole in the rule above, it is the rule's complement: teaching the reader
// is not an ambush ON the reader, and it is the one thing that cannot be shown
// anywhere else. Widen `alsoOn` per request, NEVER this set.
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

// The >3-min resume cover splash (ResumeCoverSplash). A dedicated flag, NOT
// folded into promptSurfaceQuiet's sheetDepth alone, because adFrequency's
// hot-start decision reads THIS to defer the app_open interstitial one beat —
// widening that to every sheet would change the settled ad behaviour.
let resumeSplashUp = false;
export function setResumeSplashUp(v: boolean): void {
  if (v === resumeSplashUp) return;
  resumeSplashUp = v;
  notify();
}
export function isResumeSplashUp(): boolean { return resumeSplashUp; }

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

/**
 * The half that applies to EVERY prompt on EVERY screen: no fullscreen ad, no
 * in-screen sheet, no launch overlay. Nothing may opt out of these — each one is
 * a case of a prompt being invisible or orphaning something already on screen.
 */
export function promptSurfaceQuiet(): boolean {
  return !isInterstitialVisible() && sheetDepth === 0 && !launchUp;
}

/**
 * Is the CURRENT route one this prompt may be granted on?
 *
 * Split out of promptSurfaceSafe so the coordinator can apply it PER REQUEST:
 * one prompt being about an excluded screen must not open that screen up to
 * every other prompt. `alsoOn` widens the route check and nothing else.
 */
export function promptRouteAllowed(alsoOn?: readonly string[]): boolean {
  if (route == null) return false;
  return TAB_ROUTES.has(route) || !!alsoOn?.includes(route);
}

export function promptSurfaceSafe(alsoOn?: readonly string[]): boolean {
  return promptRouteAllowed(alsoOn) && promptSurfaceQuiet();
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

/**
 * A counter that changes on ANY surface change — route, sheet depth, launch
 * overlay, interstitial.
 *
 * The coordinator needs the change itself, not a verdict: now that the route
 * check is per-request, walking from 'bible' to 'prayer' must re-arbitrate even
 * though the global half of the gate never moved. A hook returning a boolean
 * would not re-render on that, and a request queued behind a route would sit
 * there until the next unrelated event.
 */
export function usePromptSurfaceEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const sync = () => setEpoch(v => v + 1);
    subs.add(sync);
    const offAd = onInterstitialVisibility(sync);
    sync();
    return () => { subs.delete(sync); offAd(); };
  }, []);
  return epoch;
}
