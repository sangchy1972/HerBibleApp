// Minimal stub. Original was the react-native-android-widget VerseOfDay
// widget (lost when a worktree was deleted; never committed). Returning
// null is enough to satisfy the import in AddWidgetScreen.tsx; the
// home-screen widget itself won't render until the real component is
// restored.
import React from 'react';

interface Props {
  verse?: string | null;
  reference?: string | null;
  cellWidth?: number;
  cellHeight?: number;
}

export function VerseOfDayWidget(_props: Props) {
  return null;
}
