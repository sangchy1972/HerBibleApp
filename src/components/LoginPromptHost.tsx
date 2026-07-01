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
  if (!promptVisible || !coord.isActive('login')) return null;
  return <SignInSheet onClose={() => { coord.notifyDismissed('login'); dismiss(); }} />;
}
