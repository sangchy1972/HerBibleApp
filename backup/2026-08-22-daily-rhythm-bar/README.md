# Daily Rhythm bar — removed 2026-08-22 (owner)

The home screen's top block ("Evening prayer completes your day" + Start +
5-segment progress bar) was removed wholesale and replaced by the week
date-strip (`src/components/home/WeekFireStrip.tsx`: date numbers, sapling
final-frame for one prayer, flame for both).

Files here are the complete removed implementation, kept for reference only:
- `DailyRhythmBar.tsx` — the bar component (pill, segments, celebrate flight)
- `dailyRhythm.ts` — the pure 5-step selector (computeRhythm, packedRhythmFill)

NOTHING imports this folder; `tsconfig.json` excludes it and `.easignore`
keeps it off EAS build workers, so none of it can reach a bundle. The
first-run tour's 'rhythm' step and the `rhythm.*` i18n keys were deleted
outright (recoverable from git history, this commit's parent).
