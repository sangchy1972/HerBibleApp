// Rich "big-picture" morning/evening prayer reminders via Notifee.
//
// WHY Notifee (not expo-notifications): expo-notifications on Android supports
// text only — no embedded big image. Notifee renders an AndroidStyle.BIGPICTURE
// notification (a prayer photo + title + expanded copy + a "PRAY" action button),
// matching the large-notification look the user wants.
//
// COEXISTENCE: Notifee owns ONLY the morning + night daily reminders (and the
// background re-engagement one-off). Everything else (plan slot, always-on
// extras, win-back, complete-streak, the enable-confirmation) stays on
// expo-notifications. To guarantee morning/evening never DOUBLE-fire, the expo
// scheduler always cancels its own morning/night ids and no longer schedules
// them (see NotificationsContext.syncScheduledNotifications) — Notifee is the
// sole writer for those two slots, using its OWN id namespace below.
//
// PERMISSION: Notifee never prompts here — all permission prompting stays on the
// existing expo paths. On Android 13+/iOS the OS grant is shared, so Notifee
// simply reads it (via expo's getPermissionsAsync) and schedules when granted.

import { Image, Platform } from 'react-native';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
  TriggerType,
  RepeatFrequency,
  type Notification,
  type TimestampTrigger,
} from '@notifee/react-native';
import { lookupString } from '../i18n/lookup';
import type { UILanguageCode } from './UILanguageContext';
import { pickDailyVariant, nextOccurrence, VARIANTS_PER_SLOT } from './reminderContent';
import { todayBgPictureUri, type BgSlot } from './notifBackgroundImage';
import { todayVerseForNotif } from './notifVerse';

export type RichSlot = 'morning' | 'night';

// A Notifee picture can be a require() handle (number) or a uri/path string.
type Picture = number | string;

// morning slot → morning background, night slot → evening background.
const BG_FOR_SLOT: Record<RichSlot, BgSlot> = { morning: 'morning', night: 'evening' };

// Resolve today's cached verse background for a slot, falling back to the
// bundled asset when it hasn't been cached yet (offline first-launch etc.).
async function pictureForSlot(slot: RichSlot): Promise<Picture> {
  const uri = await todayBgPictureUri(BG_FOR_SLOT[slot]);
  return uri ?? PICTURES[slot];
}

// Notifee's OWN channel + ids — deliberately DISTINCT from the expo channel
// (`her-bible.daily`) and expo ids so the two libraries' registries never race
// or collide on a shared id.
export const NOTIFEE_CHANNEL = 'her-bible.daily.rich';
const NOTIFEE_IDS: Record<RichSlot, string> = {
  morning: 'her-bible.notifee.morning',
  night:   'her-bible.notifee.night',
};
// Ids from the retired leave-triggered "background nudge" — cancelled on sync so
// an upgraded install tears down any still-pending ones.
const RETIRED_NUDGE_IDS = ['her-bible.notifee.bgnudge.morning', 'her-bible.notifee.bgnudge.night', 'her-bible.notifee.reengage'];
const IOS_CATEGORY = 'her-bible.prayer.rich';
const BRAND_ROSE = '#E63F69';

// Bundled photos — offline-safe (resolvable even when the app is killed and a
// scheduled trigger fires with no network), unlike a CDN URL. Reuses the
// already-bundled Follow-Him day/night frames (woman in a field).
const PICTURES: Record<RichSlot, number> = {
  morning: require('../../assets/follow_him_day.webp'),
  night:   require('../../assets/follow_him_night.webp'),
};

// iOS attachments need a file/url string. If the picture is already a uri/path
// string use it directly; if it's a bundled require() handle, resolve it. On
// failure we omit the attachment (iOS then shows a text notification with the
// PRAY action — never a crash).
function iosAttachmentUri(picture: Picture): string | undefined {
  if (typeof picture === 'string') return picture;
  try { return Image.resolveAssetSource(picture)?.uri || undefined; } catch { return undefined; }
}

// ── Channel / category setup (idempotent) ─────────────────────────────────────
export async function ensureNotifeeChannel(lang: UILanguageCode): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.createChannel({
      id: NOTIFEE_CHANNEL,
      name: lookupString('notif.channel.name', lang),
      importance: AndroidImportance.HIGH,   // heads-up banner + sound
      lights: true,
      lightColor: BRAND_ROSE,
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
      visibility: AndroidVisibility.PUBLIC,
    });
  } catch { /* never crash on channel setup */ }
}

