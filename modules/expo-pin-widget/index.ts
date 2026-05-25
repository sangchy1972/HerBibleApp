// Minimal stub. Original was a custom Expo native module for pinning the
// Android home-screen widget; lost when a worktree was deleted (never
// committed). These no-op exports keep AddWidgetScreen.tsx compiling.
// Re-implement once the native module is restored.

export function isPinSupported(): boolean {
  return false;
}

export function requestPin(_widgetName?: string): Promise<boolean> {
  return Promise.resolve(false);
}
