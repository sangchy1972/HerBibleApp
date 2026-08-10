import { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useBibleGuide } from '../state/BibleGuideContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';

// Takes the coordinator slot for the Bible-reader guide and starts it on her
// first ever visit to the tab. Hosted by BibleScreen; renders nothing.
//
// Same shape as PlanGuideSelfTrigger, and for the same reasons — the comments
// there explain each guard. The one difference: this guide has a single entry
// path, so the slot needs no owner tag.

export default function BibleGuideTrigger() {
  const guide = useBibleGuide();
  const coord = useNudgeCoordinator();
  const isFocused = useIsFocused();

  const setBibleFocused = guide.setBibleFocused;
  useEffect(() => {
    setBibleFocused(isFocused);
    return () => setBibleFocused(false);
  }, [isFocused, setBibleFocused]);

  const eligible = guide.eligible;
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('bibleGuide');

  const requestedRef = useRef(false);
  useEffect(() => {
    if (active) return;
    if (isFocused && eligible) {
      requestedRef.current = true;
      coord.requestSlot({
        id: 'bibleGuide',
        priority: NUDGE_PRIORITY.bibleGuide,
        canShow: () => eligibleRef.current,
        // 'bible' is excluded from the coordinator's tab surfaces on purpose —
        // no prompt may ambush the chapter she is reading. This one is the
        // complement of that rule, not a hole in it: it teaches the reader, so
        // the reader is the ONLY place it can run. Without this the request would
        // queue forever and the whole guide would be dead code.
        surfaceRoutes: ['bible'],
        // A once-ever feature tutorial that only fires where it teaches. If the
        // per-open nudge budget could eat it she might never see the reader
        // explained at all — there is no second chance by design.
        ignoresBudget: true,
      });
    } else if (requestedRef.current) {
      requestedRef.current = false;
      coord.releaseSlot('bibleGuide');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, eligible, active]);

  const startedRef = useRef(false);
  useEffect(() => {
    // isFocused is load-bearing: with non-lazy tabs this screen is mounted while
    // she is on another tab, and starting an invisible tour would burn the
    // once-ever flag on something she never saw.
    if (active && !startedRef.current && guide.stage === 'idle' && eligibleRef.current && isFocused) {
      startedRef.current = true;
      guide.begin();
      return;
    }
    if (startedRef.current && guide.stage === 'idle') {
      startedRef.current = false;
      requestedRef.current = false;
      coord.notifyDismissed('bibleGuide');
      coord.releaseSlot('bibleGuide');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, guide.stage, isFocused]);

  // Unmount MUST release, or a slot granted to a screen that no longer exists
  // silences every later blocking prompt for the session.
  const releaseOnUnmount = coord.releaseSlot;
  useEffect(() => () => releaseOnUnmount('bibleGuide'), [releaseOnUnmount]);

  return null;
}
