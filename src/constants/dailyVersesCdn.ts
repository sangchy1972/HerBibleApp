// Where the full per-language daily-verses files live. Mirrors the corpus
// pattern: GitHub repo served via jsDelivr, pinned by commit SHA so cache
// keys auto-invalidate on every bump.
//
// Upload steps (one-time, then on every content update):
//   1. Push the seven `verses_<lang>.json` files into the repo below at the
//      path `daily-verses/verses_<lang>.json`.
//   2. Replace DAILY_VERSES_COMMIT with the new commit SHA.
//   3. The next app launch picks up the new files and refreshes its cache.

export const DAILY_VERSES_REPO = 'sangchy1972/pd-text-corpus';

// TODO(content): bump after pushing the verses_*.json files. Until then,
// fetches will 404 and the bundled 3-day fallback (BUNDLED_DAILY_VERSES)
// keeps the prayer flow working offline.
export const DAILY_VERSES_COMMIT = 'PLACEHOLDER_COMMIT_SHA';

export function dailyVersesUrl(lang: string): string {
  return `https://cdn.jsdelivr.net/gh/${DAILY_VERSES_REPO}@${DAILY_VERSES_COMMIT}/daily-verses/verses_${lang}.json`;
}
