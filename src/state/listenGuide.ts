// Rules for the narration ("Listen") coach mark — pure, zero-import, unit-tested.
//
// Narration no longer auto-plays (owner 2026-08-09: entering a prayer should give
// her the background music and nothing else). That makes the Listen button the
// only way in, and a button nobody notices is a feature nobody has — hence one
// spotlight, on the button, at the two moments it is most likely to land:
//
//   'first_flow'  her very first prayer flow, ever;
//   'four_flows'  she has finished FOUR prayer flows in a row without once
//                 turning narration on. Four is the owner's number: enough that
//                 it is clearly not an accident, few enough that she is still
//                 forming the habit.
//
// And a hard lifetime cap of TWO. This is a hint, not a campaign — a user who has
// seen it twice and still does not want narration has answered.

/** Why the guide is being offered. Also the analytics `reason` param. */
export type ListenGuideReason = 'first_flow' | 'four_flows';

export const LISTEN_GUIDE_MAX_SHOWS = 2;
export const LISTEN_GUIDE_FLOW_GAP = 4;

export interface ListenGuidePersisted {
  /** Lifetime count of times the guide has been DISPLAYED. */
  shownCount: number;
  /** Completed prayer flows since narration was last used (or since install). */
  flowsSinceListen: number;
  /** Has she ever actually played the narration? */
  everListened: boolean;
}

export const LISTEN_GUIDE_DEFAULT: ListenGuidePersisted = {
  shownCount: 0,
  flowsSinceListen: 0,
  everListened: false,
};

/**
 * Should the spotlight run on THIS prayer flow, and why?
 *
 * `isFirstEverFlow` is the caller's read of "she has never completed a prayer",
 * captured at mount — not derived here, because it lives in PrayerContext.
 *
 * Order matters: the first-flow offer is checked first so a brand-new user gets
 * the guide on flow one rather than waiting four flows for it.
 */
export function listenGuideReason(
  s: ListenGuidePersisted,
  isFirstEverFlow: boolean,
): ListenGuideReason | null {
  if (s.shownCount >= LISTEN_GUIDE_MAX_SHOWS) return null;
  // Already using narration → nothing to teach.
  if (s.everListened) return null;
  if (isFirstEverFlow) {
    // Only ever the FIRST show. Without this, a user whose second flow is still
    // reported as "first ever" (a wiped PrayerContext, a restore) would burn both
    // lifetime shows back to back.
    return s.shownCount === 0 ? 'first_flow' : null;
  }
  return s.flowsSinceListen >= LISTEN_GUIDE_FLOW_GAP ? 'four_flows' : null;
}

/** The guide was displayed. Resets the flow counter so the two offers cannot
 *  land on consecutive flows. */
export function noteListenGuideShown(s: ListenGuidePersisted): ListenGuidePersisted {
  return { ...s, shownCount: s.shownCount + 1, flowsSinceListen: 0 };
}

/** She played the narration. Retires the guide for good. */
export function noteListened(s: ListenGuidePersisted): ListenGuidePersisted {
  return { ...s, everListened: true, flowsSinceListen: 0 };
}

/**
 * A prayer flow finished. `usedListen` is whether narration played during it.
 *
 * Counting COMPLETED flows, not opens: opening the flow and backing out
 * immediately says nothing about whether she wanted narration, and counting it
 * would let four abandoned opens trigger the guide.
 */
export function noteFlowComplete(s: ListenGuidePersisted, usedListen: boolean): ListenGuidePersisted {
  if (usedListen) return noteListened(s);
  return { ...s, flowsSinceListen: s.flowsSinceListen + 1 };
}
