import React from 'react';
import { useLoginPrompt } from '../state/LoginPromptContext';
import SignInSheet from './SignInSheet';

// Renders the sign-in sheet at the app root whenever LoginPromptContext decides
// a soft login nudge is due (first badge / note / highlight / day-1 / periodic,
// all frequency-capped + suppressed once signed in). Must sit inside the
// NavigationContainer because SignInSheet's legal links call navigate().
export default function LoginPromptHost() {
  const { promptVisible, dismiss } = useLoginPrompt();
  if (!promptVisible) return null;
  return <SignInSheet onClose={dismiss} />;
}
