import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useUILanguage, type UILanguageCode } from './UILanguageContext';
import { lookupString } from '../i18n/lookup';
import { logEvent, setUserProps } from '../services/firebase';

// ─── Public types ─────────────────────────────────────────────────────────

// Quiz removed 2026-05-22 — feature not yet built, hidden from settings UI
// to avoid Play Store reviewer "incomplete feature" flags. If quiz lands
// later: restore the union member here + DEFAULTS entry + NOTIF_IDS entry +
// NotificationsScreen's SECTIONS row + add new push.quiz.* catalog keys.
export type NotifKey = 'morning' | 'night' | 'plan';

export interface NotifSettings {
  enabled: boolean;
  hour: number;     // 0-23
  minute: number;   // 0-59
}

export type NotifMap = Record<NotifKey, NotifSettings>;

// ─── Constants ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'notifications:v1';

const DEFAULTS: NotifMap = {
  morning: { enabled: true,  hour: 8,  minute: 0 },
  night:   { enabled: true,  hour: 20, minute: 0 },
  plan:    { enabled: false, hour: 19, minute: 0 },
};

// Stable identifiers — `scheduleNotificationAsync` with the same identifier
// replaces the prior pending schedule, so cancel-then-reschedule never
// stacks duplicates. Order of this map also drives `pickDailyVariant`'s
// salt — adding a slot is therefore safe without manual salt bookkeeping.
const NOTIF_IDS: Record<NotifKey, string> = {
  morning: 'her-bible.notif.morning',
  night:   'her-bible.notif.night',
  plan:    'her-bible.notif.plan',
};

const SLOTS = Object.keys(NOTIF_IDS) as NotifKey[];

// Per-slot variant counts. All three slots rotate through 10 copies so an
// active user rarely sees the same reminder twice in a fortnight.
// MUST stay in sync with the `notif.push.<slot>.{title,body}.<n>` keys present
// in the i18n catalog — picking a variant with no string would fall back to the
// raw key text in the notification.
const VARIANTS_PER_SLOT: Record<NotifKey, number> = {
  morning: 10,
  night: 10,
  plan: 10,
};
const ACTION_CATEGORY = 'her-bible.prayer';
const ANDROID_CHANNEL = 'her-bible.daily';
const BRAND_ROSE = '#E8619A';

// ─── Pure helpers (no React) ──────────────────────────────────────────────

// Deterministic 1..N variant pick keyed on day-of-year: the same slot on the
// same calendar day always yields the same content, while morning vs night vs
// plan differ on that day (salt = slot index in NOTIF_IDS). The value is baked
// into the scheduled notification, so rotation across days only happens when the
// schedule is rebuilt — which the foreground re-sync effect (5) now does on
// every app open, so an active user sees fresh content each day.
function pickDailyVariant(slot: NotifKey): number {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - yearStart.getTime()) / 86_400_000);
  const salt = SLOTS.indexOf(slot);
  return ((dayOfYear + salt) % VARIANTS_PER_SLOT[slot]) + 1;
}

function buildScheduleRequest(slot: NotifKey, cfg: NotifSettings, lang: UILanguageCode): Notifications.NotificationRequestInput {
  const variant = pickDailyVariant(slot);
  return {
    identifier: NOTIF_IDS[slot],
    content: {
      title: lookupString(`notif.push.${slot}.title.${variant}`, lang),
      body:  lookupString(`notif.push.${slot}.body.${variant}`, lang),
      sound: 'default',
      categoryIdentifier: ACTION_CATEGORY,
      data: { slot },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: cfg.hour,
      minute: cfg.minute,
      // `channelId` belongs on the trigger (SDK 54 `DailyTriggerInput`),
      // not on content — putting it in content is silently ignored on
      // Android and the notification falls back to the default channel,
      // losing the brand-rose light + custom sound.
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
  };
}

// Immediate confirmation push, fired the moment a reminder is switched ON. The
// real reminder uses a DAILY trigger, so it won't arrive until the next time
// the clock hits HH:MM (often hours away) — without this, turning a toggle on
// produces no visible result and feels broken. A ~2s delayed one-shot gives the
// user instant proof the pipeline works (permission + delivery + channel).
async function fireEnableConfirmation(cfg: NotifSettings, lang: UILanguageCode): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: lookupString('notif.confirm.title', lang),
      body: lookupString('notif.confirm.body', lang, { time: formatHHMM(cfg.hour, cfg.minute) }),
      sound: 'default',
    },
    // A short interval (not null) so it reads as a real incoming push, and so we
    // can pin it to the brand channel on Android (channelId is only honoured on
    // the trigger). iOS ignores channelId.
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
  });
}

