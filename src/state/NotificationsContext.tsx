import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useUILanguage, type UILanguageCode } from './UILanguageContext';
import { lookupString } from '../i18n/lookup';

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

const VARIANTS_PER_SLOT = 3;
const ACTION_CATEGORY = 'her-bible.prayer';
const ANDROID_CHANNEL = 'her-bible.daily';
const BRAND_ROSE = '#E8619A';

// ─── Pure helpers (no React) ──────────────────────────────────────────────

// Deterministic 1..N variant pick that changes daily — same slot+day
// always yields the same content, but morning vs night vs plan get
// different content on the same day (salt = slot index in NOTIF_IDS).
function pickDailyVariant(slot: NotifKey): number {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - yearStart.getTime()) / 86_400_000);
  const salt = SLOTS.indexOf(slot);
  return ((dayOfYear + salt) % VARIANTS_PER_SLOT) + 1;
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
    persist({ ...settings, [key]: { ...settings[key], enabled: value } });
    return true;
  }, [settings, lang, persist]);

  const setSchedule = useCallback((key: NotifKey, hour: number, minute: number) => {
    persist({ ...settings, [key]: { ...settings[key], hour, minute } });
  }, [settings, persist]);

  const value = useMemo<NotificationsState>(() => ({
    ready,
    settings,
    setEnabled,
    setSchedule,
  }), [ready, settings, setEnabled, setSchedule]);

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
