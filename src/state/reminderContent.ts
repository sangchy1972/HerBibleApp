// Pure, React-free reminder primitives shared by the expo-notifications
// scheduler (NotificationsContext) and the Notifee rich-notification scheduler
// (notifeeReminders). Deliberately free of any react-native / native-module
// import so it runs under plain ts-jest and can be the single source of truth
// for slot ids + daily content rotation (no drift between the two schedulers).

export type NotifKey = 'morning' | 'night' | 'plan';

// Stable identifiers for the EXPO-scheduled slots. `scheduleNotificationAsync`
// with the same identifier replaces the prior pending schedule, so
// cancel-then-reschedule never stacks duplicates. Order also drives
// `pickDailyVariant`'s salt — adding a slot is safe without manual bookkeeping.
export const NOTIF_IDS: Record<NotifKey, string> = {
  morning: 'her-bible.notif.morning',
  night:   'her-bible.notif.night',
  plan:    'her-bible.notif.plan',
};

export const SLOTS = Object.keys(NOTIF_IDS) as NotifKey[];

// Per-slot variant counts. MUST stay in sync with the
// `notif.push.<slot>.{title,body}.<n>` keys in the i18n catalog — picking a
// variant with no string would fall back to the raw key text.
export const VARIANTS_PER_SLOT: Record<NotifKey, number> = {
  morning: 10,
  night: 10,
  plan: 10,
};

// Deterministic 1..N variant keyed on day-of-year: the same slot on the same
// calendar day always yields the same content, while morning vs night vs plan
// differ (salt = slot index). Uses UTC date components so the day-of-year is
// DST-immune (a local-time subtraction floors to N-1 across spring-forward).
export function pickDailyVariant(slot: NotifKey, now: Date = new Date()): number {
  const start = Date.UTC(now.getFullYear(), 0, 0);
  const cur = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfYear = Math.floor((cur - start) / 86_400_000);
  const salt = SLOTS.indexOf(slot);
  return ((dayOfYear + salt) % VARIANTS_PER_SLOT[slot]) + 1;
}

// Next local Date at HH:MM strictly in the future (today if the time is still
// ahead, otherwise tomorrow). Notifee has no native "daily HH:MM" trigger, so
// its daily reminder is a TIMESTAMP at the next occurrence + a DAILY repeat.
export function nextOccurrence(hour: number, minute: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1);
  return d;
}
