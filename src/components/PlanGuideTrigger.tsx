import { useEffect, useRef } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePlanGuide } from '../state/PlanGuideContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import type { RootStackParamList } from '../navigation/types';

// The plan-discovery guide's HOME trigger, hosted by PrayerScreen. Renders
// nothing. Fires for users who have never opened the Plan tab, at the moment
// the home screen has no louder ask: the prayer CTA has gone quiet (prayed,
// or the slot is locked) — `ctaQuiet` comes from the screen, the same flag
// that hands the breathing animation to the rhythm bar. Routed through the
// coordinator, so it can never stack on the tour, a badge, or the mood sheet.
//
// The SELF path (she opens the Plan tab on her own) triggers from PlanScreen —
// see the wiring there; both paths share the once-ever done flag.

export default function PlanGuideTrigger({ ctaQuiet }: { ctaQuiet: boolean }) {
  const guide = usePlanGuide();
  const coord = useNudgeCoordinator();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // The 'tab' step renders only while home is focused.
  const setHomeFocused = guide.setHomeFocused;
  useEffect(() => {
    setHomeFocused(isFocused);
    return () => setHomeFocused(false);
  }, [isFocused, setHomeFocused]);

  // Step 'tab' → 'explore' navigates onto the Plan tab.
  const setOpenPlanTab = guide.setOpenPlanTabHandler;
  useEffect(() => {
    setOpenPlanTab(() => navigation.navigate('Tabs', { screen: 'plan' }));
  }, [setOpenPlanTab, navigation]);

  // Leaving home during the 'tab' step (deep link, notification tap — the
  // scrim blocks ordinary taps) ends the guide. Later steps live on the Plan
  // tab and are exempt: navigating there is the guide's own hand-off.
  useEffect(() => {
    if (!isFocused && guide.stage === 'tab') guide.dismiss('left_home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, guide.stage]);

  const eligible = guide.eligibleFromHome(ctaQuiet);
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('planGuide');

  // Two components share this slot id (the self trigger on PlanScreen), so
  // each may only release a request IT made — a blanket release here would
  // tear down the other trigger's pending request.
  const requestedRef = useRef(false);
  useEffect(() => {
    if (active) return;   // never disturb a live grant
    if (isFocused && eligible) {
      requestedRef.current = true;
      coord.requestSlot({
        id: 'planGuide',
        priority: NUDGE_PRIORITY.planGuide,
        canShow: () => eligibleRef.current,
        // A one-time feature tutorial the owner wants reliably delivered on
        // day 1 — the per-open budget must not push it behind a promo.
        ignoresBudget: true,
      });
    } else if (requestedRef.current) {
      requestedRef.current = false;
      coord.releaseSlot('planGuide');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, eligible, active]);

  // Granted → begin('home') once; guide over → give the slot back.
  const startedRef = useRef(false);
  useEffect(() => {
    if (active && !startedRef.current && guide.stage === 'idle') {
      startedRef.current = true;
      guide.begin('home');
      return;
    }
    if (startedRef.current && guide.stage === 'idle') {
      startedRef.current = false;
      requestedRef.current = false;
      coord.notifyDismissed('planGuide');
      coord.releaseSlot('planGuide');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, guide.stage]);

  return null;
}
