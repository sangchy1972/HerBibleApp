import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useUILanguage, type UILanguageCode } from './UILanguageContext';
import { lookupString } from '../i18n/lookup';
import { logEvent, setUserProps } from '../services/firebase';
import { usePrayer } from './PrayerContext';
import { useCurrentDayYmd } from '../hooks/useCurrentDayYmd';
import { NOTIF_IDS, SLOTS, pickDailyVariant, type NotifKey } from './reminderContent';
import { syncNotifeeReminders, syncNotifeeExtras, syncHourlyVerseBanner, clearDeliveredBanners } from './notifeeReminders';

// ─── Public types ─────────────────────────────────────────────────────────

// Quiz removed 2026-05-22 — feature not yet built, hidden from settings UI
// to avoid Play Store reviewer "incomplete feature" flags. If quiz lands
// later: restore the union member here + DEFAULTS entry + NOTIF_IDS entry +
// NotificationsScreen's SECTIONS row + add new push.quiz.* catalog keys.
// NotifKey / NOTIF_IDS / SLOTS / pickDailyVariant now live in ./reminderContent
// (shared, pure) so the Notifee scheduler and this expo scheduler stay in sync.
export type { NotifKey };

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

const ACTION_CATEGORY = 'her-bible.prayer';
const ANDROID_CHANNEL = 'her-bible.daily';
// One-shot "finish your evening prayer to complete today" nudge — scheduled for
// 20:00 on days where morning is done but evening isn't; cancelled the instant
// evening completes or the day rolls. Stable id → replaces, never stacks.
const COMPLETE_STREAK_ID = 'her-bible.notif.completeStreak';