export async function ensureNotifeeIosCategory(lang: UILanguageCode): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await notifee.setNotificationCategories([
      { id: IOS_CATEGORY, actions: [{ id: 'pray', title: lookupString('notif.push.prayAction', lang), foreground: true }] },
    ]);
  } catch { /* ignore — action button just won't show on iOS */ }
}

// ── Notification builder ──────────────────────────────────────────────────────
// Low-level big-picture builder. `picture` is the expanded photo + large icon
// (a bundled require handle OR a file:// uri from the daily-bg cache). `dataSlot`
// MUST be a value DeepLinkHandler.routeForSlot understands ('morning' | 'night'
// | 'plan') — PrayerFlow crashes without a valid kind, so extras/re-engagement
// map to 'morning'/'night' by time of day.
interface BigOpts {
  id: string;
  title: string;
  body: string;
  dataSlot: string;
  picture: Picture;
  lang: UILanguageCode;
  /** Android channel override (the hourly verse banner uses its own channel). */
  channelId?: string;
  /** Auto-dismiss after N ms (Android). Keeps a repeating stream from STACKING —
   *  each banner clears before the next fires, so the tray never piles up. */
  timeoutAfter?: number;
  /** iOS grouping key so a repeating stream collapses into ONE expandable group
   *  in Notification Center instead of N separate rows. */
  threadId?: string;
}
function buildBig(o: BigOpts): Notification {
  const pray = lookupString('notif.push.prayAction', o.lang);
  const iosUri = iosAttachmentUri(o.picture);
  return {
    id: o.id,
    title: o.title,
    body: o.body,
    data: { slot: o.dataSlot },
    android: {
      channelId: o.channelId ?? NOTIFEE_CHANNEL,
      // Generated by the expo-notifications config plugin (app.json icon).
      smallIcon: 'notification_icon',
      largeIcon: o.picture,
      color: BRAND_ROSE,
      // BIGPICTURE = the large expanded photo; if the source can't be loaded
      // Notifee just shows a blank space, so this never throws. Body (the verse
      // text) is shown as the expanded summary line under the picture.
      style: { type: AndroidStyle.BIGPICTURE, picture: o.picture },
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: pray, pressAction: { id: 'pray', launchActivity: 'default' } },
      ],
      visibility: AndroidVisibility.PUBLIC,
      importance: AndroidImportance.HIGH,   // heads-up banner from the top
      ...(o.timeoutAfter ? { timeoutAfter: o.timeoutAfter } : {}),
    },
    ios: {
      categoryId: IOS_CATEGORY,
      sound: 'default',
      ...(iosUri ? { attachments: [{ url: iosUri }] } : {}),
      ...(o.threadId ? { threadId: o.threadId } : {}),
    },
  };
}

// The banners now show the DAY'S VERSE (reference + text), like the verse card —
// per the user's request to drop marketing copy from the big pictures. Falls
// back to the slot's rotating devotional copy only if the verse can't be
// resolved offline (should be rare — bundled verses always exist).
async function verseTitleBody(slot: RichSlot, lang: UILanguageCode): Promise<{ title: string; body: string }> {
  const v = await todayVerseForNotif(lang);
  if (v && v.text) return { title: v.reference || lookupString('notif.channel.name', lang), body: v.text };
  const n = VARIANTS_PER_SLOT[slot];
  const k = ((pickDailyVariant(slot) - 1) % n) + 1;
  return {
    title: lookupString(`notif.push.${slot}.title.${k}`, lang),
    body:  lookupString(`notif.push.${slot}.body.${k}`, lang),
  };
}

// Auto-dismiss window for the fixed daily banners (Android) so they don't linger
// and stack with the hourly stream.
const FIXED_TIMEOUT_MS = 3 * 60 * 60_000;   // 3h

function timestampTrigger(when: number, repeat: boolean): TimestampTrigger {
  return {
    type: TriggerType.TIMESTAMP,
    timestamp: when,
    ...(repeat ? { repeatFrequency: RepeatFrequency.DAILY } : {}),
    alarmManager: { allowWhileIdle: true },   // fire even in Doze
  };
}

// ── Daily reminder scheduling ─────────────────────────────────────────────────
// Serialize so an overlapping foreground/settings sync can't interleave a slow
// schedule after a fast cancel (mirrors the expo completeStreakChain pattern).
let chain: Promise<void> = Promise.resolve();

