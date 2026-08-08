import { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { usePlanGuide } from '../state/PlanGuideContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';

// The plan-discovery guide's SELF path, hosted by PlanScreen: she opened the
// Plan tab on her own before the home nudge got to her, so the guide starts
// straight at the Explore step (2 steps instead of 3). Renders nothing.
//
// Also owns the visited flag (which retires the home nudge) and the Plan
// tab's focus flag for the overlay.

export default function PlanGuideSelfTrigger() {
  const guide = usePlanGuide();
  const coord = useNudgeCoordinator();
  const isFocused = useIsFocused();

  const setPlanFocused = guide.setPlanFocused;
  useEffect(() => {
    setPlanFocused(isFocused);
    return () => setPlanFocused(false);
  }, [isFocused, setPlanFocused]);

  // Every focus marks the tab visited — the home nudge is for users who have
  // NEVER been here. (Marking before the guide shows is fine: the self path
  // gates on the done flag, not on visited.)
  const markVisited = guide.markPlanVisited;
  useEffect(() => {
    if (isFocused) markVisited();
  }, [isFocused, markVisited]);

  // Backing out of the Plan tab mid-guide ends it — but ONLY once this screen
  // actually had focus with the step up. The 'tab' → 'explore' hand-off passes
  // through here with focus still in flight, and dismissing then would kill
  // the guide's own navigation.
  const hadFocusInStep = useRef(false);
  useEffect(() => {
    const inPlanSteps = guide.stage === 'explore' || guide.stage === 'mood';
    if (isFocused && inPlanSteps) hadFocusInStep.current = true;
    if (!isFocused && inPlanSteps && hadFocusInStep.current) {
      hadFocusInStep.current = false;
      guide.dismiss('left_plan');
    }
    if (guide.stage === 'idle') hadFocusInStep.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, guide.stage]);

  const eligible = guide.eligibleSelf;
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('planGuide');

  // Shares the slot id with the home trigger — release only own requests.
  const requestedRef = useRef(false);
  useEffect(() => {
    if (active) return;
    if (isFocused && eligible) {
      requestedRef.current = true;
      coord.requestSlot({
        id: 'planGuide',
        owner: 'self',
        priority: NUDGE_PRIORITY.planGuide,
        canShow: () => eligibleRef.current,
        ignoresBudget: true,
      });
    } else if (requestedRef.current) {
      requestedRef.current = false;
      coord.releaseSlot('planGuide', 'self');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, eligible, active]);

  const startedRef = useRef(false);
  useEffect(() => {
    // isFocused is load-bearing: with non-lazy tabs both triggers can be
    // mounted at once, and a grant meant for the HOME path must never start
    // the SELF path from an unfocused Plan screen (an invisible guide that
    // only the 30s watchdog would clean up).
    if (active && !startedRef.current && guide.stage === 'idle' && eligibleRef.current && isFocused) {
      startedRef.current = true;
      guide.begin('self');
      return;
    }
    if (startedRef.current && guide.stage === 'idle') {
      startedRef.current = false;
      requestedRef.current = false;
      coord.notifyDismissed('planGuide');
      coord.releaseSlot('planGuide', 'self');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, guide.stage, isFocused]);

  return null;
}
