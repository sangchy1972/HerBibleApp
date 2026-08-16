// JS wrapper for ExpoOverlayCards — the daily "big card over the launcher"
// popups (verse card + quiz card), drawn as SYSTEM_ALERT_WINDOW overlays by a
// cold AlarmManager → BroadcastReceiver path, so they work with the app dead.
//
// requireOptionalNativeModule, like expo-pin-widget / expo-settings-coach: this
// must NEVER throw in a binary compiled before the module existed (any current
// dev client). Every function then reports "can't", and the feature simply
// stays invisible until the next native build.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const Native = requireOptionalNativeModule('ExpoOverlayCards');

/** One scheduled overlay card. All strings arrive pre-localized. */
export interface OverlayCardPayload {
  slot: 'morning' | 'night';
  hour: number;
  minute: number;
  kind: 'verse' | 'quiz';
  deepLink: string;
  // verse:
  verseText?: string;
  verseRef?: string;
  ctaLabel?: string;
  /** Absolute local file path (no file:// prefix). Empty → gradient fallback. */
  imagePath?: string;
  // quiz:
  badge?: string;
  question?: string;
  options?: string[];
}

export function overlayCardsSupported(): boolean {
  return Platform.OS === 'android' && Native != null;
}

/** Has she granted "Appear on top"? The gate for the entire feature. */
export function canDrawOverlays(): boolean {
  try { return Native?.canDrawOverlays?.() ?? false; } catch { return false; }
}

/** Our row on the system's "Appear on top" page. False if the OEM hides it. */
export function openOverlaySettings(): boolean {
  try { return Native?.openOverlaySettings?.() ?? false; } catch { return false; }
}

/** Persist content + (re)arm the daily alarms. Idempotent; call on every sync. */
export function configureOverlayCards(appName: string, cards: OverlayCardPayload[]): boolean {
  try { return Native?.configure?.(JSON.stringify({ appName, cards })) ?? false; } catch { return false; }
}

/** Tear down schedule + content (feature toggled off). */
export function cancelOverlayCards(): boolean {
  try { return Native?.cancelAll?.() ?? false; } catch { return false; }
}

/** Events queued by the cold receiver path, for logEvent(). Drained = cleared. */
export function drainOverlayEvents(): Array<{ n: string; t: number; p: Record<string, string> }> {
  try {
    const raw = Native?.drainEvents?.() ?? '[]';
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/** Show one configured card right now (dev/demo; permission still required). */
export function previewOverlayCard(slot: 'morning' | 'night'): boolean {
  try { return Native?.preview?.(slot) ?? false; } catch { return false; }
}

// ── MIUI extras ──────────────────────────────────────────────────────────────
// Xiaomi/Redmi/POCO additionally gate background-shown overlays behind their
// own "Display pop-up windows while running in the background" permission.

export function isMiuiDevice(): boolean {
  if (Platform.OS !== 'android') return false;
  const c = Platform.constants as { Manufacturer?: string; Brand?: string };
  return /xiaomi|redmi|poco/i.test(`${c?.Manufacturer ?? ''} ${c?.Brand ?? ''}`);
}

/** MIUI's per-app permission editor (falls back to app details). */
export function openMiuiPermissionEditor(): boolean {
  try { return Native?.openMiuiPermissionEditor?.() ?? false; } catch { return false; }
}

/** true / false, or null when unknowable — treat null as "show the step". */
export function miuiBackgroundPopupAllowed(): boolean | null {
  try {
    const v = Native?.miuiBackgroundPopupAllowed?.() ?? -1;
    return v === -1 ? null : v === 1;
  } catch { return null; }
}
