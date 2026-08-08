import React, { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useRatePrompt } from '../state/RatePromptContext';
import { usePrayer } from '../state/PrayerContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import RatePromptSheet from './RatePromptSheet';

// Asks the rate question on the HOME screen (per user) instead of at the end of
// the prayer flow. Rendered inside PrayerScreen so it only fires while home is
// focused — i.e. right when the user comes BACK to the main screen. Routes
// through the nudge coordinator so it never stacks with the mood sheet / login.
export default function RatePromptHost() {
  const rate = useRatePrompt();
  const { everPrayed } = usePrayer();
  const coord = useNudgeCoordinator();
  const isFocused = useIsFocused();

  // Eligible only after the user has prayed at least once (preserves the old
  // "first ask after the first prayer" rule) AND the cadence says it's time.
  const eligible = rate.ready && everPrayed && rate.shouldAsk();
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('rate');

  useEffect(() => {
    if (active) return;   // already showing — don't disturb it
    if (isFocused && eligible) {
      coord.requestSlot({ id: 'rate', priority: NUDGE_PRIORITY.rate, canShow: () => eligibleRef.current });
    } else {
      coord.releaseSlot('rate');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, eligible, active]);

  // Record the show exactly once — the instant the coordinator grants the slot.
  // markShown flips `eligible` false, but `active` stays true (the coordinator
  // never preempts a live prompt) so the sheet remains until the user closes it.
  // Keyed on the GRANT, not on mount: a remount while the slot is still active
  // (FollowHimScreen swapping the tab tree out mid-session) reset shownRef to
  // false and markShown ran a second time, double-counting the cadence.
  const shownForRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (active && shownForRef.current !== true) { shownForRef.current = true; rate.markShown(); }
    if (!active) shownForRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const close = useCallback(() => {
    coord.notifyDismissed('rate');
    coord.releaseSlot('rate');
  }, [coord]);

  // Unmount MUST release. ReminderInterstitialContext re-derives its day/night
  // slot on every foreground, so a notifications-off user returning after 18:00
  // has the whole tab tree swapped out for FollowHimScreen mid-session — every
  // home-hosted trigger unmounts, and a slot still held would block every later
  // prompt. `releaseSlot` (not `coord`) is pinned: the context value is memoized
  // on activeId, so a [coord]-keyed cleanup would fire on the very grant it was
  // meant to protect.
  const releaseOnUnmount = coord.releaseSlot;
  useEffect(() => () => releaseOnUnmount('rate'), [releaseOnUnmount]);

  if (!active) return null;
  return <RatePromptSheet onClose={close} />;
}
