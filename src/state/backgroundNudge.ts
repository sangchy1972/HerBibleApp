// Pure eligibility logic for the "background re-engagement" prayer nudge.
//
// Product rule: when the user LEAVES the app (backgrounds it) near a prayer
// reminder time WITHOUT having prayed that slot, we schedule a one-off big
// reminder ~1 minute later — so shortly after they put the phone down / pick it
// back up, the prayer reminder meets them. Gated to at most once per day per
// slot so it never spams.
//
// React-free + native-free so it runs under ts-jest (mirrors nudgePriority.ts).

export type NudgeSlot = 'morning' | 'night';

export interface NudgeInput {
  now: Date;
  slot: NudgeSlot;
  /** The slot's reminder time as minutes-of-day (hour*60 + minute). */
  reminderMinutes: number;
  slotEnabled: boolean;
  permissionGranted: boolean;
  /** Has the user already completed this slot's prayer today? */
  alreadyPrayed: boolean;
  /** Has the background nudge already fired for this slot today? */
  firedTodayForSlot: boolean;
  /** How long BEFORE the reminder time the window opens (default 0 min — we only
   *  re-engage AFTER a missed reminder, never pre-empt the scheduled one). */
  windowBeforeMin?: number;
  /** How long AFTER the reminder time the window stays open (default 120 min). */
  windowAfterMin?: number;
}

// Window opens AT the reminder time (before = 0): the scheduled daily reminder
// already covers the lead-up, so nudging beforehand would just fire a near-
// duplicate big notification minutes before it. We only re-engage users who
// reached/passed the reminder time without praying.
const DEFAULT_BEFORE = 0;
const DEFAULT_AFTER = 120;

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Which slot a given moment belongs to — morning before 15:00, night after.
 *  Mirrors the app's morning/evening split so we pick the right reminder time. */
export function activeSlotFor(now: Date): NudgeSlot {
  return now.getHours() < 15 ? 'morning' : 'night';
}

/** True only when EVERY gate passes: the slot is on, permission is granted, the
 *  user hasn't prayed it today, we haven't already fired today, and `now` sits
 *  inside the slot's [reminder − before, reminder + after] window. */
export function shouldScheduleBackgroundNudge(i: NudgeInput): boolean {
  if (!i.slotEnabled || !i.permissionGranted) return false;
  if (i.alreadyPrayed || i.firedTodayForSlot) return false;
  const before = i.windowBeforeMin ?? DEFAULT_BEFORE;
  const after = i.windowAfterMin ?? DEFAULT_AFTER;
  const m = minutesOfDay(i.now);
  return m >= i.reminderMinutes - before && m <= i.reminderMinutes + after;
}
