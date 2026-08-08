import { useEffect, useRef } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStreakGuide } from '../state/StreakGuideContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import type { RootStackParamList } from '../navigation/types';

// Coordinator glue for the rookie streak guide, hosted by PrayerScreen (the
// guide's step 1 spotlights this screen's flame pill). Renders nothing.
//
// Same shape as RatePromptHost: request the slot while eligible + focused,
// begin() exactly once when granted, release when the guide ends. Routed
// through the coordinator so it can never stack on the mood sheet, a badge
// celebration, or the first-run tour (whose gate suppresses everything).

export default function StreakGuideTrigger() {
  const guide = useStreakGuide();
  const coord = useNudgeCoordinator();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Step 1 renders only while home is focused; the host reads this flag.
  const setHomeFocused = guide.setHomeFocused;
  useEffect(() => {
    setHomeFocused(isFocused);
    return () => setHomeFocused(false);
  }, [isFocused, setHomeFocused]);

  // Step 1's Continue navigates to the streak screen — registered here because
  // the host lives above the navigator and has no navigation of its own.
  const setOpenStreak = guide.setOpenStreakHandler;
  useEffect(() => {
    setOpenStreak(() => navigation.navigate('Streak'));
  }, [setOpenStreak, navigation]);

  // Leaving home during step 1 (deep link, notification tap — the scrim blocks
  // ordinary taps) ends the guide rather than leaving a stage armed under
  // whatever screen comes next. Step 2 is deliberately exempt: it lives on the
  // streak screen, which is exactly where the user is heading.
  useEffect(() => {
    if (!isFocused && guide.stage === 'step1') guide.dismiss('left_home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, guide.stage]);

  const eligible = guide.eligibleNow;
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('streakGuide');

  useEffect(() => {
    if (active) return;   // never disturb a live grant
    if (isFocused && eligible) {
      coord.requestSlot({
        id: 'streakGuide',
        priority: NUDGE_PRIORITY.streakGuide,
        canShow: () => eligibleRef.current,
        // A day-1 teaching moment, like the mood ritual — the per-open budget
        // must not be able to push it behind a quiz promo.
        ignoresBudget: true,
      });
    } else {
      coord.releaseSlot('streakGuide');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, eligible, active]);

  // Granted → begin (once per grant). Guide over → give the slot back.
  const startedRef = useRef(false);
  useEffect(() => {
    if (active && !startedRef.current && guide.stage === 'idle') {
      startedRef.current = true;
      guide.begin();
      return;
    }
    if (startedRef.current && guide.stage === 'idle') {
      startedRef.current = false;
      coord.notifyDismissed('streakGuide');
      coord.releaseSlot('streakGuide');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, guide.stage]);

  return null;
}
