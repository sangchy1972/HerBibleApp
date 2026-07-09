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
const BG_NUDGE_IDS: Record<RichSlot, string> = {
  morning: 'her-bible.notifee.bgnudge.morning',
  night:   'her-bible.notifee.bgnudge.night',
};
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
      channelId: NOTIFEE_CHANNEL,
      // Generated by the expo-notifications config plugin (app.json icon).
      smallIcon: 'notification_icon',
      largeIcon: o.picture,
      color: BRAND_ROSE,
      // BIGPICTURE = the large expanded photo; if the source can't be loaded
      // Notifee just shows a blank space, so this never throws.
      style: { type: AndroidStyle.BIGPICTURE, picture: o.picture },
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: pray, pressAction: { id: 'pray', launchActivity: 'default' } },
      ],
      visibility: AndroidVisibility.PUBLIC,
      importance: AndroidImportance.HIGH,   // heads-up banner from the top
    },
    ios: {
      categoryId: IOS_CATEGORY,
      sound: 'default',
      ...(iosUri ? { attachments: [{ url: iosUri }] } : {}),
    },
  };
}

// A daily morning/night prayer big-picture with rotating copy. `variantOffset`
// shifts the day-of-year copy pick so repeated re-engagement fires in one day
// don't all show the same words.
function buildDailyPrayer(slot: RichSlot, lang: UILanguageCode, id: string, picture: Picture, variantOffset = 0): Notification {
  const n = VARIANTS_PER_SLOT[slot];
  const v = ((pickDailyVariant(slot) - 1 + variantOffset) % n) + 1;
  return buildBig({
    id,
    title: lookupString(`notif.push.${slot}.title.${v}`, lang),
    body:  lookupString(`notif.push.${slot}.body.${v}`, lang),
    dataSlot: slot,
    picture,
    lang,
  });
}

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
  try {
    await notifee.createTriggerNotification(
      buildDailyPrayer(slot, lang, NOTIFEE_IDS[slot], picture),
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
    await scheduleOne('morning', cfg.morning.hour, cfg.morning.minute, cfg.morning.enabled, granted, lang);
    await scheduleOne('night', cfg.night.hour, cfg.night.minute, cfg.night.enabled, granted, lang);
  }).catch(() => {});
}

// ── Background re-engagement one-off ──────────────────────────────────────────
/** Schedule a single big reminder ~`delayMs` out for a slot (default 60s). Uses
 *  a distinct id so it never collides with the daily trigger; non-repeating, so
 *  it self-clears after firing. Caller owns the once/day gate + eligibility. */
export async function scheduleBackgroundNudge(slot: RichSlot, lang: UILanguageCode, delayMs = 60_000): Promise<void> {
  try {
    await ensureNotifeeChannel(lang);
    await ensureNotifeeIosCategory(lang);
    const picture = await pictureForSlot(slot);
    await notifee.createTriggerNotification(
      buildDailyPrayer(slot, lang, BG_NUDGE_IDS[slot], picture),
      timestampTrigger(Date.now() + delayMs, false),
    );
  } catch { /* never crash on a nudge */ }
}

/** Cancel a slot's background nudge — both a still-pending trigger AND an
 *  already-displayed one (`cancelNotification` covers both). Called the instant
 *  the user prays that slot, so a "time to pray" reminder never fires ~60s after
 *  they've already prayed. */
export async function cancelBackgroundNudge(slot: RichSlot): Promise<void> {
  try { await notifee.cancelNotification(BG_NUDGE_IDS[slot]); } catch { /* nothing to cancel */ }
}

// ── General re-engagement banner (~1 min after leaving the app) ────────────────
// The compliant proxy for "show a big banner whenever the user opens their
// phone": scheduled a minute after AppState → background, using a SINGLE id so a
// newer one always replaces any still-pending one. `fireIndex` shifts the copy
// so successive banners in a day read differently. Eligibility (cap / cooldown /
// quiet-hours) is owned by the caller via reengageNudge.shouldScheduleReengage.
const REENGAGE_ID = 'her-bible.notifee.reengage';
export async function scheduleReengageNudge(slot: RichSlot, lang: UILanguageCode, fireIndex: number, delayMs = 60_000): Promise<void> {
  try {
    await ensureNotifeeChannel(lang);
    await ensureNotifeeIosCategory(lang);
    const picture = await pictureForSlot(slot);
    await notifee.createTriggerNotification(
      buildDailyPrayer(slot, lang, REENGAGE_ID, picture, fireIndex),
      timestampTrigger(Date.now() + delayMs, false),
    );
  } catch { /* never crash on a nudge */ }
}

