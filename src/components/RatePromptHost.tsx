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
  const shownRef = useRef(false);
  useEffect(() => {
    if (active && !shownRef.current) { shownRef.current = true; rate.markShown(); }
    if (!active) shownRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const close = useCallback(() => {
    coord.notifyDismissed('rate');
    coord.releaseSlot('rate');
  }, [coord]);

  if (!active) return null;
  return <RatePromptSheet onClose={close} />;
}
