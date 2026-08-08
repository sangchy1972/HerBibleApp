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

const TAB_ROUTES = new Set(['prayer', 'bible', 'plan', 'profile']);

let route: string | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach(fn => { try { fn(); } catch { /* never propagate */ } });

/** Fed from App.tsx's navigation-state listener with the DEEPEST active route. */
export function setPromptRoute(name: string | null): void {
  if (name === route) return;
  route = name;
  notify();
}

export function promptSurfaceSafe(): boolean {
  return route != null && TAB_ROUTES.has(route) && !isInterstitialVisible();
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
