import React, { useEffect } from 'react';
import { useLoginPrompt } from '../state/LoginPromptContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import SignInSheet from './SignInSheet';

// Renders the sign-in sheet at the app root whenever LoginPromptContext decides
// a soft login nudge is due (first badge / note / highlight / day-1 / periodic,
// all frequency-capped + suppressed once signed in). Routed through the nudge
// coordinator so it never stacks on top of the mood sheet / other prompts —
// a higher-priority nudge wins the single per-open slot and login waits (its
// own 1-per-3-day cap makes it patient). Must sit inside the NavigationContainer
// because SignInSheet's legal links call navigate().
export default function LoginPromptHost() {
  const { promptVisible, dismiss } = useLoginPrompt();
  const coord = useNudgeCoordinator();
  useEffect(() => {
    if (promptVisible) coord.requestSlot({ id: 'login', priority: NUDGE_PRIORITY.login, canShow: () => true });
    else coord.releaseSlot('login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptVisible]);
  // ABOVE the early return — a hook under it is conditional and React rejects it
  // the moment the condition flips.
  //
  // Unmount MUST release. ReminderInterstitialContext re-derives its day/night
  // slot on every foreground, so a notifications-off user returning after 18:00
  // has the whole tab tree swapped out for FollowHimScreen mid-session — every
  // home-hosted trigger unmounts, and a slot still held would block every later
  // prompt. `releaseSlot` (not `coord`) is pinned: the context value is memoized
  // on activeId, so a [coord]-keyed cleanup would fire on the very grant it was
  // meant to protect.
  const releaseOnUnmount = coord.releaseSlot;
  useEffect(() => () => releaseOnUnmount('login'), [releaseOnUnmount]);

  if (!promptVisible || !coord.isActive('login')) return null;

  return <SignInSheet onClose={() => { coord.notifyDismissed('login'); dismiss(); }} />;
}
