// JS wrapper for the native ExpoPinWidget module (Android home-screen widget
// pinning via AppWidgetManager.requestPinAppWidget).
//
// Uses requireOptionalNativeModule so it NEVER throws when the native side
// isn't compiled into the running binary (e.g. an older dev client built
// before this module was restored) — it just reports "not supported" and the
// caller falls back to the manual "How to add" instructions. After the next
// native build (EAS / expo run:android) the real module takes over.
import { requireOptionalNativeModule } from 'expo-modules-core';

const Native = requireOptionalNativeModule('ExpoPinWidget');

export function isPinSupported(): boolean {
  try {
    return Native?.isPinSupported?.() ?? false;
  } catch {
    return false;
  }
}

export async function requestPin(_widgetName?: string): Promise<boolean> {
  try {
    if (!Native?.requestPin) return false;
    return await Native.requestPin();
  } catch {
    return false;
  }
}
