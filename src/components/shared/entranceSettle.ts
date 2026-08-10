// When must a tab section's entrance be cut short? — pure, zero-import, tested.
//
// Background (the full mechanism is in useTabFocusEntrance.ts): while a view
// carries a Reanimated animated style, Reanimated owns it and pushes props
// straight to the native view. On Fabric/Android the native TOUCH REGIONS of
// that view's subtree then stay pinned to the layout that existed when the
// animation attached. So if anything moves while the entrance is playing, the
// section is drawn in its new place and taps still land in the old one — the
// "visible but untappable home-screen cards" bug.
//
// `onLayout` comes from the shadow tree, independent of Reanimated's native
// writes, so it is the one reliable signal that something moved. It is also the
// only signal that still works when the UI thread is busy (decoding the hero
// photo and four plan covers), which is exactly when the entrance runs long and
// the dead window is widest.

export type EntranceFrame = { y: number; h: number };

// Sub-pixel jitter is not a shift. Layout rounding can flip a frame by a
// fraction between passes and settling on that would cancel the ceremony for
// nothing.
const SHIFT_EPSILON = 0.5;

/**
 * Should this layout event end the entrance NOW?
 *
 * `prev` is null EXACTLY ONCE in a component's lifetime — the mount layout,
 * which is the baseline there is nothing yet to compare against.
 *
 * IT MUST NOT BE RESET ON RE-FOCUS. The re-arm used to clear it, reasoning that
 * a frame change from while the tab was away should not count as "shifted
 * mid-animation". That reasoning is wrong twice over:
 *   • Tab screens stay MOUNTED while blurred, so onLayout keeps firing and the
 *     baseline is already current — there is nothing stale to discard.
 *   • Clearing it meant the FIRST real shift of every later focus was consumed
 *     as a fresh baseline and returned false. That is precisely the event the
 *     early settle exists to catch, and after it there is usually no second
 *     layout pass to save us — so the section stayed Reanimated-owned, with
 *     stale hit regions, for the rest of the entrance window.
 * A change that lands during the focus render therefore settles early on
 * purpose: cutting the ceremony a hair short is always better than a card that
 * eats taps.
 */
export function entranceMustSettle(prev: EntranceFrame | null, next: EntranceFrame): boolean {
  if (prev === null) return false;
  return Math.abs(next.y - prev.y) > SHIFT_EPSILON
      || Math.abs(next.h - prev.h) > SHIFT_EPSILON;
}