// ── Fixed-time daily EXTRAS as big pictures ────────────────────────────────────
// The four always-on devotional pushes (formerly plain-text via expo) rebuilt as
// Notifee big pictures so the user gets ≥5 large banners/day at fixed times. Copy
// reuses the existing i18n pools; data.slot maps to a valid PrayerFlow kind by
// time of day so a tap never crashes. Their OLD expo ids are still cancelled in
// NotificationsContext so an upgraded install never double-fires.
type ExtraBig = 'verse10' | 'gospel14' | 'afternoon16' | 'verse21';
const EXTRA_BIG_IDS: Record<ExtraBig, string> = {
  verse10:     'her-bible.notifee.verse10',
  gospel14:    'her-bible.notifee.gospel14',
  afternoon16: 'her-bible.notifee.afternoon16',
  verse21:     'her-bible.notifee.verse21',
};
const EXTRA_BIG_CFG: Record<ExtraBig, { hour: number; minute: number; copyKey: string; variants: number; imgSlot: BgSlot; dataSlot: RichSlot }> = {
  verse10:     { hour: 10, minute: 0, copyKey: 'morning',   variants: 10, imgSlot: 'morning', dataSlot: 'morning' },
  gospel14:    { hour: 14, minute: 0, copyKey: 'gospel',    variants: 5,  imgSlot: 'morning', dataSlot: 'morning' },
  afternoon16: { hour: 16, minute: 0, copyKey: 'afternoon', variants: 5,  imgSlot: 'evening', dataSlot: 'night' },
  verse21:     { hour: 21, minute: 0, copyKey: 'night',     variants: 10, imgSlot: 'evening', dataSlot: 'night' },
};
const EXTRA_BIG_KEYS = Object.keys(EXTRA_BIG_CFG) as ExtraBig[];

// Day-of-year rotation with a per-key salt (mirrors the expo pickVariant so the
// same day shows the same copy after the library swap). UTC components → DST-safe.
function extraVariant(salt: string, count: number): number {
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), 0, 0);
  const cur = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const doy = Math.floor((cur - start) / 86_400_000);
  let s = 0;
  for (let i = 0; i < salt.length; i++) s = (s * 31 + salt.charCodeAt(i)) >>> 0;
  return ((doy + s) % count) + 1;
}

async function scheduleExtraBig(key: ExtraBig, granted: boolean, lang: UILanguageCode): Promise<void> {
  try { await notifee.cancelTriggerNotification(EXTRA_BIG_IDS[key]); } catch { /* none pending */ }
  if (!granted) return;
  const c = EXTRA_BIG_CFG[key];
  const v = extraVariant(c.copyKey, c.variants);
  const picture = (await todayBgPictureUri(c.imgSlot)) ?? PICTURES[c.dataSlot];
  try {
    await notifee.createTriggerNotification(
      buildBig({
        id: EXTRA_BIG_IDS[key],
        title: lookupString(`notif.push.${c.copyKey}.title.${v}`, lang),
        body:  lookupString(`notif.push.${c.copyKey}.body.${v}`, lang),
        dataSlot: c.dataSlot,
        picture,
        lang,
      }),
      timestampTrigger(nextOccurrence(c.hour, c.minute).getTime(), true),
    );
  } catch { /* swallow — one missed extra is not fatal */ }
}

/** Reconcile the four fixed-time big-picture extras. Serialized on the same
 *  chain as the morning/night sync. Gated on OS permission (cleared when off). */
export function syncNotifeeExtras(granted: boolean, lang: UILanguageCode): void {
  chain = chain.then(async () => {
    await ensureNotifeeChannel(lang);
    await ensureNotifeeIosCategory(lang);
    for (const k of EXTRA_BIG_KEYS) await scheduleExtraBig(k, granted, lang);
  }).catch(() => {});
}