async function syncCompleteStreakNudge(mDone: boolean, eDone: boolean, todayYmd: string, lang: UILanguageCode): Promise<void> {
  const cancel = () => Notifications.cancelScheduledNotificationAsync(COMPLETE_STREAK_ID).catch(() => {});
  let granted = false;
  try { granted = (await Notifications.getPermissionsAsync()).granted; } catch { return; }
  if (!granted || !mDone || eDone) { await cancel(); return; }
  const [y, m, d] = todayYmd.split('-').map(Number);
  const when = new Date(y, m - 1, d, 20, 30, 0, 0);   // 20:30 — spaced from the 20:00 night reminder + 21:00 verse push
  if (when.getTime() <= Date.now()) { await cancel(); return; }   // already past 20:30 → skip today
  const v = (d % 3) + 1;                                            // 3 rotating copy variants
  await Notifications.scheduleNotificationAsync({
    identifier: COMPLETE_STREAK_ID,
    content: {
      title: lookupString(`notif.push.completeStreak.title.${v}`, lang),
      body:  lookupString(`notif.push.completeStreak.body.${v}`, lang),
      sound: 'default',
      categoryIdentifier: ACTION_CATEGORY,
      data: { slot: 'completeStreak' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
  }).catch(() => {});
}

// Serialize complete-streak (re)scheduling so a fast cancel (evening done) can't
// be overtaken by a slow schedule on the same stable id, which would otherwise
// leave a stale "finish your evening prayer" push after the user already did.
let completeStreakChain: Promise<void> = Promise.resolve();
function requestCompleteStreakSync(mDone: boolean, eDone: boolean, todayYmd: string, lang: UILanguageCode): void {
  completeStreakChain = completeStreakChain.then(() => syncCompleteStreakNudge(mDone, eDone, todayYmd, lang)).catch(() => {});
}
const BRAND_ROSE = '#E63F69';

// ─── Pure helpers (no React) ──────────────────────────────────────────────

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
    // Stable id so toggling reminders on/off repeatedly replaces this one-shot
    // instead of stacking pending entries against the iOS 64-notification cap.
    identifier: 'her-bible.notif.confirm',
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
  // morning + night are now RICH Notifee notifications (see notifeeReminders).
  // We still cancel their expo ids above every sync so an upgraded install's
  // legacy expo morning/night schedules are torn down and can't double-fire
  // alongside the Notifee ones. Expo now only owns the plain-text `plan` slot.
  await Promise.all(SLOTS.filter(slot => slot === 'plan' && settings[slot].enabled).map(slot =>
    Notifications.scheduleNotificationAsync(buildScheduleRequest(slot, settings[slot], lang)).catch(err => {
      if (__DEV__) console.warn(`[notifications] failed to schedule ${slot}:`, err);
    }),
  ));
}

// Read the live OS permission (Notifee shares the same grant) so the Notifee
// sync only schedules when notifications are actually allowed.
async function notifPermissionGranted(): Promise<boolean> {
  try { return (await Notifications.getPermissionsAsync()).granted; } catch { return false; }
}

// (Re)schedule the rich Notifee morning/night reminders to match settings.
// Reads permission first (Notifee never prompts — prompting stays on expo).
function syncRichReminders(settings: NotifMap, lang: UILanguageCode): void {
  notifPermissionGranted().then(granted => {
    syncNotifeeReminders(
      {
        morning: { hour: settings.morning.hour, minute: settings.morning.minute, enabled: settings.morning.enabled },
        night:   { hour: settings.night.hour,   minute: settings.night.minute,   enabled: settings.night.enabled },
      },
      granted,
      lang,
    );
    // Two fixed-time devotional big-picture extras (verse10/verse21) — always-on,
    // gated only on OS permission. Legacy expo schedules are torn down in
    // syncExtraNotifications so they never double-fire after an upgrade.
    syncNotifeeExtras(granted, lang);
    // The hourly VERSE banner (waking hours) — the "there's always a banner when
    // I open my phone" experience, showing the day's verse. Single non-stacking
    // stream (auto-timeout on Android, grouped on iOS).
    syncHourlyVerseBanner(granted, lang);
  }).catch(() => {});
}

// ─── Always-on "Other notifications" (no user toggle / time picker) ─────────
// Four fixed daily devotional pushes + a win-back series. These are NOT in the
// user's NotifMap settings — they're always on (gated only by OS permission)
// and surfaced read-only on the Other Notifications screen. Reusing the morning
// / night copy pools for the 10:00 / 21:00 slots keeps translation cost down;
// 16:00 (afternoon) and 14:00 (Gospel & Psalms) have their own copy.
type ExtraKey = 'verse10' | 'afternoon16' | 'verse21' | 'gospel14';
const EXTRA_IDS: Record<ExtraKey, string> = {
  verse10:     'her-bible.notif.verse10',
  afternoon16: 'her-bible.notif.afternoon16',
  verse21:     'her-bible.notif.verse21',
  gospel14:    'her-bible.notif.gospel14',
};
// copyKey → which `notif.push.<copyKey>.{title,body}.<n>` pool to read; variants
// MUST match the catalog count for that pool.
const EXTRA_CONFIG: Record<ExtraKey, { hour: number; minute: number; copyKey: string; variants: number }> = {
  verse10:     { hour: 10, minute: 0, copyKey: 'morning',   variants: 10 },
  afternoon16: { hour: 16, minute: 0, copyKey: 'afternoon', variants: 5 },
  verse21:     { hour: 21, minute: 0, copyKey: 'night',     variants: 10 },
  gospel14:    { hour: 14, minute: 0, copyKey: 'gospel',    variants: 5 },
};
const EXTRA_KEYS = Object.keys(EXTRA_IDS) as ExtraKey[];

// Read-only descriptor for the Other Notifications screen. These are always on
// and not user-configurable (display only) — label + description + fixed time.
export interface OtherNotifInfo { key: string; labelKey: string; descKey: string; time: string | null }
export const OTHER_NOTIFICATIONS: OtherNotifInfo[] = [
  { key: 'verse10',     labelKey: 'otherNotif.verse10.label',     descKey: 'otherNotif.verse10.desc',     time: '10:00' },
  { key: 'gospel14',    labelKey: 'otherNotif.gospel14.label',    descKey: 'otherNotif.gospel14.desc',    time: '14:00' },
  { key: 'afternoon16', labelKey: 'otherNotif.afternoon16.label', descKey: 'otherNotif.afternoon16.desc', time: '16:00' },
  { key: 'verse21',     labelKey: 'otherNotif.verse21.label',     descKey: 'otherNotif.verse21.desc',     time: '21:00' },
  { key: 'winback',     labelKey: 'otherNotif.winback.label',     descKey: 'otherNotif.winback.desc',     time: null },
];

// Win-back: a single notification fired N days after the user's last app open,
// rescheduled on every foreground so an ACTIVE user never receives one. Tapered
// (not daily) to avoid notification spam while still re-engaging across a month.
const WINBACK_ID_PREFIX = 'her-bible.notif.winback.';
const WINBACK_DAYS = [1, 2, 3, 5, 7, 10, 14, 21, 30] as const;
const WINBACK_HOUR = 10;

// Day-of-year rotation with a per-key salt (mirrors pickDailyVariant).
function pickVariant(saltKey: string, count: number): number {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - yearStart.getTime()) / 86_400_000);
  let salt = 0;
  for (let i = 0; i < saltKey.length; i++) salt = (salt * 31 + saltKey.charCodeAt(i)) >>> 0;
  return ((dayOfYear + salt) % count) + 1;
}