async function scheduleOne(slot: RichSlot, hour: number, minute: number, enabled: boolean, granted: boolean, lang: UILanguageCode): Promise<void> {
  try { await notifee.cancelTriggerNotification(NOTIFEE_IDS[slot]); } catch { /* none pending */ }
  if (!enabled || !granted) return;
  const when = nextOccurrence(hour, minute).getTime();
  const picture = await pictureForSlot(slot);   // today's verse bg (bundled fallback)
  const { title, body } = await verseTitleBody(slot, lang);
  try {
    await notifee.createTriggerNotification(
      buildBig({ id: NOTIFEE_IDS[slot], title, body, dataSlot: slot, picture, lang, timeoutAfter: FIXED_TIMEOUT_MS }),
      timestampTrigger(when, true),
    );
  } catch { /* swallow — a failed schedule just means no rich reminder this cycle */ }
}

export interface RichSlotConfig { hour: number; minute: number; enabled: boolean }

/** Reconcile the Notifee morning/night triggers with current settings +
 *  permission. Called on mount, settings change, lang change, and foreground
 *  (the foreground re-run also refreshes the baked daily-variant content). */
export function syncNotifeeReminders(
  cfg: Record<RichSlot, RichSlotConfig>,
  granted: boolean,
  lang: UILanguageCode,
): void {
  chain = chain.then(async () => {
    await ensureNotifeeChannel(lang);
    await ensureNotifeeIosCategory(lang);
    // Tear down the retired leave-triggered nudge ids from older installs.
    for (const id of RETIRED_NUDGE_IDS) { try { await notifee.cancelTriggerNotification(id); } catch { /* none */ } }
    await scheduleOne('morning', cfg.morning.hour, cfg.morning.minute, cfg.morning.enabled, granted, lang);
    await scheduleOne('night', cfg.night.hour, cfg.night.minute, cfg.night.enabled, granted, lang);
  }).catch(() => {});
}

// ── Fixed-time daily EXTRAS as big pictures ────────────────────────────────────
// Reduced from four to TWO always-on devotional banners (per the user's "cut the
// ordinary pushes in half" so the copy pool lasts longer): a mid-morning and an
// evening slot. Content is the DAY'S VERSE (like the card), image is the daily
// verse background. data.slot maps to a valid PrayerFlow kind so a tap never
// crashes. The old four expo ids are still cancelled in NotificationsContext so
// an upgraded install never double-fires.
type ExtraBig = 'verse10' | 'verse21';
const EXTRA_BIG_IDS: Record<ExtraBig, string> = {
  verse10: 'her-bible.notifee.verse10',
  verse21: 'her-bible.notifee.verse21',
};
const EXTRA_BIG_CFG: Record<ExtraBig, { hour: number; minute: number; imgSlot: BgSlot; dataSlot: RichSlot }> = {
  verse10: { hour: 10, minute: 0, imgSlot: 'morning', dataSlot: 'morning' },
  verse21: { hour: 21, minute: 0, imgSlot: 'evening', dataSlot: 'night' },
};
const EXTRA_BIG_KEYS = Object.keys(EXTRA_BIG_CFG) as ExtraBig[];
// Ids of the extras we RETIRED (were big pictures in the prior version) so an
// upgraded install tears their pending triggers down instead of leaving them.
const RETIRED_EXTRA_IDS = ['her-bible.notifee.gospel14', 'her-bible.notifee.afternoon16'];

async function scheduleExtraBig(key: ExtraBig, granted: boolean, lang: UILanguageCode): Promise<void> {
  try { await notifee.cancelTriggerNotification(EXTRA_BIG_IDS[key]); } catch { /* none pending */ }
  if (!granted) return;
  const c = EXTRA_BIG_CFG[key];
  const picture = (await todayBgPictureUri(c.imgSlot)) ?? PICTURES[c.dataSlot];
  const { title, body } = await verseTitleBody(c.dataSlot, lang);
  try {
    await notifee.createTriggerNotification(
      buildBig({ id: EXTRA_BIG_IDS[key], title, body, dataSlot: c.dataSlot, picture, lang, timeoutAfter: FIXED_TIMEOUT_MS }),
      timestampTrigger(nextOccurrence(c.hour, c.minute).getTime(), true),
    );
  } catch { /* swallow — one missed extra is not fatal */ }
}