// Reconcile the OS schedule with the current settings. Cancels every slot
// we own (by ID, so we never touch notifications scheduled elsewhere) then
// schedules whichever slots are enabled. Both phases are parallel because
// the cancel/schedule ops are independent — order doesn't matter.
async function syncScheduledNotifications(settings: NotifMap, lang: UILanguageCode): Promise<void> {
  await Promise.all(SLOTS.map(slot =>
    Notifications.cancelScheduledNotificationAsync(NOTIF_IDS[slot]).catch(err => {
      // Cancel-by-id throws when no schedule exists for that ID (cold
      // start, first launch, after permission denial). Silent in prod.
      if (__DEV__) console.warn(`[notifications] cancel ${slot} (likely first-launch):`, err);
    }),
  ));
  await Promise.all(SLOTS.filter(slot => settings[slot].enabled).map(slot =>
    Notifications.scheduleNotificationAsync(buildScheduleRequest(slot, settings[slot], lang)).catch(err => {
      if (__DEV__) console.warn(`[notifications] failed to schedule ${slot}:`, err);
    }),
  ));
}

function hydrateFromStorage(raw: string | null): NotifMap {
  if (!raw) return DEFAULTS;
  let parsed: Partial<NotifMap>;
  try {
    parsed = JSON.parse(raw) as Partial<NotifMap>;
  } catch {
    return DEFAULTS;
  }
  // Strip orphan keys not in current DEFAULTS (e.g. older installs
  // persisted `quiz: {...}` which was removed 2026-05-22). Spreading
  // `{ ...DEFAULTS, ...parsed }` would silently KEEP the orphan and
  // re-persist it forever; instead copy only keys still in DEFAULTS.
  const merged: NotifMap = { ...DEFAULTS };
  for (const slot of SLOTS) {
    if (parsed[slot]) merged[slot] = { ...DEFAULTS[slot], ...parsed[slot] };
  }
  return merged;
}

// ─── Context ──────────────────────────────────────────────────────────────

interface NotificationsState {
  ready: boolean;
  settings: NotifMap;
  /** Returns true when the toggle actually flipped — false if permission denial blocked it. */
  setEnabled: (key: NotifKey, value: boolean) => Promise<boolean>;
  setSchedule: (key: NotifKey, hour: number, minute: number) => void;
  /**
   * Fires the OS permission prompt DIRECTLY (no in-app rationale Alert) and,
   * on grant, turns on the default morning + evening reminders. For surfaces
   * that are themselves the rationale — e.g. the full-screen "Follow Him"
   * opt-in — so the user doesn't get a rationale-on-a-rationale. Returns
   * whether permission ended up granted.
   */
  requestPermissionAndEnableDefaults: () => Promise<boolean>;
}

