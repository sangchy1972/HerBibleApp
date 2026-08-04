import { useEffect, useRef } from 'react';

// There is no "Next question" button any more (per user): once an answer locks,
// the reveal is held and the quiz moves on by itself.
//
// Shared by the full screen and the home card so the two can never hold the
// reveal for different lengths of time.

/** How long the coloured answer stays on screen before advancing. */
export const REVEAL_HOLD_MS = 2000;

/**
 * Run `onAdvance` once, `delay` after `active` becomes true.
 *
 * `active` is the lock, so it toggles false → true for EVERY question and the
 * timer is re-armed each time. Unmounting or unlocking early clears it, which is
 * what stops a queued advance from firing into a screen the user has left.
 *
 * The callback is held in a ref: it closes over the session on every render, and
 * as a dep it would restart the hold on each one — the reveal would never
 * actually elapse.
 */
export function useAutoAdvance(active: boolean, onAdvance: () => void, delay = REVEAL_HOLD_MS): void {
  const cb = useRef(onAdvance);
  cb.current = onAdvance;
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => cb.current(), delay);
    return () => clearTimeout(id);
  }, [active, delay]);
}
