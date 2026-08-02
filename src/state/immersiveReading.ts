import { useEffect, useState } from 'react';

// Immersive reading: the Bible reader hides the bottom tab bar while the user
// scrolls DOWN through a chapter and brings it back when she scrolls up (or
// leaves the tab), so the page is all text — the behaviour competitors use.
//
// A module-level store rather than a context on purpose: the tab bar lives
// OUTSIDE the tab screens (it's the navigator's own `tabBar` render prop), so a
// provider wrapping the screens can't reach it, and adding another provider
// above the navigator just to pass one boolean would churn the whole tree on
// every scroll flip. Subscribers re-render only themselves.

let hidden = false;
const subs = new Set<(v: boolean) => void>();

export function setTabBarHidden(v: boolean): void {
  if (v === hidden) return;
  hidden = v;
  subs.forEach(fn => { try { fn(v); } catch { /* a listener must never break scrolling */ } });
}

/** Always call this when a reader unmounts / loses focus — a hidden tab bar
 *  must never outlive the screen that hid it. */
export function resetTabBarHidden(): void {
  setTabBarHidden(false);
}

export function useTabBarHidden(): boolean {
  const [v, setV] = useState(hidden);
  useEffect(() => {
    // Re-sync on mount: the flag may have flipped before this subscribed.
    setV(hidden);
    subs.add(setV);
    return () => { subs.delete(setV); };
  }, []);
  return v;
}
