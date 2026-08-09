// JS wrapper for ExpoSettingsCoach — a coach card drawn ON TOP of the system
// Settings app, so the trip to flip a switch is guided instead of abandoned.
//
// requireOptionalNativeModule, like expo-pin-widget: this must NEVER throw in a
// binary compiled before the module existed (any current dev client). Every
// function then reports "can't" and the caller keeps the in-app card, which is
// the path that works on every device anyway.
//
// It needs SYSTEM_ALERT_WINDOW ("Appear on top"), which the user grants on a
// Settings page rather than through a runtime dialog — so `canDrawOverlays()` is
// the gate for the whole feature, and `openOverlaySettings()` is how she opts in.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const Native = requireOptionalNativeModule('ExpoSettingsCoach');

/** Android only, and only once she has granted "Appear on top". */
export function canFloatOverSettings(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return Native?.canDrawOverlays?.() ?? false;
  } catch {
    return false;
  }
}

/** The per-app "Appear on top" page. False when the OEM has no such page. */
export function openOverlaySettings(): boolean {
  try {
    return Native?.openOverlaySettings?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * Float the card. Copy comes from the app's i18n — the native module owns no
 * text. `timeoutMs` is a hard self-destruct: this window outlives our Activity,
 * so a stranded card would sit over the user's phone with nothing of ours left
 * running to remove it.
 */
export function showSettingsCoach(opts: {
  title: string;
  body: string;
  switchLabel: string;
  timeoutMs?: number;
}): boolean {
  try {
    return Native?.show?.(opts.title, opts.body, opts.switchLabel, opts.timeoutMs ?? 25000) ?? false;
  } catch {
    return false;
  }
}

export function hideSettingsCoach(): void {
  try {
    Native?.hide?.();
  } catch {
    /* nothing to hide */
  }
}
