// Where the full per-language daily-verses files live: Cloudflare R2,
// served directly from the dedicated `herbible-verses-7languages` bucket
// via its custom domain `verses.everlandapps.com` (zero egress, no Worker
// in front — daily verses are free core content, so a Worker would just
// add request cost for nothing). The dedicated bucket keeps naming
// consistent with herbible-audio-7languages / herbible-plans-7languages.
//
// Cache-busting uses a **path-version segment** (`/v1/`), NOT a query
// param: Cloudflare keys its edge cache on the full URL, so bumping the
// version points every request at a brand-new path → guaranteed-fresh
// edge cache with no manual purge. The same version string also tags the
// device-local AsyncStorage cache (see dailyVersesService.CACHE_TAG), so
// a bump invalidates every device's copy too.
//
// Publish steps (one-time, then on every content update):
//   1. Generate slim CDN files:  node scripts/gen_cdn_verses.mjs ./_incoming_verses ./_cdn_ready
//   2. Upload:  ./scripts/upload_daily_verses_r2.sh
//      (puts the seven files at  <VERSION>/verses_<lang>.json  in the bucket)
//   3. If the content changed (not just a first publish), bump
//      DAILY_VERSES_VERSION below to the new /vN/ folder.
//   4. The next app launch picks up the new files and refreshes its cache.

export const DAILY_VERSES_BASE = 'https://verses.everlandapps.com';

// Content version. Lives in the URL path AND doubles as the local
// cache-key tag. Bump (v1 → v2 → …) whenever you republish updated files
// under a new /vN/ folder on R2.
export const DAILY_VERSES_VERSION = 'v1';

export function dailyVersesUrl(lang: string): string {
  return `${DAILY_VERSES_BASE}/${DAILY_VERSES_VERSION}/verses_${lang}.json`;
}