/** Reconcile the two fixed-time big-picture extras + tear down retired ids.
 *  Serialized on the same chain as the morning/night sync. */
export function syncNotifeeExtras(granted: boolean, lang: UILanguageCode): void {
  chain = chain.then(async () => {
    await ensureNotifeeChannel(lang);
    await ensureNotifeeIosCategory(lang);
    for (const id of RETIRED_EXTRA_IDS) { try { await notifee.cancelTriggerNotification(id); } catch { /* none */ } }
    for (const k of EXTRA_BIG_KEYS) await scheduleExtraBig(k, granted, lang);
  }).catch(() => {});
}

// ── Hourly verse banner (the "keeps showing up when you open your phone") ──────
// The compliant, reliable way to reproduce the competitor's "there's always a
// banner when I unlock" behaviour: schedule ONE big-picture per waking hour, each
// a DAILY-repeating trigger. We CANNOT listen for the OS unlock event in a Play-
// compliant Expo app; instead a fresh verse banner drops from the top every hour
// during the day and sits in the tray between fires, so it's there whenever the
// user looks. Content = the day's VERSE (like the card).
//
// NO STACKING ("弹窗不能重叠"): every hour's banner auto-dismisses after ~55 min
// (Android timeoutAfter) so at most ONE hourly banner is ever in the tray; on iOS
// they share a threadId so Notification Center collapses them into one group.
// Fired at :30 past the hour so it never coincides with the :00 fixed reminders.
const HOURLY_CHANNEL = 'her-bible.verse.hourly';
const HOURLY_THREAD = 'her-bible.verse.hourly';
const HOURLY_START_HOUR = 8;    // first banner at 08:30
const HOURLY_END_HOUR = 22;     // last banner at 22:30 — silent overnight (none scheduled)
const HOURLY_MINUTE = 30;       // :30 → never collides with the :00 fixed slots
const HOURLY_TIMEOUT_MS = 55 * 60_000;   // auto-clear before the next hour → never stacks

async function ensureHourlyChannel(lang: UILanguageCode): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.createChannel({
      id: HOURLY_CHANNEL,
      name: lookupString('notif.channel.name', lang),
      importance: AndroidImportance.HIGH,   // still heads-up (drops from the top)…
      lights: true,
      lightColor: BRAND_ROSE,
      vibration: false,                     // …but no buzz every hour
      visibility: AndroidVisibility.PUBLIC,
    });
  } catch { /* never crash on channel setup */ }
}

function hourlyId(hour: number): string {
  return `her-bible.notifee.verse.h${String(hour).padStart(2, '0')}`;
}

/** Reconcile the hourly verse banner set. Cancels the full 0–23 range first (so a
 *  narrowed window tears down cleanly), then schedules the waking-hours window.
 *  Called from syncRichReminders (mount / settings / lang / foreground) so the
 *  verse + background advance each day. */
export function syncHourlyVerseBanner(granted: boolean, lang: UILanguageCode): void {
  chain = chain.then(async () => {
    await ensureHourlyChannel(lang);
    await ensureNotifeeIosCategory(lang);
    // Tear down every hour id first — handles a changed window + the "off" case.
    for (let h = 0; h < 24; h++) { try { await notifee.cancelTriggerNotification(hourlyId(h)); } catch { /* none */ } }
    if (!granted) return;
    const verse = await todayVerseForNotif(lang);
    const body = verse?.text || '';
    if (!body) return;   // nothing to show yet (cache not warmed) — try again next sync
    const title = verse?.reference || lookupString('notif.channel.name', lang);
    const morningPic = (await todayBgPictureUri('morning')) ?? PICTURES.morning;
    const eveningPic = (await todayBgPictureUri('evening')) ?? PICTURES.night;
    for (let h = HOURLY_START_HOUR; h <= HOURLY_END_HOUR; h++) {
      const picture: Picture = h < 15 ? morningPic : eveningPic;
      const dataSlot: RichSlot = h < 15 ? 'morning' : 'night';
      try {
        await notifee.createTriggerNotification(
          buildBig({
            id: hourlyId(h), title, body, dataSlot, picture, lang,
            channelId: HOURLY_CHANNEL, timeoutAfter: HOURLY_TIMEOUT_MS, threadId: HOURLY_THREAD,
          }),
          timestampTrigger(nextOccurrence(h, HOURLY_MINUTE).getTime(), true),
        );
      } catch { /* one missed hour is not fatal */ }
    }
  }).catch(() => {});
}