function buildExtraRequest(key: ExtraKey, lang: UILanguageCode, hour: number, minute: number): Notifications.NotificationRequestInput {
  const c = EXTRA_CONFIG[key];
  const variant = pickVariant(key, c.variants);
  return {
    identifier: EXTRA_IDS[key],
    content: {
      title: lookupString(`notif.push.${c.copyKey}.title.${variant}`, lang),
      body:  lookupString(`notif.push.${c.copyKey}.body.${variant}`, lang),
      sound: 'default',
      categoryIdentifier: ACTION_CATEGORY,
      data: { slot: key },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
  };
}

// Collision avoidance: no two of OUR notifications fire at the exact same HH:MM.
// Given a desired (hour, minute) and the set of minutes-of-day already taken,
// step forward in 10-min increments to the first free slot. Hard limits: never
// push more than +60 min from the base and never cross midnight — a "21:00
// evening verse" must never wander to 2 AM. If the whole window is saturated
// (only possible with absurdly many user reminders), we accept a collision at
// the base time rather than firing at a nonsensical hour.
function nextFreeSlot(hour: number, minute: number, taken: Set<number>): { hour: number; minute: number } {
  const base = hour * 60 + minute;
  let chosen = base;
  for (let cand = base; cand <= base + 60 && cand < 24 * 60; cand += 10) {
    if (!taken.has(cand)) { chosen = cand; break; }
  }
  taken.add(chosen);
  return { hour: Math.floor(chosen / 60), minute: chosen % 60 };
}

// Cancel + (re)schedule all always-on extras and the win-back series. Gated on
// OS permission: if not granted we just clear them. Safe to call repeatedly —
// stable identifiers replace, never stack.
const cancelAllExtras = () => Promise.all([
  ...EXTRA_KEYS.map(k => Notifications.cancelScheduledNotificationAsync(EXTRA_IDS[k]).catch(() => {})),
  ...WINBACK_DAYS.map(d => Notifications.cancelScheduledNotificationAsync(`${WINBACK_ID_PREFIX}${d}`).catch(() => {})),
]);

async function syncExtraNotifications(settings: NotifMap, lang: UILanguageCode): Promise<void> {
  // Check permission FIRST, before touching anything. A transient read failure
  // must NOT wipe an already-armed schedule (that would silently kill win-back
  // for the exact inactive users it targets). On throw → leave things as-is.
  let granted = false;
  try { granted = (await Notifications.getPermissionsAsync()).granted; }
  catch { return; }
  // Genuinely no permission → clear our slots (they can't fire anyway) and stop.
  if (!granted) { await cancelAllExtras(); return; }

  await cancelAllExtras();

  // The four fixed-time devotional extras (verse10/gospel14/afternoon16/verse21)
  // are now Notifee BIG PICTURES (see notifeeReminders.syncNotifeeExtras). We
  // STILL cancel their legacy expo ids in cancelAllExtras() above so an upgraded
  // install's old plain-text schedules are torn down and can't double-fire next
  // to the new big-picture versions. Expo now owns ONLY the win-back series here.
  const taken = new Set<number>();
  for (const s of SLOTS) if (settings[s].enabled) taken.add(settings[s].hour * 60 + settings[s].minute);
  const wb = nextFreeSlot(WINBACK_HOUR, 0, taken);

  const now = Date.now();
  await Promise.all(WINBACK_DAYS.map(d => {
    const date = new Date();
    date.setDate(date.getDate() + d);
    date.setHours(wb.hour, wb.minute, 0, 0);
    // A DATE trigger in the past is silently dropped by the OS. With WINBACK_DAYS
    // starting at 1 this never happens, but guard it so a future tweak (d=0, an
    // earlier hour, a clock change) can't quietly break delivery.
    if (date.getTime() <= now) return Promise.resolve();
    return Notifications.scheduleNotificationAsync({
      identifier: `${WINBACK_ID_PREFIX}${d}`,
      content: {
        title: lookupString(`notif.winback.${d}.title`, lang),
        body:  lookupString(`notif.winback.${d}.body`, lang),
        sound: 'default',
        categoryIdentifier: ACTION_CATEGORY,
        data: { slot: 'winback', day: d },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
      },
    }).catch(err => {
      if (__DEV__) console.warn(`[notifications] failed to schedule winback ${d}:`, err);
    });
  }));
}

// Serialize extra-sync calls so two overlapping invocations (the settings/lang
// effect firing while an AppState 'active' handler runs) can never interleave
// their cancel/schedule phases and drop a freshly-armed notification. The
// optional debounce collapses rapid foreground churn (app-switching) — a re-sync
// skipped within the window is a no-op because nothing has changed.
let extraSyncChain: Promise<void> = Promise.resolve();
let lastExtraSyncAt = 0;
function requestExtraSync(settings: NotifMap, lang: UILanguageCode, debounceMs = 0): Promise<void> {
  const now = Date.now();
  if (debounceMs > 0 && now - lastExtraSyncAt < debounceMs) return extraSyncChain;
  lastExtraSyncAt = now;
  extraSyncChain = extraSyncChain.then(() => syncExtraNotifications(settings, lang)).catch(() => {});
  return extraSyncChain;
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
  /** Live OS notification-permission status (refreshed on mount + foreground +
   *  after any grant). "Reminders actually active" = permissionGranted && a slot
   *  is enabled — DEFAULTS have slots enabled, so this flag is the real signal. */
  permissionGranted: boolean;
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
  /** Read-only permission re-check (never prompts). For coming back from
   *  the system settings page — adopts a switch flipped outside the app. */
  syncPermissionFromSystem: () => Promise<boolean>;
  /** Atomically set BOTH reminder times + enable them and request OS permission,
   *  in a single persist (no stale-settings race). Returns whether permission
   *  ended up granted. Used by the "set your reminders" nudge. */
  configureReminders: (
    morning: { hour: number; minute: number },
    evening: { hour: number; minute: number },
  ) => Promise<boolean>;
  /** Enable ONE reminder slot at a specific time and request OS permission, in a
   *  single persist. Returns whether permission ended up granted. Used by the
   *  post-prayer "Make Prayer a Habit" sheet. */
  enableReminderAt: (key: NotifKey, hour: number, minute: number) => Promise<boolean>;
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
  const [permissionGranted, setPermissionGranted] = useState(false);
  const prayer = usePrayer();
  const todayYmd = useCurrentDayYmd();

  // 1) Hydrate persisted settings from disk (once, on mount).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => setSettings(hydrateFromStorage(raw)))
      .catch(() => { /* fall through — defaults are already in state */ })
      .finally(() => setReady(true));
  }, []);

  // 1b) Track OS notification permission on mount + every foreground, so
  //     consumers (reminder toggle, set-time popup) know whether reminders can
  //     actually fire (DEFAULTS enable slots even before permission is granted).
  useEffect(() => {
    const check = () => Notifications.getPermissionsAsync()
      .then(p => setPermissionGranted(!!p.granted))
      .catch(() => {});
    check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);

  // 1c) Complete-streak evening nudge — reschedule/cancel whenever prayer state
  //     or the calendar day changes (morning done + evening pending → 20:00 push).
  useEffect(() => {
    if (!ready) return;
    requestCompleteStreakSync(prayer.mDone, prayer.eDone, todayYmd, lang);
  }, [ready, prayer.mDone, prayer.eDone, todayYmd, lang]);

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
    syncRichReminders(settings, lang);  // rich Notifee morning/night reminders
    requestExtraSync(settings, lang);   // always-on extras + win-back (serialized; gated on OS permission inside)
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
      if (state !== 'active') return;
      // Always re-sync extras on resume — this re-bakes the day's variant AND
      // pushes the win-back series out, so an active user never receives one.
      // Debounced so rapid app-switching can't trigger a cancel/schedule storm.
      requestExtraSync(settings, lang, 60_000);
      if (SLOTS.some(s => settings[s].enabled)) syncScheduledNotifications(settings, lang);
      // Re-bake the rich Notifee reminders too so their daily-variant content
      // (baked once into the trigger) advances to the current day's copy. Called
      // unconditionally now: the four big-picture EXTRAS are always-on (not gated
      // by the morning/night toggles), so they must re-bake on every foreground.
      syncRichReminders(settings, lang);
      // Clear the verse banners she's already scrolled past. Opening the app is
      // proof she has seen them, and on iOS this is the ONLY way they ever leave
      // Notification Center — there is no expiry for a local notification there,
      // so without this the tray accumulates every banner ever fired.
      clearDeliveredBanners();
    });
    return () => sub.remove();
  }, [ready, settings, lang]);

  // 6) (Removed) The leave-triggered "background re-engagement" nudge. Per user
  //    feedback it was unnecessary (and awkward — firing after they'd already
  //    prayed). Its job is now covered by the hourly VERSE banner scheduled in
  //    syncHourlyVerseBanner, which keeps a fresh banner in the tray through the
  //    day without hooking app-leave / device-unlock.

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
    if (value) setPermissionGranted(true);   // got past the permission gate → granted
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
    // Direct OS prompt — the calling surface (e.g. the onboarding notify step)
    // already explains why, so we skip the in-app rationale Alert. Call
    // requestPermissionsAsync FIRST, with no getPermissionsAsync pre-check:
    // that pre-check was a second serial native round-trip that delayed the
    // system dialog by a visible beat, and request itself is a safe no-op when
    // already granted / permanently denied (it just resolves with the current
    // status, no dialog). So the OS prompt now appears on the first bridge call.
    let granted = false;
    try {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    } catch { /* no native module (Expo Go / unsupported) — treat as denied */ }
    setPermissionGranted(granted);
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

  // Read the permission WITHOUT prompting, and adopt it if it turned on behind
  // our back — which is exactly what happens when the user flips the switch on
  // the system settings page we deep-linked her to.
  //
  // getPermissionsAsync, NOT requestPermissionsAsync. The latter looks harmless
  // (it is a no-op once permission is settled) but for a user who has never
  // been asked it RAISES THE OS DIALOG. On a return-from-Settings check that
  // means someone who deliberately declined to flip the switch gets a system
  // prompt thrown at her the instant she reappears — a second ask she never
  // invited, one frame after she said no by walking away.
  const syncPermissionFromSystem = useCallback(async (): Promise<boolean> => {
    let granted = false;
    try {
      granted = (await Notifications.getPermissionsAsync()).granted;
    } catch { /* no native module — treat as denied */ }
    setPermissionGranted(granted);
    // Same defaults as requestPermissionAndEnableDefaults: permission alone
    // delivers nothing, the two daily reminders are the actual feature.
    if (granted && !(settings.morning.enabled && settings.night.enabled)) {
      persist({
        ...settings,
        morning: { ...settings.morning, enabled: true },
        night: { ...settings.night, enabled: true },
      });
    }
    return granted;
  }, [settings, persist]);

  const configureReminders = useCallback(async (
    m: { hour: number; minute: number },
    e: { hour: number; minute: number },
  ): Promise<boolean> => {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    setPermissionGranted(granted);
    // One atomic persist: both times + enabled. If permission was denied the
    // times are still stored (they apply the moment permission is later granted).
    persist({
      ...settings,
      morning: { hour: m.hour, minute: m.minute, enabled: true },
      night:   { hour: e.hour, minute: e.minute, enabled: true },
    });
    logEvent('reminder_toggle', { key: 'configure', enabled: true, source: 'nudge' });
    return granted;
  }, [settings, persist]);

  const enableReminderAt = useCallback(async (key: NotifKey, hour: number, minute: number): Promise<boolean> => {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    setPermissionGranted(granted);
    const next = { ...settings, [key]: { hour, minute, enabled: true } };
    persist(next);
    logEvent('reminder_toggle', { key, enabled: true, source: 'habit' });
    // Instant confirmation push (parity with the settings toggle) — only when
    // permission actually granted.
    if (granted) fireEnableConfirmation(next[key], lang).catch(() => {});
    return granted;
  }, [settings, persist, lang]);

  const value = useMemo<NotificationsState>(() => ({
    ready,
    settings,
    permissionGranted,
    setEnabled,
    setSchedule,
    requestPermissionAndEnableDefaults,
    syncPermissionFromSystem,
    configureReminders,
    enableReminderAt,
  }), [ready, settings, permissionGranted, setEnabled, setSchedule, requestPermissionAndEnableDefaults, syncPermissionFromSystem, configureReminders, enableReminderAt]);

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
