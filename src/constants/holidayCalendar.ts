// Holiday daily-verse override calendar.
//
// On these dates the home Daily Verse — and its meditation / action step /
// prayer in the prayer flow — is replaced by a holiday-specific reading
// (see holiday_daily_verse_<lang>.json on the CDN, keyed by holiday_id).
//
// Dates are PRE-COMPUTED (fixed feasts + movable ones via the Western Easter
// computus) for 2026 (from Jun 1 onward, per product) and 2027. To extend,
// append later years — the values are `special_occasion.holiday_id` strings
// that match the holiday JSON.
//
//   key   = "YYYY-MM-DD" in the device's LOCAL timezone (matches the same
//           ymd() the daily-verse day-cycle uses, so "today" lines up).
//   value = holiday_id
export const HOLIDAY_BY_DATE: Record<string, string> = {
  // ── 2026 (from Jun 1) ───────────────────────────────────────────────
  '2026-11-26': 'thanksgiving',
  '2026-11-29': 'advent_first_sunday',
  '2026-12-25': 'christmas',
  '2026-12-31': 'new_year_eve',
  // ── 2027 ────────────────────────────────────────────────────────────
  '2027-01-01': 'new_year',
  '2027-02-10': 'ash_wednesday',          // Easter 2027 = Mar 28; −46d
  '2027-03-21': 'palm_sunday',            // −7d
  '2027-03-26': 'good_friday',            // −2d
  '2027-03-28': 'easter',
  '2027-05-16': 'pentecost',              // +49d
  '2027-11-25': 'thanksgiving',           // 4th Thu of Nov
  '2027-11-28': 'advent_first_sunday',    // 4th Sun before Christmas
  '2027-12-25': 'christmas',
  '2027-12-31': 'new_year_eve',
};

// holiday_id for the given local "YYYY-MM-DD", or null on an ordinary day.
export function holidayIdForYmd(ymd: string): string | null {
  return HOLIDAY_BY_DATE[ymd] ?? null;
}