const Ctx = createContext<NotificationsState | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useUILanguage();
  const [settings, setSettings] = useState<NotifMap>(DEFAULTS);
  // `ready` is state (not a ref) so the scheduling effect's dep graph is
  // explicit — the effect re-fires the moment hydration completes. A ref
  // wouldn't trigger that re-fire; current code only re-runs on settings
  // change which is coincidence rather than intent.
  const [ready, setReady] = useState(false);

  // 1) Hydrate persisted settings from disk (once, on mount).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => setSettings(hydrateFromStorage(raw)))
      .catch(() => { /* fall through — defaults are already in state */ })
      .finally(() => setReady(true));
  }, []);

  // 2) Configure the Android notification channel (once, on mount).
  //    Re-runs on lang change so the channel display name in system
  //    Settings → Apps → Her Bible → Notifications follows UI language
  //    (Android allows the channel name to be updated by re-calling
  //    setNotificationChannelAsync with the same channelId).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: lookupString('notif.channel.name', lang),
      // HIGH = heads-up notification (slides down from the top of the
      // screen with sound + vibration, tappable to open the app). For a
      // devotional reminder the user explicitly opted into a specific
      // time slot, the heads-up presentation IS the value — a silent
      // shade-only entry gets missed and the reminder may as well not
      // exist. Users who find it intrusive can downgrade per-channel
      // priority in system Settings without uninstalling.
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: BRAND_ROSE,
      sound: 'default',
      // Without explicit vibration, HIGH channels still fire the
      // device's default vibration pattern — opt-in here to make sure
      // the heads-up presentation isn't suppressed by OEM defaults that
      // sometimes drop banners when vibration is unset.
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    }).catch(err => { if (__DEV__) console.warn('[notifications] channel setup failed:', err); });
  }, [lang]);

  // 3) Register the action category (so the "Amen" button appears under
  //    each notification). Re-runs on lang change to update the button
  //    label — setNotificationCategoryAsync is idempotent on the same ID.
  useEffect(() => {
    Notifications.setNotificationCategoryAsync(ACTION_CATEGORY, [
      {
        identifier: 'amen',
        buttonTitle: lookupString('notif.push.amenAction', lang),
        options: { opensAppToForeground: true },
      },
    ]).catch(err => { if (__DEV__) console.warn('[notifications] action category setup failed:', err); });
  }, [lang]);

  // 4) Sync OS-level schedule whenever settings OR lang changes. Title +
  //    body strings are baked in at schedule time, so a language switch
  //    must trigger a re-schedule for the next day's reminder to arrive
  //    in the new language.
  useEffect(() => {
    if (!ready) return;
    syncScheduledNotifications(settings, lang);
  }, [ready, settings, lang]);

  // 5) Re-sync every time the app returns to the foreground. A DAILY trigger
  //    bakes ONE day's title/body at schedule time and then repeats THAT exact
  //    payload every day — so without this, the "rotating" devotional content
  //    freezes on whichever day it was first scheduled. Re-baking on each
  //    foreground means the next reminder always reflects the CURRENT day's
  //    variant (pickDailyVariant is keyed on day-of-year). Re-arming a DAILY
  //    trigger just points it at the next HH:MM occurrence, so the user's chosen
  //    time is preserved and nothing drifts. Skipped when no slot is enabled so
  //    we don't issue pointless cancel calls on every resume.
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && SLOTS.some(s => settings[s].enabled)) {
        syncScheduledNotifications(settings, lang);
      }
    });
    return () => sub.remove();
  }, [ready, settings, lang]);

  // Durable analytics dimension — whether ANY reminder is currently on. Kept
  // live (ob_notifications only reflects the onboarding-time choice).
  useEffect(() => {
    if (!ready) return;
    setUserProps({ notif_enabled: SLOTS.some(s => settings[s].enabled) ? 'on' : 'off' });
  }, [ready, settings]);

  const persist = useCallback((next: NotifMap) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Permission gate. On Android 13+ this surfaces the POST_NOTIFICATIONS
  // runtime prompt; on iOS it's the standard authorization sheet. If the
  // user has previously denied permanently (canAskAgain === false), the
  // OS won't let us prompt again — fall back to a localized rationale
  // alert with a shortcut to system Settings.
  const setEnabled = useCallback(async (key: NotifKey, value: boolean): Promise<boolean> => {
    if (value && !(await ensureNotificationPermission(lang))) return false;
    const next = { ...settings, [key]: { ...settings[key], enabled: value } };
    persist(next);
    logEvent('reminder_toggle', { key, enabled: value, source: 'settings' });
    // On enable, fire an instant confirmation so the user sees it works now —
    // the scheduled daily reminder itself won't arrive until HH:MM.
    if (value) fireEnableConfirmation(next[key], lang).catch(err => {
      if (__DEV__) console.warn('[notifications] confirmation push failed:', err);
    });
    return true;
  }, [settings, lang, persist]);

  const setSchedule = useCallback((key: NotifKey, hour: number, minute: number) => {
    persist({ ...settings, [key]: { ...settings[key], hour, minute } });
  }, [settings, persist]);

  const requestPermissionAndEnableDefaults = useCallback(async (): Promise<boolean> => {
    // Direct OS prompt — the calling surface (e.g. the "Follow Him" screen)
    // already explains why, so we skip ensureNotificationPermission's
    // in-app rationale Alert. On a fresh device this shows the system
    // dialog; if permanently denied, getPermissionsAsync().granted stays
    // false and we just return false (the screen still dismisses).
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const next = await Notifications.requestPermissionsAsync();
      granted = next.granted;
    }
    if (granted) {
      // Turn on the two daily reminders so the opt-in delivers value
      // immediately; the sync effect schedules them off this state change.
      // (Evening reminder's key is `night`.)
      persist({
        ...settings,
        morning: { ...settings.morning, enabled: true },
        night: { ...settings.night, enabled: true },
      });
    }
    return granted;
  }, [settings, persist]);

  const value = useMemo<NotificationsState>(() => ({
    ready,
    settings,
    setEnabled,
    setSchedule,
    requestPermissionAndEnableDefaults,
  }), [ready, settings, setEnabled, setSchedule, requestPermissionAndEnableDefaults]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Permission gate. Two distinct paths:
//
//   (1) Permission not yet asked (canAskAgain === true):
//       Google Play policy requires an in-app rationale BEFORE the OS
//       permission prompt for sensitive permissions. We show a localized
//       Alert explaining WHY we need notifications, gated by the user's
//       active opt-in (they tapped the morning-reminder toggle), with a
//       "Continue" button that fires the OS prompt. If they dismiss the
//       rationale, we never call requestPermissionsAsync — that satisfies
//       Play's "transparency before request" guideline.
//
//   (2) Permission denied permanently (canAskAgain === false):
//       OS won't show the system prompt anymore. Fall back to a localized
//       alert with a deep-link to system Settings so the user can flip
//       the permission manually.
//
// Either path returns a boolean — true only when the OS actually granted
// permission, so the calling toggle stays OFF on any decline path.
async function ensureNotificationPermission(lang: UILanguageCode): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  // Path 1: fresh prompt. Show rationale, await user consent, then OS prompt.
  if (current.canAskAgain) {
    const userAgreed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        lookupString('notif.permission.title', lang),
        lookupString('notif.permission.body', lang),
        [
          {
            text: lookupString('common.cancel', lang),
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: lookupString('common.continue', lang),
            onPress: () => resolve(true),
          },
        ],
        // iOS dismissal via tap-outside / hardware back resolves to false
        // — `cancelable` doesn't apply on iOS but the explicit handler
        // covers both platforms.
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!userAgreed) return false;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  }

  // Path 2: permanently denied — deep-link to Settings.
  Alert.alert(
    lookupString('notif.permission.title', lang),
    lookupString('notif.permission.body', lang),
    [
      { text: lookupString('common.cancel', lang), style: 'cancel' },
      { text: lookupString('common.openSettings', lang), onPress: () => Linking.openSettings().catch(() => {}) },
    ],
  );
  return false;
}

// ─── Public hooks ─────────────────────────────────────────────────────────

export function useNotifications(): NotificationsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}

export function formatHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
